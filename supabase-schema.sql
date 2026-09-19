-- ============================================================
-- EcoBite — run once in Supabase: SQL Editor -> New query
-- (Safe to re-run: every statement below is idempotent.)
--
-- Auth itself (email/password, sessions) is handled by Supabase's
-- built-in auth.users table. This file:
--   1. creates a profiles table extending each account with the
--      optional role-specific details completed after sign-up,
--   2. locks it down with row-level security (you only ever see
--      and edit your own row),
--   3. installs a trigger that creates the profile row the moment
--      a user signs up, from the details signup.html passes as
--      sign-up metadata (sb.auth.signUp({ options: { data } })).
--
-- Creating the row inside the database matters: when email
-- confirmation is on, the browser has no session yet right after
-- signUp, so a client-side insert runs as anonymous and RLS
-- rightly blocks it ("new row violates row-level security policy").
-- The trigger runs as the table owner instead, with the details
-- already attached to the user.
-- ============================================================

-- ---- 1. Table -------------------------------------------------

-- Required for gen_random_uuid() used by food_offers below.
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.ecobite_role as enum ('donor', 'org', 'driver');
exception
  when duplicate_object then null;  -- type already exists from a previous run
end $$;

create table if not exists public.profiles (
  id               uuid references auth.users(id) on delete cascade primary key,
  role             public.ecobite_role,
  full_name        text not null,
  city             text not null,  -- kept in sync with district (dashboard matching)
  country          text,           -- chosen from the Country dropdown at sign-up
  pincode          text,           -- postal / PIN code entered at sign-up
  state            text,           -- auto-filled from pincode (editable)
  district         text,           -- auto-filled from pincode (editable)
  org_name         text,           -- donor: business name / org: organisation name
  org_kind         text,           -- donor: restaurant, grocer, bakery...
  reach            text,           -- org: people served per week
  storage          text[],         -- org: chilled / frozen / dry / same-day
  surplus_windows  text[],         -- donor: when surplus usually shows up
  transport        text,           -- driver: on foot / bike / car / van
  availability     text[],         -- driver: when they're usually free
  created_at       timestamptz not null default now()
);

-- `create table if not exists` does not add fields to a table created by an
-- earlier version of this script. Keep these migrations explicit so this file
-- is safe for both fresh and existing projects.
alter table public.profiles add column if not exists role public.ecobite_role;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists address_line2 text;
alter table public.profiles add column if not exists landmark text;
alter table public.profiles add column if not exists avatar_url text;
-- "Tell me when food is donated near me" — per-channel opt-in.
alter table public.profiles add column if not exists notify_email boolean not null default true;
alter table public.profiles add column if not exists notify_in_app boolean not null default true;

-- Split any existing single full_name into first / last so the new Profile
-- form is populated for accounts created before this change.
update public.profiles
   set first_name = coalesce(first_name, nullif(split_part(trim(full_name), ' ', 1), '')),
       last_name  = coalesce(last_name,
                      nullif(trim(substring(trim(full_name) from position(' ' in trim(full_name)) + 1)), ''))
 where full_name is not null and (first_name is null or last_name is null);
alter table public.profiles add column if not exists pincode text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists district text;
alter table public.profiles add column if not exists org_name text;
alter table public.profiles add column if not exists org_kind text;
alter table public.profiles add column if not exists reach text;
alter table public.profiles add column if not exists storage text[];
alter table public.profiles add column if not exists surplus_windows text[];
alter table public.profiles add column if not exists transport text;
alter table public.profiles add column if not exists availability text[];
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- city is only filled from the district now, so an OAuth sign-up (Google)
-- that carries no location yet must be allowed to create a row.
alter table public.profiles alter column city drop not null;
alter table public.profiles alter column full_name drop not null;

-- Existing installs created role as required; the lightweight signup now lets
-- people choose it from Profile or Settings later.
alter table public.profiles alter column role drop not null;

-- ---- 2. Row-level security ------------------------------------

alter table public.profiles enable row level security;

-- Everyone can only ever see, create, or edit their own row —
-- never anyone else's.
drop policy if exists "Individuals can view their own profile" on public.profiles;
create policy "Individuals can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Individuals can insert their own profile" on public.profiles;
create policy "Individuals can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Individuals can update their own profile" on public.profiles;
create policy "Individuals can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---- 3. Auto-create the profile on sign-up ---------------------

-- Turns the JSON arrays from the sign-up form (checkbox lists)
-- into Postgres text[] columns. Missing or non-array values
-- quietly become '{}'.
create or replace function public.jsonb_to_text_array(v jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(x.value order by x.ord), '{}'::text[])
  from jsonb_array_elements_text(
         case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end
       ) with ordinality as x(value, ord)
$$;

-- security definer: runs as the table owner, so the insert can't be
-- tripped up by RLS or by the session not existing yet mid-signup.
-- search_path is pinned to empty so the function can't be hijacked
-- by a maliciously named object in another schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := new.raw_user_meta_data;
begin
  insert into public.profiles (
    id, role, full_name, first_name, last_name, avatar_url,
    city, country, pincode, state, district,
    org_name, org_kind, reach, storage, surplus_windows,
    transport, availability
  ) values (
    new.id,
    case when meta->>'role' in ('donor','org','driver')
         then (meta->>'role')::public.ecobite_role
         else null end,
    -- Google returns the display name as 'name' / 'full_name'.
    coalesce(nullif(meta->>'full_name',''), nullif(meta->>'name',''), ''),
    -- Google sends given_name / family_name; the sign-up form sends one name.
    coalesce(nullif(meta->>'first_name',''), nullif(meta->>'given_name',''),
             nullif(split_part(coalesce(meta->>'full_name', meta->>'name', ''), ' ', 1), '')),
    coalesce(nullif(meta->>'last_name',''), nullif(meta->>'family_name',''),
             nullif(trim(substring(coalesce(meta->>'full_name', meta->>'name', '')
                    from position(' ' in coalesce(meta->>'full_name', meta->>'name', '')) + 1)), '')),
    coalesce(nullif(meta->>'avatar_url',''), nullif(meta->>'picture','')),
    -- The sign-up form no longer asks for a city: the district is the
    -- locality EcoBite matches on, so it fills both columns.
    coalesce(nullif(meta->>'district',''), nullif(meta->>'city',''), ''),
    nullif(meta->>'country', ''),
    nullif(meta->>'pincode', ''),
    nullif(meta->>'state', ''),
    nullif(meta->>'district', ''),
    nullif(meta->>'org_name', ''),
    nullif(meta->>'org_kind', ''),
    nullif(meta->>'reach', ''),
    public.jsonb_to_text_array(meta->'storage'),
    public.jsonb_to_text_array(meta->'surplus_windows'),
    nullif(meta->>'transport', ''),
    public.jsonb_to_text_array(meta->'availability')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- 4. One-time repair ----------------------------------------
-- Creates profile rows for accounts that signed up while the old
-- (broken) setup was live, using whatever details they carry as
-- sign-up metadata. Accounts created before the metadata change
-- keep a blank role until it is completed from Profile or Settings.

insert into public.profiles (
  id, role, full_name, first_name, last_name, avatar_url,
  city, country, pincode, state, district,
  org_name, org_kind, reach, storage, surplus_windows,
  transport, availability
)
select
  u.id,
  case when u.raw_user_meta_data->>'role' in ('donor','org','driver')
       then (u.raw_user_meta_data->>'role')::public.ecobite_role
       else null end,
  coalesce(nullif(u.raw_user_meta_data->>'full_name',''), nullif(u.raw_user_meta_data->>'name',''), ''),
  coalesce(nullif(u.raw_user_meta_data->>'first_name',''), nullif(u.raw_user_meta_data->>'given_name',''),
           nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1), '')),
  coalesce(nullif(u.raw_user_meta_data->>'last_name',''), nullif(u.raw_user_meta_data->>'family_name','')),
  coalesce(nullif(u.raw_user_meta_data->>'avatar_url',''), nullif(u.raw_user_meta_data->>'picture','')),
  coalesce(nullif(u.raw_user_meta_data->>'district',''), nullif(u.raw_user_meta_data->>'city',''), ''),
  nullif(u.raw_user_meta_data->>'country', ''),
  nullif(u.raw_user_meta_data->>'pincode', ''),
  nullif(u.raw_user_meta_data->>'state', ''),
  nullif(u.raw_user_meta_data->>'district', ''),
  nullif(u.raw_user_meta_data->>'org_name', ''),
  nullif(u.raw_user_meta_data->>'org_kind', ''),
  nullif(u.raw_user_meta_data->>'reach', ''),
  public.jsonb_to_text_array(u.raw_user_meta_data->'storage'),
  public.jsonb_to_text_array(u.raw_user_meta_data->'surplus_windows'),
  nullif(u.raw_user_meta_data->>'transport', ''),
  public.jsonb_to_text_array(u.raw_user_meta_data->'availability')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---- 5. Shared food offers -------------------------------------
-- Donors create offers here. Signed-in receivers can see open offers
-- in their city and claim one; this makes data visible across devices.

create table if not exists public.food_offers (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  city text not null,
  category text not null check (category in ('prepared', 'produce', 'bakery', 'chilled')),
  food_name text not null check (char_length(trim(food_name)) > 0),
  quantity numeric not null check (quantity > 0),
  unit text not null check (unit in ('portions', 'kg', 'items', 'crates')),
  collect_by text not null,
  status text not null default 'open' check (status in ('open', 'claimed', 'collected', 'cancelled')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

-- Claim handoff details shared privately by the donor and recipient.
alter table public.food_offers add column if not exists recipient_contact_name text;
alter table public.food_offers add column if not exists recipient_phone text;
alter table public.food_offers add column if not exists pickup_address text;
alter table public.food_offers add column if not exists pickup_mode text;
alter table public.food_offers add column if not exists pickup_notes text;

create index if not exists food_offers_city_status_idx
  on public.food_offers (city, status, created_at desc);

-- Offers are matched on the district regardless of how it was typed
-- ("kakinada", "Kakinada", "KAKINADA" are the same place), so index the
-- lower-cased form that the case-insensitive lookup actually uses.
create index if not exists food_offers_city_lower_idx
  on public.food_offers (lower(city), status, created_at desc);

alter table public.food_offers enable row level security;

drop policy if exists "Users can view relevant food offers" on public.food_offers;
create policy "Users can view relevant food offers"
  on public.food_offers for select to authenticated
  using (status = 'open' or donor_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Donors can create food offers" on public.food_offers;
create policy "Donors can create food offers"
  on public.food_offers for insert to authenticated
  with check (donor_id = auth.uid());

drop policy if exists "Donors can manage their food offers" on public.food_offers;
create policy "Donors can manage their food offers"
  on public.food_offers for update to authenticated
  using (donor_id = auth.uid()) with check (donor_id = auth.uid());

drop policy if exists "Receivers can claim open food offers" on public.food_offers;
create policy "Receivers can claim open food offers"
  on public.food_offers for update to authenticated
  using (status = 'open' and recipient_id is null)
  with check (recipient_id = auth.uid() and status = 'claimed');

-- Refresh PostgREST's table/relationship cache so the browser client can use
-- public.food_offers immediately after this script has run.
notify pgrst, 'reload schema';

-- ---- 6. Nearby-donation alerts ---------------------------------------------
-- When a donor flags food, every receiver registered in the same district gets
-- a notification row. The dashboard subscribes to this table over Realtime, so
-- the alert appears without a refresh. Rows with email_status = 'pending' are
-- what an email worker (Edge Function or the FastAPI service) sends out.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'nearby_offer',
  title text not null,
  body text not null,
  offer_id uuid references public.food_offers(id) on delete cascade,
  email_status text not null default 'skipped'
    check (email_status in ('skipped', 'pending', 'sent', 'failed')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_pending_email_idx
  on public.notifications (created_at) where email_status = 'pending';

alter table public.notifications enable row level security;

drop policy if exists "People read their own notifications" on public.notifications;
create policy "People read their own notifications"
  on public.notifications for select to authenticated using (user_id = auth.uid());

drop policy if exists "People can mark their notifications read" on public.notifications;
create policy "People can mark their notifications read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- security definer: the trigger writes rows for OTHER people (the receivers),
-- which RLS would otherwise block.
create or replace function public.notify_nearby_receivers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  donor_name text;
begin
  select coalesce(nullif(p.org_name, ''), nullif(p.full_name, ''), 'An EcoBite donor')
    into donor_name
    from public.profiles p where p.id = new.donor_id;

  insert into public.notifications (user_id, kind, title, body, offer_id, email_status)
  select
    p.id,
    'nearby_offer',
    format('%s %s available near you', new.quantity, new.unit),
    format('%s just flagged %s (%s) in %s. Collect by %s.',
           donor_name, new.food_name, new.category, new.city, new.collect_by),
    new.id,
    case when p.notify_email then 'pending' else 'skipped' end
  from public.profiles p
  where p.id <> new.donor_id
    -- District match is case-insensitive: "kakinada" = "Kakinada".
    and lower(trim(coalesce(p.city, ''))) = lower(trim(coalesce(new.city, '')))
    and coalesce(p.role::text, '') in ('org', 'driver')
    and (p.notify_in_app or p.notify_email);

  return new;
end;
$$;

drop trigger if exists on_food_offer_created on public.food_offers;
create trigger on_food_offer_created
  after insert on public.food_offers
  for each row execute function public.notify_nearby_receivers();

-- ---- 7. Profile photos ------------------------------------------------------
-- A public bucket keeps the dashboard simple: only signed-in people can write,
-- and only into a folder named after their own user id.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "People manage their own avatar" on storage.objects;
create policy "People manage their own avatar"
  on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime so alerts land without a refresh.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

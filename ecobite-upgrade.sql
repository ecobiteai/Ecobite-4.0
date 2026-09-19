-- ============================================================
-- EcoBite upgrade — run in the Supabase SQL editor AFTER
-- supabase-schema.sql (and ai-backend-schema.sql if you use it).
-- Safe to run more than once.
--
-- What it adds:
--   1. Ten food categories instead of four, and a longer unit list
--   2. Exact GPS coordinates on profiles and on every food offer
--   3. Donor pickup notes and a reverse-geocoded landmark
-- ============================================================

-- ---- 1. Wider category and unit lists --------------------------------------
-- The old CHECK constraints only allowed four categories and four units.
alter table public.food_offers drop constraint if exists food_offers_category_check;
alter table public.food_offers
  add constraint food_offers_category_check check (category in (
    'prepared',    -- cooked, ready to eat
    'produce',     -- fruit and vegetables
    'bakery',      -- bread, buns, pastries
    'chilled',     -- dairy, eggs, fresh meat and fish
    'frozen',      -- anything that must stay frozen
    'dry',         -- rice, flour, pulses, oil, spices
    'beverages',   -- sealed drinks
    'packaged',    -- canned, bottled, sealed and dated
    'snacks',      -- namkeen, sweets, festival surplus
    'special'      -- baby food and special-diet items
  ));

alter table public.food_offers drop constraint if exists food_offers_unit_check;
alter table public.food_offers
  add constraint food_offers_unit_check check (unit in (
    'portions', 'plates', 'meal boxes', 'kg', 'grams',
    'litres', 'items', 'packets', 'crates', 'trays',
    'bags', 'boxes', 'bottles', 'cans', 'loaves', 'dozens'
  ));

-- ---- 2. Exact location on the profile --------------------------------------
-- Captured once from the device GPS, reused as the default pin when the person
-- donates or claims food. Only visible to the account owner (existing RLS).
alter table public.profiles add column if not exists latitude numeric;
alter table public.profiles add column if not exists longitude numeric;
alter table public.profiles add column if not exists location_accuracy_m numeric;

alter table public.profiles drop constraint if exists profiles_latitude_range;
alter table public.profiles
  add constraint profiles_latitude_range
  check (latitude is null or latitude between -90 and 90);
alter table public.profiles drop constraint if exists profiles_longitude_range;
alter table public.profiles
  add constraint profiles_longitude_range
  check (longitude is null or longitude between -180 and 180);

-- ---- 3. Coordinates on the offer itself ------------------------------------
-- pickup_*  : written by the donor when the food is flagged
-- dropoff_* : written by the receiver when the offer is claimed
-- Together they are what the live map and the driver route are drawn from.
alter table public.food_offers add column if not exists pickup_latitude numeric;
alter table public.food_offers add column if not exists pickup_longitude numeric;
alter table public.food_offers add column if not exists pickup_accuracy_m numeric;
alter table public.food_offers add column if not exists pickup_landmark text;
alter table public.food_offers add column if not exists donor_notes text;
alter table public.food_offers add column if not exists dropoff_latitude numeric;
alter table public.food_offers add column if not exists dropoff_longitude numeric;
alter table public.food_offers add column if not exists dropoff_accuracy_m numeric;

alter table public.food_offers drop constraint if exists food_offers_pickup_latitude_range;
alter table public.food_offers
  add constraint food_offers_pickup_latitude_range
  check (pickup_latitude is null or pickup_latitude between -90 and 90);
alter table public.food_offers drop constraint if exists food_offers_pickup_longitude_range;
alter table public.food_offers
  add constraint food_offers_pickup_longitude_range
  check (pickup_longitude is null or pickup_longitude between -180 and 180);
alter table public.food_offers drop constraint if exists food_offers_dropoff_latitude_range;
alter table public.food_offers
  add constraint food_offers_dropoff_latitude_range
  check (dropoff_latitude is null or dropoff_latitude between -90 and 90);
alter table public.food_offers drop constraint if exists food_offers_dropoff_longitude_range;
alter table public.food_offers
  add constraint food_offers_dropoff_longitude_range
  check (dropoff_longitude is null or dropoff_longitude between -180 and 180);

-- Open offers are listed nearest-first later on; this keeps that query cheap.
create index if not exists food_offers_pickup_point_idx
  on public.food_offers (pickup_latitude, pickup_longitude)
  where status = 'open';

-- ---- 4. Alert wording keeps the new category labels readable ---------------
create or replace function public.notify_nearby_receivers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  donor_name text;
  category_label text;
begin
  select coalesce(nullif(p.org_name, ''), nullif(p.full_name, ''), 'An EcoBite donor')
    into donor_name
    from public.profiles p where p.id = new.donor_id;

  category_label := case new.category
    when 'prepared'  then 'prepared meal'
    when 'produce'   then 'fresh produce'
    when 'bakery'    then 'bakery'
    when 'chilled'   then 'chilled / dairy'
    when 'frozen'    then 'frozen'
    when 'dry'       then 'dry goods'
    when 'beverages' then 'beverages'
    when 'packaged'  then 'packaged'
    when 'snacks'    then 'snacks & sweets'
    when 'special'   then 'baby / special diet'
    else new.category
  end;

  insert into public.notifications (user_id, kind, title, body, offer_id, email_status)
  select
    p.id,
    'nearby_offer',
    format('%s %s available near you', new.quantity, new.unit),
    format('%s just flagged %s (%s) in %s. Collect by %s.%s',
           donor_name, new.food_name, category_label, new.city, new.collect_by,
           case when new.pickup_latitude is not null
                then ' Exact pickup coordinates are on the map.' else '' end),
    new.id,
    case when p.notify_email then 'pending' else 'skipped' end
  from public.profiles p
  where p.id <> new.donor_id
    and lower(trim(coalesce(p.city, ''))) = lower(trim(coalesce(new.city, '')))
    and coalesce(p.role::text, '') in ('org', 'driver')
    and (p.notify_in_app or p.notify_email);

  return new;
end;
$$;

notify pgrst, 'reload schema';

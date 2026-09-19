// EcoBite — sends the "food donated near you" emails.
//
// The database trigger in supabase-schema.sql writes notification rows with
// email_status = 'pending'. This function drains them. Deploy it and give it a
// schedule (Supabase -> Edge Functions -> Cron, e.g. every minute):
//
//   supabase functions deploy send-offer-emails
//   supabase secrets set RESEND_API_KEY=... ECOBITE_FROM="EcoBite <ecobite.ai@gmail.com>"
//
// Any transactional email provider works — swap the fetch below for yours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!   // service role: bypasses RLS
);

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM = Deno.env.get('ECOBITE_FROM') ?? 'EcoBite <ecobite.ai@gmail.com>';
const APP_URL = Deno.env.get('ECOBITE_APP_URL') ?? 'https://ecobite.example/home.html';

Deno.serve(async () => {
  const { data: pending, error } = await supabase
    .from('notifications')
    .select('id, user_id, title, body')
    .eq('email_status', 'pending')
    .order('created_at')
    .limit(50);

  if (error) return new Response(error.message, { status: 500 });
  if (!pending?.length) return Response.json({ sent: 0 });

  let sent = 0;
  for (const row of pending) {
    // auth.users holds the address; profiles holds the name.
    const { data: account } = await supabase.auth.admin.getUserById(row.user_id);
    const email = account?.user?.email;
    if (!email) {
      await supabase.from('notifications').update({ email_status: 'skipped' }).eq('id', row.id);
      continue;
    }

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#15231A">
        <h2 style="font-family:Georgia,serif;color:#15231A;margin:0 0 10px">${row.title}</h2>
        <p style="color:#3B4E40;line-height:1.6;margin:0 0 20px">${row.body}</p>
        <a href="${APP_URL}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#F2994A;color:#241004;text-decoration:none;font-weight:700">Open EcoBite</a>
        <p style="color:#8A958C;font-size:12px;margin-top:26px">
          You get these because "Email me too" is on in your EcoBite profile.
          Questions? Reply to this email or write to ecobite.ai@gmail.com.
        </p>
      </div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: email, subject: row.title, html })
    });

    await supabase.from('notifications')
      .update({ email_status: response.ok ? 'sent' : 'failed' })
      .eq('id', row.id);
    if (response.ok) sent++;
  }

  return Response.json({ sent, considered: pending.length });
});

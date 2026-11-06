# Sign-in email: Resend SMTP runbook (#278)

Status: **prepared, not live.** The code side is done; the switch itself happens
entirely in the Resend and Supabase dashboards plus DNS, and those steps are
Adrian's alone (DNS + credentials). Nothing in this repo can turn it on.

## How sign-in email works today (audited 2026-11-02, on `main`)

- The app sends magic links with `supa.auth.signInWithOtp({ email, options:
{ emailRedirectTo } })` (`src/account/CloudSyncProvider.tsx`). The app never
  sends email itself — Supabase Auth does.
- No custom SMTP is configured, so Supabase's **built-in email sender** sends
  the link. That sender is capped project-wide (the built-in default is
  2 emails/hour); on 2026-10-21 Adrian hit `429 over_email_send_rate_limit`
  after two sends.
- There is **no `supabase/config.toml`** in this repo (`supabase/` holds only
  `functions/` and `migrations/`), so Auth settings — SMTP, rate limits, email
  templates — are **dashboard-only**. They cannot be set from code or config
  here, and no repo change can raise the limit.
- Email templates: the branded magic-link email is in the repo at
  `supabase/templates/magic_link.html` (subject and paste steps in
  `supabase/templates/README.md`, pinned by `src/authEmailTemplate.test.ts`).
  It is pasted by hand at **Authentication → Emails → Templates → Magic
  link**. No remote images or tracking. The link expiry it states (1 hour)
  is Supabase's default **Email OTP expiration** (3600 seconds).
- The in-app rate-limit copy is already fixed (#294):
  `src/account/signInErrors.ts` says "this can take up to an hour" (never
  "wait a minute"), and `signInErrors.test.ts` pins that. The copy stays true
  at 60/hour — the limit is still per hour, just higher.

## What changes for Resend SMTP — all dashboard-side

Supabase project: `nelrcmbkimjjmfmgnixj`.

**Authentication → Settings → SMTP Settings** (enable custom SMTP):

| Field                     | Value                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sender email              | `login@mail.hirobius.com`                                                                                                                     |
| Sender name               | `Roleflame` (`src/brand.ts`; #278 originally said Roleforge)                                                                                  |
| Host                      | `smtp.resend.com`                                                                                                                             |
| Port                      | `465`                                                                                                                                         |
| Username                  | `resend`                                                                                                                                      |
| Password                  | the Resend API key (sending-only, restricted to `mail.hirobius.com`) — entered by Adrian in the dashboard only, never in chat or in this repo |
| Minimum interval per user | leave at the default                                                                                                                          |

**Authentication → Rate Limits:**

| Field                | Value |
| -------------------- | ----- |
| Emails sent per hour | `60`  |

No code or config change in this repo can apply either setting. The repo
holds the email text only (`supabase/templates/`).

## Adrian's steps (exact order)

1. **Confirm the domain in Resend.** https://resend.com/domains — check
   `mail.hirobius.com` (account: adrian@hirobius.com, created 2026-10-21;
   region us-east-1, tracking off). If it is not listed, add it with those
   settings. Its status will read unverified / `not_started` until step 2.
2. **Add the DNS records Resend shows for that domain** at hirobius.com's DNS
   host. Resend's domain page lists the exact records (DKIM TXT, the `send`
   subdomain MX + SPF TXT, and a DMARC TXT for `mail`). **Copy the values
   exactly from your Resend dashboard** — the DKIM value is generated for
   this domain and the dashboard copy is the source of truth. (The same five
   records are also tabled in #278.)
3. **Wait for Verified.** Back at https://resend.com/domains, click Verify /
   wait until `mail.hirobius.com` shows **Verified**.
4. **Create the sending key.** https://resend.com/api-keys → Create API key:
   permission **Sending access**, domain **mail.hirobius.com** only. Copy it —
   you paste it once, in step 5, into Supabase. Never paste it in chat.
5. **Supabase: turn on custom SMTP.** Dashboard → project
   `nelrcmbkimjjmfmgnixj` → **Authentication → Settings → SMTP Settings** →
   enable custom SMTP and fill the table above (password = the key from
   step 4) → Save.
   Direct: https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/auth/smtp
6. **Supabase: raise the limit.** **Authentication → Rate Limits** →
   **Emails sent per hour** = `60` → Save.
   Direct: https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/auth/rate-limits
7. **Supabase: paste the template.** **Authentication → Emails →
   Templates → Magic link** → Subject `Your Roleflame sign-in link`, body =
   all of `supabase/templates/magic_link.html` → Save.
8. **Test end to end.** On the live app, request a sign-in link for your own
   email. Done means: the email arrives **from `login@mail.hirobius.com`**,
   the link signs you in, and the send shows **delivered** at
   https://resend.com/emails.

Until step 8 passes, #278 stays open — the repo side being merged does not
mean sign-in email has moved.

## Notes

- The same verified domain is meant for studio-wide app email later (Ops
  alerts, client-site form notices). Cold outreach gets its own subdomain —
  never this one.
- If a send fails after the switch, check in this order: domain still
  Verified in Resend → the key is sending-only and scoped to
  `mail.hirobius.com` → SMTP fields match the table exactly (port 465,
  username `resend`).

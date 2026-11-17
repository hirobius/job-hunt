# Sign-in email (Resend) and CAPTCHA (hCaptcha): the steps for Adrian

Issue: #278. Written 2026-11-15. This file replaces the step list in
[`resend-smtp-runbook.md`](resend-smtp-runbook.md); that file keeps the audit of how sign-in email
works.

## Rules for keys

- Adrian enters each key himself, in the dashboard of the service that needs it.
- Do not put a key in this repo, in a chat, in an issue or in a pull request.
- There are three keys. Two are secrets. One is public.

| Key               | Secret? | Where it goes                                               |
| ----------------- | ------- | ----------------------------------------------------------- |
| Resend API key    | Yes     | Supabase dashboard, SMTP password field. Nowhere else.      |
| hCaptcha secret   | Yes     | Supabase dashboard, CAPTCHA secret field. Nowhere else.     |
| hCaptcha site key | No      | Vercel, the variable `VITE_HCAPTCHA_SITEKEY`. It is public. |

The build stops if `VITE_HCAPTCHA_SITEKEY` holds a value that is not a site key. This protects
against a secret pasted into the public variable. If that occurs, make a new secret in hCaptcha.

## What the code does

- With no site key, the sign-in screen is the same as before. No hCaptcha script loads.
- With a site key, the sign-in screen gets an hCaptcha token before each "Send link" and each
  "Resend". The token goes to Supabase with the request. No checkbox shows. hCaptcha shows a
  challenge only when it wants one.
- "Continue with Google" and "Continue with LinkedIn" do not use a token. Supabase does not check
  a CAPTCHA for them.
- A token that the app sends is ignored by Supabase until you turn on the check in Supabase.

## The order that prevents a lockout

Supabase refuses each sign-in email that has no token, from the moment you turn on its CAPTCHA
check. Thus the live site must send tokens first.

1. Part A and Part B (email) are independent of the CAPTCHA. Do them at any time.
2. Do Part C (hCaptcha account).
3. Do Part D (site key in Vercel, then deploy). Do the test at the end of Part D.
4. Only then do Part E (turn on the check in Supabase).

Do not do Part E before Part D is live and tested.

## Part A: Resend

The DNS record values are in issue #278 (the table in the issue text). The Resend dashboard shows
the same records. If the two are different, use the values from the Resend dashboard.

1. Open https://resend.com/domains.
2. Make sure that the domain `mail.hirobius.com` is in the list. If it is not, add it (region
   us-east-1, open tracking off, click tracking off).
3. Open the DNS settings of `hirobius.com` at its DNS host.
4. Add the DKIM record (TXT) from #278.
5. Add the MX record for `send.mail` from #278.
6. Add the SPF record (TXT) for `send.mail` from #278.
7. Add the CNAME record from #278, if the Resend dashboard shows it.
8. Add the DMARC record (TXT) from #278.
9. Go back to https://resend.com/domains.
10. Select **Verify** for `mail.hirobius.com`.
11. Wait until the status is **Verified**. DNS changes can take some hours.
12. Open https://resend.com/api-keys.
13. Select **Create API key**.
14. Set the permission to **Sending access**.
15. Set the domain to `mail.hirobius.com` only.
16. Create the key.
17. Copy the key. You use it one time, in Part B, step 8.

## Part B: Supabase, SMTP and the email limit

Project: `nelrcmbkimjjmfmgnixj`.

1. Open https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/auth/smtp
   (Authentication → SMTP settings).
2. Turn on **Enable custom SMTP**.
3. Set **Sender email address** to `login@mail.hirobius.com`. <!-- pii-allow: the sending address of the app, not a person -->
4. Set **Sender name** to `roleflame` (the name in `src/brand.ts`; not "Roleforge").
5. Set **Host** to `smtp.resend.com`.
6. Set **Port number** to `465`.
7. Set **Username** to `resend`.
8. Paste the Resend API key into **Password**.
9. Select **Save**.
10. Open https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/auth/rate-limits
    (Authentication → Rate limits).
11. Set the limit for sent emails to `60` for each hour.
12. Select **Save**.
13. Optional: paste the email template. The steps are in `supabase/templates/README.md`.

Test for Part B:

1. Open https://roleflame.vercel.app in a private window.
2. Ask for a sign-in link for your own address.
3. Make sure that the email comes from `login@mail.hirobius.com`. <!-- pii-allow: the sending address of the app -->
4. Make sure that the link signs you in.
5. Open https://resend.com/emails. Make sure that the email shows **Delivered**.

Rollback for Part B: turn off **Enable custom SMTP** and save. Supabase then sends with its own
sender again (limit: 2 emails for each hour).

## Part C: hCaptcha account

The names of the hCaptcha dashboard pages can change. The result that you need is one site key and
one secret.

1. Open https://dashboard.hcaptcha.com and sign in (or make an account).
2. Add a new site.
3. Give the site the hostname `roleflame.vercel.app`.
4. Save the site.
5. Copy the **site key** of that site. It is a UUID (five groups of letters and digits).
6. Open the account settings.
7. Copy the **secret**. Keep it for Part E. Do not put it in Vercel.

## Part D: Vercel, the public site key

Do this only after the pull request with the CAPTCHA code is merged and live.

1. Open the Vercel project of roleflame.
2. Open **Settings → Environment Variables**.
3. Add a variable with the name `VITE_HCAPTCHA_SITEKEY`.
4. Paste the hCaptcha **site key** as the value.
5. Select the **Production** environment only.
6. Save the variable.
7. Open **Deployments**.
8. Open the menu of the newest Production deployment.
9. Select **Redeploy**. (This is one production build.)
10. Wait until the deployment is **Ready**.

Test for Part D (the Supabase check is still off):

1. Open https://roleflame.vercel.app in a private window.
2. Open the sign-in screen.
3. Make sure that this line shows at the bottom: "This site is protected by hCaptcha and its
   Privacy policy and Terms of service apply."
4. Ask for a sign-in link.
5. If hCaptcha shows a challenge, complete it. Make sure that you can select its controls.
6. Make sure that "Check your email" shows and that the email arrives.
7. Open the browser console. Make sure that there is no "Content Security Policy" error.
8. Do steps 1 to 6 again on a phone.

If a step fails, do not do Part E. Do the rollback for Part D.

Rollback for Part D:

1. Delete the variable `VITE_HCAPTCHA_SITEKEY` in Vercel.
2. Redeploy the newest Production deployment.

## Part E: Supabase, turn on the CAPTCHA check

1. Open https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/auth/protection
   (Authentication → Attack Protection; some pages call it "Bot and Abuse Protection").
2. Turn on **Enable CAPTCHA protection**.
3. Set the provider to **hCaptcha**.
4. Paste the hCaptcha **secret**.
5. Select **Save**.

Test for Part E: do the test list below immediately.

Rollback for Part E (do this first if sign-in fails for any person):

1. Open the same Supabase page.
2. Turn off **Enable CAPTCHA protection**.
3. Select **Save**. Sign-in emails work again immediately, with or without a token.

To remove the CAPTCHA fully, do the rollback for Part E first, then the rollback for Part D. Do
not do them in the opposite order.

## Test list (after Part E)

1. Private window, desktop: ask for a sign-in link. The email arrives. The link signs you in.
2. On "Check your email", wait 30 seconds and select **Resend**. A second email arrives.
3. Phone: do test 1 again.
4. Select **Continue with Google**. Sign-in works.
5. Select **Continue with LinkedIn**. Sign-in works.
6. Turn on a content blocker that blocks hCaptcha, then select **Send link**. This message shows:
   "The check that you are a person didn't load. Turn off any content blocker for this site, then
   try again." Turn off the blocker and select **Send link** again. The email arrives.
7. An account that is signed in stays signed in after a reload.
8. Open the Supabase auth logs. There is no `captcha_failed` error for your tests.

## Known limits

- A browser tab that was opened before Part D shows no hCaptcha and sends no token. After Part E,
  that tab shows "The check that you are a person didn't pass. Try again." A reload fixes it.
- A person who blocks hCaptcha cannot get a sign-in email while the check is on. Google and
  LinkedIn sign-in still work for that person.
- The Privacy policy names Resend and hCaptcha ("once it is switched on"). Merging the pull
  request approves that text.

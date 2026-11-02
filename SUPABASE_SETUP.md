# Cloud sync setup (Supabase) — ~10 minutes, one time

Until you do this, the app works exactly as before (saved in your browser only).
Once done, your shortlist syncs across your phone and laptop, protected by an
email sign-in. **You only ever do this once.**

---

## 1. Create a free Supabase project

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project** → give it a name (e.g. `job-hunt`), set a database password
   (save it somewhere; you won't need it for the app), pick the closest region,
   click **Create**. Wait ~1 minute for it to spin up.

## 2. Create the table + security (copy/paste, no thinking required)

1. Left sidebar → **SQL Editor** → **New query**.
2. Paste this in and click **Run**:

```sql
create table public.tracker (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker enable row level security;

create policy "own rows only" on public.tracker
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

That creates one row per user holding your job list, and the policy guarantees
**you can only ever read/write your own row** — even though the app's key is public.

## 3. Allow the app's URL for sign-in links

1. Left sidebar → **Authentication** → **URL Configuration**.
2. Set **Site URL** to: `https://roleforge-app.vercel.app/`
3. Under **Redirect URLs**, add the same: `https://roleforge-app.vercel.app/`, and the old
   address `https://job-hunt-jade.vercel.app/` while it still serves the app.
   (If you ever open the app from a different address, add that too.)
4. Save. (Email sign-in is on by default — nothing else to toggle.)

## 4. Grab your two public keys

1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy:
   - **Project URL** — looks like `https://abcd1234.supabase.co`
   - **anon public** key (a long string under "Project API keys")

## 5. Paste them into the app

Open `index.html`, find the **CLOUD SYNC CONFIG** block near the bottom, and fill in:

```js
window.RJB_SUPABASE = {
  url: 'https://abcd1234.supabase.co', // your Project URL
  anonKey: 'eyJhbGciOi...', // your anon public key
};
```

Commit + push (or tell me to). Once it deploys, a **Cloud sync** bar appears at the
top of the Shortlist.

## 6. Sign in

1. On the live site, type your email in the sync bar → **Email me a sign-in link**.
2. Open the email, tap the link — it bounces you back to the app, signed in.
3. Do the same on your phone with the same email. Both devices now share one list.

---

### Good to know

- **The anon key is meant to be public.** Your data is safe because of the
  row-level-security policy above + the email login — not the key.
- **Offline still works.** The list always saves to your browser first and mirrors
  to the cloud; if you're offline it just syncs next time you're back.
- **Free tier** is far more than enough for a personal job tracker.
- **Sign-in link rate limit:** Supabase's built-in email sender is capped at a
  few messages per hour for the whole project — Adrian hit that cap on
  2026-10-21. The fix (#278) is a custom SMTP sender (Resend, on
  `mail.hirobius.com`) with the Auth rate limit raised to 60/hour. Both are
  dashboard-only settings (this repo has no `supabase/config.toml`); the exact
  fields and steps are in `docs/resend-smtp-runbook.md`.
- **One small caveat:** if you _delete_ a job on one device while the other device
  is offline with an older copy, the delete may not propagate to that stale device.
  Day-to-day adding/updating syncs cleanly; this only bites in that offline-delete
  edge case.

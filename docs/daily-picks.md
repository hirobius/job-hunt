# Daily picks

The scheduled Claude run that used to publish the "Daily Job List" page now writes its picks into
the app. Today lists them above Review new (signed in only): title (links to the posting), company,
employee or contract, pay, posted day, the one-line fit, and the draft note behind a row with Copy.
Save puts the job in the Pipeline (To apply) with the draft note and fit line in its Notes. Skip
hides it (synced, with Undo).

## Data path

`public.daily_picks` (one row per pick, per user, unique by link) written only by
`public.add_daily_picks(p_token, p_picks)`, a security-definer function the run calls with the
app's public key and a feed token. Only the token's sha256 is stored (`daily_pick_feeds`). A token
adds picks for one account: at most 10 per call, 50 per day; it can't read, change or delete
anything. The app reads its own rows (RLS). Picks older than 60 days are swept by pg_cron. Delete
my data clears both tables. Migration: `supabase/migrations/20261105100000_daily_picks.sql`.

Why not `postings`: the sync closes rows whose board isn't followed (picks would close at once),
writes are service-role only (the run would need the service key), and it has no fit, note, pay or
employment columns. Why not the synced blob: the run would have to sign in as you, and its write
would race the app's three-way merge.

## Set up (once)

1. Supabase → SQL editor: run `20261105100000_daily_picks.sql`.
2. Make a token on your computer: `openssl rand -hex 32`. Keep it out of the repo.
3. SQL editor:

   ```sql
   insert into public.daily_pick_feeds (token_hash, user_id)
   select encode(sha256(convert_to('<TOKEN>', 'UTF8')), 'hex'), id
     from auth.users where email = '<your sign-in email>';
   ```

4. In the scheduled run's environment: add the env var `PICKS_TOKEN=<TOKEN>` and allow the host
   `nelrcmbkimjjmfmgnixj.supabase.co` in its network policy.
5. Replace the run's prompt with the one below, with `<PUBLISHABLE_KEY>` set to
   `SUPABASE_ANON_KEY` from `src/config.ts` (public by design; kept out of this file only so the
   pre-push secret scan stays quiet).

Rotate: `delete from public.daily_pick_feeds;` then step 3 with a new token.

## The scheduled run's prompt

```text
Every morning, find 3 to 5 design systems roles for Adrian Milsap (remote, United States;
design systems designer / engineer, design technologist, UX engineer on a system team; employee
or contract). He contracted on the Xbox Design System and builds the Hirobius Design System
(code-first, published on npm). Never send anything to anyone: drafts only.

1. Search for roles posted in the last 48 hours. Prefer the employer's own posting (Greenhouse,
   Lever, Ashby, company careers page) over aggregators. Skip anything picked on an earlier day
   (the app drops repeat links on its own, but don't spend picks on them). Skip people-management
   roles, on-site or hybrid roles, and anything over ~3 weeks old.
2. For each pick collect: company, title, employment ("employee" or "contract"), pay exactly as
   the posting states it ("" if not stated), posted date as YYYY-MM-DD (omit if not found), the
   posting link (https only), a one-line why it fits (say plainly what you couldn't verify:
   date, location, pay, US eligibility), and a short note to the hiring manager (3 to 5 sentences,
   plain language, only facts above about Adrian; no contact details, no made-up names).
3. Send the picks to the app in ONE call (1 to 10 picks):

   curl -sS -X POST "https://nelrcmbkimjjmfmgnixj.supabase.co/rest/v1/rpc/add_daily_picks" \
     -H "apikey: <PUBLISHABLE_KEY>" \
     -H "Content-Type: application/json" \
     --data-binary @picks.json

   where picks.json is:

   {"p_token": "<value of the PICKS_TOKEN environment variable>",
    "p_picks": [
      {"company": "...", "title": "...", "employment": "contract", "pay": "$75–$90/hr",
       "posted_on": "2026-11-04", "url": "https://...", "why": "...", "note": "..."}
    ]}

   Build picks.json with a script that reads PICKS_TOKEN from the environment; never print the
   token or write it anywhere else. The answer is the number of picks added (0 means all were
   repeats). "bad feed token" means PICKS_TOKEN is wrong or missing: stop and say so.
4. Finish with a 3-line summary: how many picks were sent and added, anything you couldn't
   verify, and any blocked sources. Do not publish an artifact.
```

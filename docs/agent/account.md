# Account, sign-in, privacy and app updates

Sign-in guards, OAuth, Privacy and terms, crash reports, the installable app and stale tabs.

- **Privacy and terms (#43, #47; a dialog since #471 slice 4):** one HDS `Dialog` (`LegalPage.tsx`,
  "Privacy and terms") with two HDS Tabs, Privacy policy and Terms of use, over the open page:
  `?legal=privacy|terms` (`openLegal`; a tab swaps in place, Back closes). Old `#/legal/<doc>` links
  redirect to it in place. Menu item "Privacy and terms", last before Sign out. The text is data in
  `legal.ts`; `THIRD_PARTIES` must list exactly the CSP `connect-src` hosts (`legal.test.ts` fails
  otherwise, so a new fetch host also goes there). Wording approved by Adrian 2026-10-20 (`LEGAL_DRAFT`
  false); set it true while a revision is under review. **Legal gaps revision (2026-11-13, approved by Adrian 2026-11-14, `LEGAL_DRAFT` false; migration `20261113100000` applied):** one contact,
  `CONTACT_EMAIL` info@hirobius.com (a public business address) <!-- pii-allow -->, with a Privacy requests line; Supabase and Vercel
  named as processors, Supabase's region `DATA_REGION` (us-east-2, read from the project); retention per kind
  (account until deleted, Recently removed 30 days, crash reports 90, rate-limit hashes 2, Daily picks 60); and
  **Delete my data asks in an HDS confirm (#793, 2026-11-18)**: `DeleteDataConfirm.tsx` (lazy; "Delete all your data?", Cancel underlined and in focus, Delete my data danger; Cancel, Escape, Back and the scrim delete nothing), never `window.confirm`; the session is checked again after the answer. `hdsOnly.test.ts` allows one browser dialog, the error screen's Reset.
  **Delete my data deletes the sign-in too**: migration `20261113100000_delete_my_data_auth_user.sql` ends
  `delete_my_data` with `delete from auth.users where id = uid` (after every table; the function's owner, postgres,
  may delete there), and the client then signs out with `scope: 'local'`. Apply the migration before the policy
  ships. Pinned in `account/deleteMyData.test.ts`, `account/CloudSyncProvider.test.tsx`, `legal.test.ts`. Back up is the full "download all my data" export: it carries every synced
  store, incl. the Application kit and sweep titles. Meta/OG/Twitter tags pinned in `meta.test.ts`.
  **Crash reports (#47):** `src/errorReport.ts` sends a scrubbed report (kind, message, stack, tab,
  browser; no user id, email, job text, URL query or job id; 5 per page load) to the insert-only
  Supabase table `client_errors` (`supabase/migrations/20261020_client_errors.sql`, 90-day pg_cron
  sweep) from `ErrorBoundary` and window error/rejection handlers. `installErrorReporting` in
  `main.tsx` skips localhost, so dev, E2E and the gallery never report. Read reports in the
  Supabase dashboard (Table editor → client_errors). The only door is the `report_client_error` RPC,
  limited per client (a salted hash of the gateway's IP header, never stored with a report, swept
  after 2 days) under global ceilings (`20261030100000`). **DB caps (#320):** curation tables have
  length checks, per-user row ceilings and same-user composite FKs (`20261030100100`); all pinned by
  text in `src/supabaseHardening.test.ts`.
  **Installable + share image (#47):** `public/manifest.webmanifest` (name = BRAND, standalone, no
  service worker), PNG icons (192, 512, maskable 512, 180 touch icon) and the 1200x630
  `og-image.png` are rendered by `npm run icons` (`scripts/make-icons.mjs`, headless Chromium);
  re-run it after a brand change and commit the PNGs; it also writes `/favicon.ico`. The manifest's
  install screenshots come from `npm run screenshots` (`scripts/make-screenshots.mjs`, the sample
  Pipeline at 1280x800 and 390x844). theme-color follows HDS surface-page per scheme; the body font
  is preloaded by the `preload-font` plugin (`fontPreload.ts`). Pinned in `pwa.test.ts`, `meta.test.ts`. `npm run audit` =
  `npm audit --omit=dev --audit-level=high`; run it by hand (it is not in `verify`: the Vercel build
  must not fail on a new advisory upstream).

- **Login injection guard (security audit, 2026-10-22):** supabase-js never reads the URL
  (`flowType: 'implicit'`, `detectSessionInUrl: false`). `src/authFragment.ts` (main.tsx's first
  import) takes `#access_token=…` and strips it with `replaceState` before the router, analytics or a
  crash report can see it (`errorReport` also scrubs `*_token=`). `account/authLink.ts`: a link signs
  in on its own only when this browser asked for one to the same email within 1 hour
  (`rjb_signin_request`, written by `sendLink`); any other link shows "Sign in as x@y.com?" (Cancel drops it; a full-screen step of the sign-in layout since 2026-11-08: `LinkConfirmScreen.tsx`, lazy, in `SignInShell.tsx` with the same brand at the same place as the form and "Check your email"; Sign in takes the link up at once, shows "Signed in", then the flame and wordmark move onto the app bar's logo in 350 ms, a fade under reduced motion). Then the merge guard: an account this device has no `rjb_sync_base` for, while the <!-- pii-allow -->
  device holds data (`account/deviceData.ts`), asks "Add this device's N jobs to x@y.com?" before any <!-- pii-allow -->
  pull or push; Don't add (the default, also Escape/Back) signs out locally and keeps the data.
  Nothing pulls or pushes for a user until that path has run for them (`handled` ref in
  `CloudSyncProvider`); a `TOKEN_REFRESHED`/`USER_UPDATED` skips it only for that same user (an expired
  crafted link arrives as a refresh), and a link's session for another email than it named is never
  taken up (no pull before the sign-out). The device-data count is only what the person made (`deviceData.ts`): not sample jobs, starter documents left as they came, the auto profile (kept auto when re-saved unchanged, `profile.ts` `keepAuto`) or its starter companies, the keyless feeds, work modes or sweep titles.
  **Asked once per account per device (Adrian 2026-11-15):** sign-out wipes the sync base, so
  `account/deviceAccount.ts` keeps the id (never the email) of the account this device last synced with in
  `rjb_device_account`, which sign-out's wipe keeps (`KEPT_ON_SIGN_OUT`) and Delete my data drops; that same account
  signs in again with no ask (a seed merge, the union); any other account is still asked. An auth event for the user
  already through the path (supabase-js repeats SIGNED_IN on focus or from another tab) starts nothing, so it never
  resets the sync state. **Sign-out with changes the cloud lacks** (a failed push, track writes refused or in flight)
  asks in an HDS AlertDialog (`account/SignOutConfirm.tsx`, lazy; `SIGN_OUT_UNSYNCED` in `cloudMessages.ts`:
  "Sign out and lose recent changes?", Cancel underlined, Sign out anyway danger), never `window.confirm`; nothing
  changed since the last pull or push counts as flushed. Pinned in `CloudSyncProvider.test.tsx` ("the same account on
  this device").
  Tests sign in with `addDeviceDataIfAsked()` (`test/renderAccount.tsx`); `answerSignOutAsk` answers sign-out's ask. Pinned in
  `account/authLink.test.tsx`. **Other tabs (#288):** `src/tabAccount.ts` holds the account this
  tab took through that path; when another tab signs out or in as someone else (Supabase's auth
  broadcast, the `sb-…-auth-token` storage event, or a send that finds the shared session naming
  someone else), the tab freezes: no pull/push/track write, a "Reload to continue" toast + menu
  line, and after a switch its `rjb_` writes are dropped (a sign-out keeps them: the wiped sync
  base makes the next sign-in ask; any sign-in heard while stopped, the same account too, drops them from then on, and Sign out / Delete my data re-check the session after their confirms, so they never end another tab's account). Same-user refreshes change nothing. Pinned in
  `account/tabSwitch.test.tsx`. **Forward guard (#382):** a pull that reads a blob `v` above `BLOB_VERSION`
  freezes the tab the same way (`'newerVersion'`: nothing adopted or pushed, storage guarded, "Reload to
  continue"); Sign out and Delete my data still work there (`liftNewerVersionFreeze`). Pinned in
  `account/forwardGuard.test.tsx`. Outside links only become an href when http(s) (`src/httpUrl.ts`:
  feed sources, YC websites, tiles; `sanitizeJobs` drops `javascript:`/`data:` jobs), pinned in
  `unsafeUrls.test.tsx`.
- **Continue with Google (#482):** **on since 2026-11-12** (`account/googleSignInFlag.ts` `GOOGLE_SIGN_IN_ON = true`, once the Supabase Google provider was on; it was hidden from 2026-11-07, when the provider being off led to Supabase's "Unsupported provider" 400; tests follow the default, the hidden-state test sets it off). When on, the sign-in screen's first control (`SignInDialog.tsx`, HDS secondary `Button`
  with `iconLeft={<GoogleMark />}`; `src/account/google-g.svg` is Google's G as given, its own four colours per
  Google's branding rules, the one allowed third-party svg in `brand/flame.test.tsx` `THIRD_PARTY_MARKS`).
  `useCloudSync().signInWithGoogle` → `signInWithOAuth({ provider: 'google', redirectTo: magicLinkRedirect, queryParams:
{ code_challenge, code_challenge_method: 's256' } })`: **PKCE bound to this browser** (`account/oauthPkce.ts`; review
  of #483: an unbound "started Google" note let a crafted token link sign in after an abandoned start). The verifier
  stays in `rjb_oauth_request` (10 min, taken once); the return's `?code=` is taken and stripped by `authFragment.ts`
  and swapped at `/auth/v1/token?grant_type=pkce` with that verifier, then `acceptLink` with the email the token names.
  A code with no verifier here is never sent. The shared client stays implicit (magic links on another device), and
  tokens in a hash always take the magic-link guard, Google or not. An existing
  account with the same verified email gets the Google identity (Supabase automatic linking), so the same user id
  and sync base: no merge ask. A cancelled/refused return carries `error=` in the QUERY (PKCE; a magic link's is in the
  hash): App toasts "Google sign-in was cancelled." / "…didn't work" and drops the params through the route seam.
  `oauthPkce.ts` is a lazy chunk (the entry is at its budget). Dashboard setup (Google
  Cloud OAuth client, Supabase provider, redirect allow-list) is Adrian's. Pinned in `googleSignIn.test.tsx`,
  `SignInDialog.test.tsx`, `authLinkError.test.ts`, `shell.test.tsx`.
- **Continue with LinkedIn:** **on since 2026-11-12** (`account/linkedInSignInFlag.ts` `LINKEDIN_SIGN_IN_ON = true`,
  `setLinkedInSignIn` for tests, reset in the test setup). Supabase provider `linkedin_oidc`, the same PKCE flow as
  Google: `useCloudSync().signInWithLinkedIn` and `signInWithGoogle` both call `signInWithProvider` →
  `oauthPkce.startOAuth(supa, provider, redirectTo)`; the kept record (`rjb_oauth_request`) also names the provider
  (`p`, wording only; the verifier stays the binding, taken once by `oauthSession`). A cancelled/refused return toasts
  "LinkedIn sign-in was cancelled." / "…didn't work" (`authLinkError.ts` `pendingOAuthProvider`, `oauthMessages`).
  Order on the sign-in screen: Google, LinkedIn, then the email form; both buttons sit in `.rjb-signin-google`, hidden
  while the keyboard is open or under 480px tall, and the provider error Alert sits outside it so it stays visible.
  `src/account/linkedin-in.svg` is LinkedIn's "in" bug as given (#0A66C2), allowed in `THIRD_PARTY_MARKS`. No new
  browser fetch host (the start is a navigation; the exchange is Supabase's own host). Pinned in
  `googleSignIn.test.tsx`, `SignInDialog.test.tsx`, `authLinkError.test.ts`.
- **Sign-in link errors:** a magic link that is expired or refused lands with `#error=…`;
  `account/authLinkError.ts` words it ("That sign-in link has expired. Send a new one from
  Account.") and App toasts it and replaces the hash with Companies through the route seam.
- **Stale tab after a deploy** (`staleBuild.ts`, `chunkError.ts`, `StaleBuildNotice.tsx`): every
  dynamic import goes through `importFresh` (App's `lazy`, `routeViews.ts`, `lazyDialogs.ts`,
  `loadSupabase`), plus Vite's `vite:preloadError`. A chunk that is gone raises one toast "A new
  version is ready. Reload to continue." with Reload; `ErrorBoundary` shows the same line instead of
  "Something broke"; Sign in says it inline. Reload notes the time in sessionStorage
  (`rjb_stale_reload`), and `errorReport` drops chunk errors unless one comes within 2 min of that
  reload (the reload didn't fix it). Pinned in `staleBuild.test.tsx`. A new lazy import uses
  `importFresh` too.

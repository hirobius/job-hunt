# RoleForge

A job-hunt tracker with a discovery board. Live at https://roleforge-app.vercel.app

The name is set in one place, `src/brand.ts`. It was called Apply Board before.

## What it does

It collects design-system openings from every source it can read, in one list to apply from.
Paste a job link and it lands in your Pipeline. Mark it applied, and a follow-up countdown starts.
Two tabs: **Today** (home) holds the new postings, what to apply to and what to follow up;
**Jobs** is the Pipeline. Documents keeps your messages, letters and résumés.

Everything works signed out, in the browser. An optional email sign-in syncs it across devices.

- **Today** (`#/today`, home): the scan's status (Scan now), Review new (every design-system
  posting from your Sources, newest first, as a Browse list or a Deck; Save, Skip or Not this
  company), Apply, Follow up and the New companies the scan found (Follow or Ignore). Details are
  below.
- **Onboarding**: the Search profile form. Design-system titles come filled in, remote only is on
  by default and leave-out words are optional; finishing follows the starter design-system
  companies and opens Today.
- **Pipeline** (`#/queue`): To apply with Start applying, Follow up (due first) and Next 7 days,
  then every saved job with search, Status and Sort (a table on desktop, cards on a phone). Status
  runs Saved, Applied, Interviewing, Offer, Rejected. There are seven sorts.
- **Job page** (`#/queue/<id>`): Overview (details, to-dos, notes, documents), Screening and
  Interviews, with an interview log you can add to a calendar.
- **Apply mode** (`#/apply/<id>`): one job from To apply at a time. Open application, then Mark
  applied (follow-up in 7 days) or Not a fit. Your Documents come filled for the job, and the
  Application kit holds profile fields, letters and custom answers as copy rows.
- **Company page** (`#/company/<slug>`): one company's jobs, documents and notes, linked from a
  job's Details.
- **Documents** (`#/copy-deck`, in the Account menu): résumés, cover letters, notes and outreach
  messages. Every save is a Version; one Version per kind can be marked Sent to a job. `[Variable]`
  chips fill from a picked job.
- **Screening**: fit verdict, work mode, blockers and your angle. Paste a job description
  and keyword rules suggest values. Nothing leaves the browser.
- **Your data** (Account menu): Back up and Restore as JSON, and a CSV export of every job field.
  Sample data is one click (removable) and never syncs, exports or backs up. Search profile and
  Companies (Followed and Ignored) are in the Account menu too.
- **Quick-add links**: `?add=<url>`, `?applied=<url>` and `?status=<Status>&u=<url>` work from a
  bookmarklet or phone shortcut.

### Finding jobs

- **The auto-scan** runs when the app opens (at most every 6 hours) and on Scan now. It finds
  companies (YC companies hiring now, GitHub design-system orgs, the Adele list and the seed list),
  checks their job boards with an identity check, then reads every followed board and every feed
  over every profile title.
- **Sources** are Hacker News "Who is hiring", Remotive, Jobicy, the designsystems.jobs feed and the
  Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor and Personio boards of
  companies you follow. Nothing is stored as a job until you save a posting; saving follows its
  company.
- **The Find box** (from Add job): paste a job link to save it, a board or company to follow it, or
  a title to add it to your Search profile.

### Cloud sync

Sign in with a magic link. Jobs, documents, the Search profile, Sources and your other edits sync
as one row per user. Tracks from before the Search profile live in their own tables, still read.
Row-level security guards both. Setup for the `tracker` table is in
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

- A track change the cloud refuses shows a toast, and Account has a Retry sync item.
- Refused writes are kept in a journal in your browser and replayed on the next sync.
- An empty cloud never wipes the tracks on your device.
- Sign-out warns you if anything has not synced yet.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

No secrets are needed. The Supabase URL and publishable key in `src/config.ts` are public by
design, and row-level security controls access.

## Verify it

```bash
npm run verify   # typecheck, lint, tests, build. Stops at the first failure.
npm run test:e2e # browser tests. In cloud sessions set PW_CHROMIUM_PATH.
```

Nothing runs on GitHub Actions. Vercel runs `npm run verify` as its build command, so a red check
blocks the deploy.

## Built with

Vite, React 18 and TypeScript, on Vercel. The UI is `@hirobius/design-system`, installed from
public npm. State is a small shared store saved to `localStorage`, with the route kept in the URL
hash. Security headers and a Content-Security-Policy ship from `vercel.json`.

Screenshots and the redesign story: [`docs/redesign-2026.md`](docs/redesign-2026.md).
Run `npm run gallery` to shoot every screen yourself.

## Decisions

Architecture decision records, oldest first:

- [`docs/adr/0001`](docs/adr/0001-consume-hds-via-tokens-on-mui.md): first HDS use, as tokens. Superseded by 0005.
- [`docs/adr/0002`](docs/adr/0002-ai-features-grounded-structured-output.md): the AI features. Removed in #54.
- [`docs/adr/0003`](docs/adr/0003-stay-on-vite-adopt-hds-incrementally.md): stay on Vite, adopt HDS step by step.
- [`docs/adr/0005`](docs/adr/0005-consume-hds-directly-from-public-npm.md): use HDS straight from public npm.
- [`docs/adr/0006`](docs/adr/0006-pivot-to-agnostic-pillar-driven-product.md): from a personal board to a track-driven product.
- [`docs/adr/0007`](docs/adr/0007-track-hds-latest-with-the-upgrade-tool.md): track HDS with its upgrade tool.
- [`docs/adr/0008`](docs/adr/0008-sync-user-edited-stores-in-blob-v5.md): user-edited stores sync in blob v5.
- [`docs/adr/0009`](docs/adr/0009-one-search-profile-and-sources-replace-tracks.md): one Search profile and one Sources list replace tracks and their screens.

Domain words are in [`CONTEXT.md`](CONTEXT.md). The backlog is GitHub Issues.

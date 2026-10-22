# Roleforge

A job-hunt tracker with a discovery board. Live at https://job-hunt-jade.vercel.app

The name is set in one place, `src/brand.ts`. It was called Apply Board before.

## What it does

Paste a job link and it lands in your Pipeline. Screen it, mark it applied, and a follow-up
countdown starts. Two tabs: **Companies** (home) holds your tracks and the companies you watch;
**Pipeline** opens on what to apply to and what to follow up. Documents keeps your messages,
letters and résumés.

Everything works signed out, in the browser. An optional email sign-in syncs it across devices.

- **Companies** (`#/discover`, home): your tracks. Each lists the companies you watch with their
  open roles inline (Add a company watches a board, or stars a dream company with none), Apply now
  links and an ATS search. Details are below.
- **Pipeline** (`#/queue`): To apply with Start applying, Follow up (due first) and Next 7 days,
  then every saved job with search, Status and Sort (a table on desktop, cards on a phone). Status
  runs Saved, Applied, Interviewing, Offer, Rejected. There are seven sorts. It ends with Find the
  next company.
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
  Sample data is one click (it adds a removable Sample track) and never syncs, exports or backs up.
- **Quick-add links**: `?add=<url>`, `?applied=<url>` and `?status=<Status>&u=<url>` work from a
  bookmarklet or phone shortcut.

### Companies

- **ATS search** builds Google queries from the track's ticked titles, a location and a work mode.
  It covers 18 hiring systems (Greenhouse, Lever, Workday and others) and three large per-tenant
  systems that only Google can search, plus links to the big job boards. A second set covers
  freelance, startup and remote boards. A "Contract only" switch adds the words contract,
  freelance and fractional.
- **Live postings** reads real openings when you open the tool. Sources are Hacker News "Who is
  hiring", Remotive, Jobicy and the Greenhouse, Lever, Ashby, Workable and Recruitee boards of
  companies you watch. It reads every watched board, 6 at a time, with no cap. Nothing is stored
  until you save a posting. Calibrate holds the title filter (the track's titles, ticked or not),
  leave-out terms, a pay floor and a level. Live postings and Find boards open from "More ways to
  find companies".
- **Role radar** scores each posting against the evidence you paste in. Each posting shows its fit
  and gaps, and a Strong fit filter narrows the list. "What these postings ask for" rolls up the
  common asks. Starter packs come with a directory of boards to watch.

### Cloud sync

Sign in with a magic link. Jobs, documents and your other edits sync as one row per user. Tracks
live in their own tables. Row-level security guards both. Setup for the `tracker` table is in
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

Domain words are in [`CONTEXT.md`](CONTEXT.md). The backlog is GitHub Issues.

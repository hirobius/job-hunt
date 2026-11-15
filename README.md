# roleflame

A job-application tracker and discovery board for design-systems roles.

![The Apply screen with sample jobs](docs/images/screenshot.png)

**Live:** https://roleflame.vercel.app

roleflame collects design-system openings from public job boards into one list, **Review**, where
you save or skip each posting. Saved jobs go to **Apply**, which tracks each one through applying
and following up. Everything works signed out, in the browser. An optional sign-in syncs your data.

## Stack

- Vite, React 19 and TypeScript.
- [`@hirobius/design-system`](https://github.com/hirobius/hds) (HDS) for every UI element.
- Supabase for sign-in and sync (one row per user, row-level security).
- Vitest and Playwright for tests. Vercel for hosting.

## Run it

```bash
npm ci            # needs HDS_PACKAGES_TOKEN, see CONTRIBUTING.md
npm run dev       # http://localhost:5173
npm run verify    # typecheck, lint, HDS check, unit tests, build
npm run test:e2e  # Playwright browser tests
```

## Structure

- `src/`: the app. `App.tsx` is the shell, `store.ts` the data store, `route.ts` the router.
- `src/feed/`: reads and matches postings from public job boards.
- `src/account/`: sign-in, sync, backup and restore.
- `src/tracks/`: scoring and dedupe, shared with the server sync.
- `supabase/`: migrations and the scheduled sync function.
- `api/`: one Vercel edge function, a proxy for job boards with no CORS.
- `e2e/`: Playwright tests. `scripts/`: build and check tools.
- `docs/`: [decision records](docs/adr/), [agent docs](docs/agent/README.md), specs and research.

More: [`FEATURES.md`](FEATURES.md), [`CONTEXT.md`](CONTEXT.md) (glossary),
[`SECURITY.md`](SECURITY.md), [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Agents start at [`CLAUDE.md`](CLAUDE.md).

## License

All rights reserved. No license is granted.

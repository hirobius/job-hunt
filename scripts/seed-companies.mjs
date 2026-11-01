// `npm run seed:companies`: rebuild the design-system company seed (src/feed/seed/), writing
// src/feed/data/ds-companies.json (every company, its board, evidence and licence) and
// src/feed/data/ds-seed-boards.json (the confirmed boards a design systems track watches).
// Reads Adele from the committed snapshot, the other sources live; probes boards politely (the
// probe's limiter: 6 in flight, 2 per host, 150 ms apart). Takes ~15-30 minutes.
//   node scripts/seed-companies.mjs [--dry]   (--dry prints counts, writes nothing)
// Behind a proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle>.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const data = (f) => `${root}src/feed/data/${f}`;
const { module: run } = await runnerImport(`${root}src/feed/seed/run.ts`);
// FetchError from the same module graph as run.ts, or the probe's `instanceof` check fails.
const { FetchError } = run;

const UA = { 'user-agent': 'hiraga company seed (github.com/hirobius/job-hunt)' };
async function get(url) {
  let r;
  try {
    r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new FetchError(0, url);
  }
  if (!r.ok) throw new FetchError(r.status, url);
  return r;
}

const adele = JSON.parse(await readFile(data('adele.json'), 'utf8'));
let last = 0;
const snapshot = await run.buildSnapshot({
  adele,
  fetchText: async (u) => (await get(u)).text(),
  fetchJson: async (u) => (await get(u)).json(),
  onProgress: (done, total) => {
    if (done - last >= 25 || done === total) {
      last = done;
      console.log(`resolved ${done} of ${total}`);
    }
  },
});

for (const s of snapshot.sources)
  console.log(`${s.label}: ${s.error ? `failed (${s.error})` : `${s.companies} companies`}`);
console.log(
  `companies ${snapshot.counts.companies}, boards ${snapshot.counts.boards}, confirmed ${snapshot.counts.confirmed}`,
);
if (!process.argv.includes('--dry')) {
  await writeFile(data('ds-companies.json'), `${JSON.stringify(snapshot, null, 1)}\n`);
  await writeFile(
    data('ds-seed-boards.json'),
    `${JSON.stringify(run.seedBoards(snapshot), null, 1)}\n`,
  );
  console.log('wrote src/feed/data/ds-companies.json and ds-seed-boards.json');
}

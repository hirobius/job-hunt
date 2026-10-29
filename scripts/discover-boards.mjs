// `npm run boards:discover`: rebuild the bulk board set, src/feed/data/boards.json (#src-bulk).
// Harvests board links from public sources (src/feed/bulk/harvest.ts: Hacker News through Algolia,
// GitHub job lists, job-board-aggregator's per-ATS slug lists, the Common Crawl URL index, the committed design-system seed), then asks each
// board's own API whether it is live with the probe's limiter (src/feed/bulk/discover.ts). A source
// that fails is recorded with its error and the run carries on. Probe answers are cached in
// node_modules/.cache/boards-discover.json (7 days), so a second run only asks what is new.
//   node scripts/discover-boards.mjs [--dry] [--only=hn,github,aggregator,commoncrawl,seed] [--limit=N]
//     [--from-year=2014] [--cc-indexes=2] [--cached-only] [--reuse-harvest]
// --dry prints counts and writes nothing. Takes ~20-60 minutes for ~10,000 candidates.
// Behind a proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle>.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
// --cached-only alone reuses the last run's harvest (node_modules/.cache/boards-candidates.json).
const only = new Set(
  arg(
    'only',
    ['--cached-only', '--reuse-harvest'].some((f) => process.argv.includes(f))
      ? ''
      : 'hn,github,aggregator,commoncrawl,seed',
  ).split(','),
);
const limit = Number(arg('limit', '0')) || Infinity;
const fromYear = Number(arg('from-year', '2014'));
const ccIndexCount = Number(arg('cc-indexes', '2'));
const dry = process.argv.includes('--dry');
// --cached-only: build the snapshot from the probe cache alone (an interrupted run's answers);
// boards not in it count as unknown and nothing is asked.
const cachedOnly = process.argv.includes('--cached-only');
// --reuse-harvest: probe the last run's harvest again instead of reading the sources.
const reuseHarvest = process.argv.includes('--reuse-harvest');

// One module graph (src/feed/bulk/cli.ts says why).
const M = (await runnerImport(`${root}src/feed/bulk/cli.ts`)).module;
const H = M;
const D = M;
const { createLimiter, FetchError } = M;

const UA = { 'user-agent': 'RoleForge board discovery (github.com/hirobius/job-hunt)' };
async function get(url, timeout = 30_000) {
  let r;
  try {
    r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new FetchError(0, url, e?.name === 'TimeoutError');
  }
  if (!r.ok) throw new FetchError(r.status, url);
  return r;
}
const why = (e) => (e instanceof FetchError ? `HTTP ${e.status || 'unreachable'}` : String(e));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const reports = [];
const lists = [];
const report = (id, candidates, error = '') => {
  const s = H.HARVEST_SOURCES[id];
  reports.push({ id, label: s.label, url: s.url, licence: s.licence, candidates, error });
  console.log(`${s.label}: ${error ? `failed (${error})` : `${candidates} board links`}`);
};

// Hacker News: each term, a year at a time; a window over Algolia's 1000-hit cap is split.
if (only.has('hn')) {
  const found = [];
  const errors = new Set();
  const queue = H.hnWindows(fromYear, new Date());
  let asked = 0;
  while (queue.length) {
    const w = queue.shift();
    try {
      const body = await (await get(H.hnUrl(w))).json();
      asked++;
      if (H.hnHitCount(body) > H.HN_MAX_HITS) {
        const halves = H.splitWindow(w);
        if (halves) {
          queue.unshift(...halves);
          continue;
        }
      }
      found.push(...H.parseHnPage(body));
    } catch (e) {
      errors.add(why(e));
    }
    // Algolia allows ~10k an hour; stay far under it.
    await sleep(150);
    if (asked % 50 === 0) console.log(`hn: ${asked} searches, ${found.length} links`);
  }
  lists.push(found);
  report('hn', found.length, found.length ? '' : [...errors].join(', '));
}

if (only.has('github')) {
  const found = [];
  const errors = [];
  for (const l of H.GITHUB_LISTS) {
    try {
      const r = await get(l.url, 120_000);
      found.push(
        ...(l.kind === 'simplify'
          ? H.parseSimplifyListings(await r.json())
          : H.parseTextList(await r.text())),
      );
    } catch (e) {
      errors.push(`${l.url.split('/').slice(3, 5).join('/')}: ${why(e)}`);
    }
  }
  lists.push(found);
  report('github', found.length, found.length ? '' : errors.join(', '));
  if (found.length && errors.length) console.log(`  not read: ${errors.join(', ')}`);
}

if (only.has('aggregator')) {
  const found = [];
  const errors = [];
  for (const l of H.AGGREGATOR_LISTS) {
    try {
      found.push(...H.parseSlugList(await (await get(l.url, 120_000)).json(), l.kind));
    } catch (e) {
      errors.push(`${l.kind}: ${why(e)}`);
    }
  }
  lists.push(found);
  report('aggregator', found.length, found.length ? '' : errors.join(', '));
  if (found.length && errors.length) console.log(`  not read: ${errors.join(', ')}`);
}

if (only.has('commoncrawl')) {
  const found = [];
  let error = '';
  try {
    const indexes = H.ccIndexes(await (await get(H.CC_COLLINFO)).json(), ccIndexCount);
    for (const index of indexes)
      for (const pattern of H.CC_PATTERNS) {
        const pages = H.ccPageCount(await (await get(H.ccPagesUrl(index, pattern), 60_000)).text());
        for (let p = 0; p < pages; p++) {
          try {
            found.push(
              ...H.parseCdx(await (await get(H.ccUrl(index, pattern, p), 120_000)).text()),
            );
          } catch (e) {
            console.log(`  cc ${index} ${pattern} page ${p}: ${why(e)}`);
          }
          // Common Crawl asks for one request at a time and no hammering.
          await sleep(1000);
        }
      }
  } catch (e) {
    error = why(e);
  }
  lists.push(found);
  report('commoncrawl', found.length, found.length ? '' : error || 'no URLs');
}

if (only.has('seed')) {
  const seed = JSON.parse(await readFile(`${root}src/feed/data/ds-companies.json`, 'utf8'));
  const found = H.parseSeed(seed);
  lists.push(found);
  report('seed', found.length);
}

const candFile = `${root}node_modules/.cache/boards-candidates.json`;
let candidates;
if ((cachedOnly || reuseHarvest) && !lists.length) {
  candidates = JSON.parse(await readFile(candFile, 'utf8'));
  reports.push(...JSON.parse(await readFile(`${candFile}.sources`, 'utf8')));
} else {
  candidates = H.mergeCandidates(lists);
  await mkdir(`${root}node_modules/.cache`, { recursive: true });
  await writeFile(candFile, JSON.stringify(candidates));
  await writeFile(`${candFile}.sources`, JSON.stringify(reports));
}
console.log(`candidates: ${candidates.length} distinct boards`);
if (candidates.length > limit) candidates = candidates.slice(0, limit);

const cacheFile = `${root}node_modules/.cache/boards-discover.json`;
let cache = new Map();
try {
  cache = new Map(Object.entries(JSON.parse(await readFile(cacheFile, 'utf8'))));
} catch {
  /* first run */
}
const saveCache = async () => {
  await mkdir(`${root}node_modules/.cache`, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(Object.fromEntries(cache)));
};
const timer = setInterval(() => void saveCache(), 60_000);

let last = 0;
const started = Date.now();
const validated = await D.validateCandidates(candidates, {
  fetchJson: async (u) => (await get(u, 20_000)).json(),
  cachedOnly,
  limiter: createLimiter(),
  now: () => new Date(),
  cache,
  onProgress: (done, total) => {
    if (done - last >= 250 || done === total) {
      last = done;
      console.log(
        `checked ${done} of ${total} (${((Date.now() - started) / 60e3).toFixed(1)} min)`,
      );
    }
  },
});
clearInterval(timer);
await saveCache();

const set = D.buildBoardSet(validated, reports, new Date());
console.log(JSON.stringify(set.counts));
console.log(`unknown by host: ${JSON.stringify(validated.unknownByHost)}`);
console.log(`confirmed live boards: ${set.boards.length}`);
if (!dry) {
  // One board per line keeps the diff of a re-run readable.
  const body = [
    '{',
    ` "generated": ${JSON.stringify(set.generated)},`,
    ` "note": ${JSON.stringify(set.note)},`,
    ` "sources": ${JSON.stringify(set.sources)},`,
    ` "counts": ${JSON.stringify(set.counts)},`,
    ' "boards": [',
    set.boards.map((b) => `  ${JSON.stringify(b)}`).join(',\n'),
    ' ]',
    '}',
    '',
  ].join('\n');
  await writeFile(`${root}src/feed/data/boards.json`, body);
  console.log('wrote src/feed/data/boards.json');
}

/* global window -- observe() and the page.evaluate callbacks run in the browser */
// Load benchmark: LCP, TBT and CLS for Companies and Pipeline at 390x844 on a throttled phone
// (4x CPU, 150 ms RTT, 1.6 Mbps down: Lighthouse's mobile profile), cold (new browser profile)
// and warm (same profile, assets from the HTTP cache). Serves dist/ with Vercel's cache headers.
//
//   npm run build && npm run perf                 # 5 runs per cell, medians
//   npm run perf -- --runs=9 --json=perf.json     # more runs, raw numbers to a file
//
// Outside requests (analytics, logos, job boards) are aborted so runs compare like with like.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const RUNS = Number(args.runs ?? 5);
const DIST = args.dist ?? new URL('../dist/', import.meta.url).pathname;
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH ||
  (await stat(CLOUD_CHROMIUM).then(
    () => CLOUD_CHROMIUM,
    () => undefined,
  ));

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(DIST, path.endsWith('/') ? 'index.html' : path);
    try {
      const raw = await readFile(file);
      // Brotli like Vercel's edge, so transfer sizes match production.
      const br = /\.(js|css|html|svg|json|webmanifest)$/.test(file);
      const body = br ? brotliCompressSync(raw) : raw;
      res.writeHead(200, {
        ...(br ? { 'content-encoding': 'br' } : {}),
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

/** Runs in the page before the app: buffers LCP, CLS, long tasks and FCP. */
function observe() {
  const m = (window.__perf = { lcp: 0, cls: 0, longTasks: [], fcp: 0 });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      m.lcp = e.startTime;
      m.lcpEl = e.element?.outerHTML.slice(0, 120);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      m.cls += e.value;
      (m.shifts ??= []).push([
        Math.round(e.startTime),
        +e.value.toFixed(3),
        e.sources.map((s) => [
          s.node?.outerHTML?.slice(0, 80),
          Math.round(s.previousRect.y),
          Math.round(s.currentRect.y),
          Math.round(s.previousRect.height),
          Math.round(s.currentRect.height),
        ]),
      ]);
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) m.longTasks.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
}

/** Aborts every outside request (all https; the app is served over http). Not page.route: Playwright turns the HTTP cache off while a
 *  route is set, which would void the warm runs. */
async function blockOutside(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
  return cdp;
}

async function throttle(page) {
  const cdp = await blockOutside(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

async function newContext(browser, base, storage) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(observe);
  if (storage)
    await ctx.addInitScript((s) => {
      if (localStorage.getItem('rjb_perf_seeded')) return;
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      localStorage.setItem('rjb_perf_seeded', '1');
    }, storage);
  return ctx;
}

/** Sample pipeline + the first starter track, as the gallery seeds them; returns localStorage. */
async function seedStorage(browser, base) {
  const ctx = await newContext(browser, base);
  const page = await ctx.newPage();
  await blockOutside(page);
  const click = async (role, name) => {
    const el = page.getByRole(role, { name }).first();
    if (!(await el.isVisible().catch(() => false))) return;
    await el.click({ timeout: 5000 }).catch(() => el.dispatchEvent('click'));
    await page.waitForTimeout(350);
  };
  await page.goto(`${base}/#/queue`);
  await page.waitForTimeout(1500);
  await click('button', /Try with sample data/);
  // The design-systems Search profile is made on its own (no setup screen, 2026-10-29).
  await click('tab', /^Today$/);
  await page.waitForTimeout(1400);
  const storage = await page.evaluate(() => ({ ...localStorage }));
  await ctx.close();
  return storage;
}

async function measure(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  // Settle: long tasks and late shifts after load count (Lighthouse waits for quiet too).
  await page.waitForTimeout(4000);
  const m = await page.evaluate(() => window.__perf);
  if (args.detail) {
    const d = await page.evaluate(() => ({
      res: performance
        .getEntriesByType('resource')
        .map((r) => [
          r.name.split('/').pop(),
          Math.round(r.startTime),
          Math.round(r.responseEnd),
          r.transferSize,
        ]),
    }));
    console.log(
      url,
      JSON.stringify(m.longTasks.map(([a, b]) => [Math.round(a), Math.round(b)])),
      m.fcp,
    );
    for (const r of d.res) console.log('  ', r.join('\t'));
    console.log('  LCP', Math.round(m.lcp), m.lcpEl);
    console.log('  shifts', JSON.stringify(m.shifts, null, 1));
  }
  const tbt = m.longTasks
    .filter(([start]) => start >= m.fcp)
    .reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
  return {
    fcp: Math.round(m.fcp),
    lcp: Math.round(m.lcp),
    tbt: Math.round(tbt),
    cls: +m.cls.toFixed(3),
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const server = await serve();
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath });
const storage = await seedStorage(browser, base);
const routes = { Today: '/#/today', Pipeline: '/#/queue' };
const results = {};
for (const [name, hash] of Object.entries(routes)) {
  for (const mode of ['cold', 'warm']) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await newContext(browser, base, storage);
      const page = await ctx.newPage();
      await throttle(page);
      // Warm: one visit first fills the HTTP cache (and V8's code cache), then measure a reload.
      if (mode === 'warm') {
        await measure(page, `${base}${hash}`);
        await page.goto('about:blank');
      }
      runs.push(await measure(page, `${base}${hash}`));
      await ctx.close();
    }
    results[`${name} ${mode}`] = {
      fcp: median(runs.map((r) => r.fcp)),
      lcp: median(runs.map((r) => r.lcp)),
      tbt: median(runs.map((r) => r.tbt)),
      cls: median(runs.map((r) => r.cls)),
      runs,
    };
  }
}
await browser.close();
server.close();

console.log(`\n390x844, 4x CPU, 150 ms RTT / 1.6 Mbps, median of ${RUNS}`);
console.log('| Page | FCP ms | LCP ms | TBT ms | CLS |');
console.log('| --- | --- | --- | --- | --- |');
for (const [k, r] of Object.entries(results))
  console.log(`| ${k} | ${r.fcp} | ${r.lcp} | ${r.tbt} | ${r.cls} |`);
if (args.json) await writeFile(args.json, JSON.stringify(results, null, 2));

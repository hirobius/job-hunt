// Part B review screenshots against a local `vite preview` (arg 1: base URL, arg 2: which PR, arg 3: out dir).
import { chromium } from '@playwright/test';
const [base, which, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
async function ctx(width, scheme) {
  const c = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: scheme, deviceScaleFactor: width < 600 ? 2 : 1 });
  return c;
}
async function review(width, scheme, name, deck) {
  const c = await ctx(width, scheme); const page = await c.newPage();
  const POSTS = [
    ['1', 'Orbit | Design Systems Engineer | Remote<p>Own our design system and design tokens.</p>'],
    ['2', 'Orbit | Design Systems Designer | Remote<p>Figma library and design tokens.</p>'],
    ['3', 'Lumen | Design Systems Lead | Remote<p>Lead the design system and Storybook.</p>'],
    ['4', 'Kite | UX Engineer | Remote<p>Work on our design system.</p>'],
    ['5', 'Nimbus | Backend Engineer | Remote<p>Go and Postgres.</p>'],
  ];
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => {
    const url = r.request().url();
    const json = (b) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(b) });
    if (url.startsWith('https://remotive.com/') || url.startsWith('https://jobicy.com/')) return json({ jobs: [] });
    if (url.startsWith('https://api.lever.co/')) return json([]);
    if (/^https:\/\/(boards-api\.greenhouse\.io|api\.ashbyhq\.com)\//.test(url)) return json({ jobs: [] });
    if (!url.startsWith('https://hn.algolia.com/')) return r.abort();
    if (url.includes('search_by_date')) return json({ hits: [{ objectID: '9', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01' }] });
    return json({ hits: POSTS.map(([id, text]) => ({ objectID: `p-${id}`, story_id: 9, parent_id: 9, created_at: new Date().toISOString(), comment_text: text })) });
  });
  await page.goto(base + '/#/discover');
  await page.getByRole('group', { name: 'Starter tracks' }).getByRole('checkbox', { name: 'Design Systems' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.goto(base + '/#/discover/review');
  await page.getByRole('heading', { name: 'Review new' }).waitFor();
  await page.getByText(/^Read \d+ of \d+ boards$/).waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await page.getByRole('list', { name: 'New postings' }).getByRole('listitem').first().waitFor();
  if (deck) { await page.getByRole('radio', { name: 'Deck' }).click(); await page.getByRole('article').first().waitFor(); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await c.close();
}
const JOBS = [
  { url: 'https://acme.example/jobs/lead', label: 'Design Systems Lead', company: 'Acme', status: 'Saved', added: day(-3) + 'T09:00:00.000Z', postedAt: day(-5), discoveredAt: day(-3) + 'T09:00:00.000Z', savedAt: day(-3) + 'T09:05:00.000Z', deadline: day(3) },
  { url: 'https://zenith.example/jobs/ds', label: 'Staff Design Systems Designer', company: 'Zenith', status: 'Saved', added: day(-10) + 'T09:00:00.000Z', postedAt: day(-12), savedAt: day(-10) + 'T09:00:00.000Z', deadline: day(-1) },
  { url: 'https://orbit.example/jobs/eng', label: 'Design Technologist', company: 'Orbit', status: 'Applied', applied: day(-6), added: day(-8) + 'T09:00:00.000Z', postedAt: day(-9), savedAt: day(-8) + 'T09:00:00.000Z', closedAt: day(-1) + 'T12:00:00.000Z' },
  { url: 'https://kite.example/jobs/ux', label: 'UX Engineer, Design System', company: 'Kite', status: 'Saved', added: day(-1) + 'T09:00:00.000Z', postedAt: day(-2), discoveredAt: day(-1) + 'T09:00:00.000Z', savedAt: day(-1) + 'T09:00:00.000Z' },
];
async function dates(width, scheme, name, what) {
  const c = await ctx(width, scheme); const page = await c.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript((jobs) => { if (!localStorage.getItem('rjb_shortlist')) localStorage.setItem('rjb_shortlist', JSON.stringify(jobs)); localStorage.setItem('rjb_ui_getting_started_done', '1'); }, JOBS);
  await page.goto(base + '/#/queue');
  await page.getByText('Design Systems Lead').first().waitFor();
  if (what === 'filter') {
    await page.getByRole('button', { name: /^Status/ }).first().click();
    await page.getByRole('menuitemradio', { name: 'Closing soon' }).or(page.getByRole('menuitem', { name: 'Closing soon' })).first().click();
    await page.waitForTimeout(400);
  }
  if (what === 'job') {
    await page.getByRole('link', { name: 'Design Systems Lead' }).first().click();
    await page.getByRole('heading', { name: 'Design Systems Lead' }).first().waitFor();
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: what !== 'job' ? true : true });
  await c.close();
}
if (which === '414') {
  for (const s of ['light', 'dark']) await review(390, s, `414-browse-390-${s}`);
  await review(1440, 'light', '414-browse-1440-light');
  for (const s of ['light', 'dark']) await review(390, s, `414-deck-390-${s}`, true);
} else {
  for (const s of ['light', 'dark']) await dates(390, s, `423-pipeline-390-${s}`, 'list');
  for (const s of ['light', 'dark']) await dates(390, s, `423-job-390-${s}`, 'job');
  await dates(390, 'light', '423-closing-soon-390-light', 'filter');
}
await browser.close();

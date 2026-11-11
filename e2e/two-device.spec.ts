// Two devices, one account (#593 item 10): two browser contexts signed in as the same user against
// one fake sync backend. Supabase is faked at the network (as find-signed-in.spec.ts does): the
// `tracker` row lives in this spec's memory and answers PostgREST's select / insert / conditional
// update the way CloudSyncProvider uses them, so the optimistic stamp check (another device wrote
// first → merge, then send again) runs for real. Nothing reaches the real Supabase.
//
// A device pulls the way the app does: on the window's focus event (CloudSyncProvider's re-pull on
// focus) or on a reload (the seed merge against the device's sync base, #219). The spec fires the
// focus event itself; no test-only code ships.
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';

const PROJECT = 'nelrcmbkimjjmfmgnixj';
const USER = { id: '00000000-0000-4000-8000-000000000593', email: 'two@example.test' }; // pii-allow: fake test address

const JOB_URL = 'https://jobs.lever.co/acme/593';
const JOB_TITLE = 'Acme · Lever';
const OTHER_URL = 'https://jobs.lever.co/zenith/594';

interface Row {
  data: { jobs?: { url: string; archived?: boolean }[] } & Record<string, unknown>;
  updated_at: string;
}

/** The one cloud row both devices share, the writes it took and the sends it turned down. */
function fakeCloud() {
  const cloud = { row: null as Row | null, writes: 0, conflicts: 0 };
  const ok = (route: Route, json: unknown, status = 200) =>
    route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*' } });
  async function handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    if (url.pathname === '/auth/v1/user') return ok(route, USER);
    if (url.pathname !== '/rest/v1/tracker') return ok(route, []); // no postings, picks, tiles…
    const q = url.searchParams;
    if (q.get('user_id') && q.get('user_id') !== `eq.${USER.id}`) return ok(route, []);
    const at = () => [{ updated_at: cloud.row!.updated_at }];
    if (req.method() === 'GET') {
      return ok(
        route,
        cloud.row ? [{ data: cloud.row.data, updated_at: cloud.row.updated_at }] : [],
      );
    }
    const body = req.postDataJSON() as Row | Row[];
    const next = Array.isArray(body) ? body[0] : body;
    if (req.method() === 'POST') {
      // Insert: a second device's insert after the first loses, as the unique key would.
      if (cloud.row) return ok(route, { code: '23505', message: 'duplicate key' }, 409);
      cloud.row = { data: next.data, updated_at: next.updated_at };
      cloud.writes++;
      return ok(route, at(), 201);
    }
    if (req.method() === 'PATCH') {
      // Conditional update: only over the version the device last saw.
      const want = q.get('updated_at');
      const matches =
        cloud.row &&
        (want === 'is.null'
          ? cloud.row.updated_at === null
          : want === `eq.${cloud.row.updated_at}`);
      if (!matches) {
        cloud.conflicts++;
        return ok(route, []);
      }
      cloud.row = { data: next.data, updated_at: next.updated_at };
      cloud.writes++;
      return ok(route, at());
    }
    return ok(route, []);
  }
  return { cloud, handle };
}

/** A device: its own browser context (own storage), signed in as USER. */
async function device(browser: Browser, handle: (r: Route) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(new RegExp(`^https?://(?!localhost|${PROJECT})`), (r) => r.abort());
  await context.route(`https://${PROJECT}.supabase.co/**`, handle);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, email: USER.email, exp })}.sig`;
  await context.addInitScript(
    ([key, session]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, session);
    },
    [
      `sb-${PROJECT}-auth-token`,
      JSON.stringify({
        access_token: token,
        refresh_token: 'r',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user: { ...USER, aud: 'authenticated', role: 'authenticated' },
      }),
    ] as const,
  );
  const page = await context.newPage();
  return { context, page };
}

/** The app's own pull: the window regains focus (CloudSyncProvider re-pulls on focus). */
const pull = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

/** The Account menu's sync line, once the device has sent or read the cloud copy. */
async function synced(page: Page) {
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByRole('menu').getByText('Synced', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

async function addJob(page: Page, link: string) {
  await page.goto('/#/apply');
  const add = page.getByRole('dialog', { name: 'Add a job' });
  await expect(async () => {
    if (!(await add.isVisible()))
      await page.getByRole('button', { name: 'Add job' }).first().click();
    await expect(add).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await add.getByLabel('Job link').fill(link);
  await add.getByRole('button', { name: 'Add job' }).click();
  await expect(add).toBeHidden();
}

const cloudJob = (row: Row | null, url: string) => row?.data.jobs?.find((j) => j.url === url);

let devices: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(devices.map((c) => c.close()));
  devices = [];
});

test('two devices on one account: save, Not a fit, Undo and a delete all reach the other', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { cloud, handle } = fakeCloud();
  const a = await device(browser, handle);
  const b = await device(browser, handle);
  devices = [a.context, b.context];

  // Both devices open signed in; A saves a job and sends it.
  await a.page.goto('/#/apply');
  await b.page.goto('/#/apply');
  await addJob(a.page, JOB_URL);
  await expect.poll(() => cloudJob(cloud.row, JOB_URL)?.url).toBe(JOB_URL);
  await synced(a.page);

  // B pulls: the job is there.
  await pull(b.page);
  const rail = b.page.getByRole('navigation', { name: 'Jobs' });
  await expect(rail.getByRole('link', { name: new RegExp(`^${JOB_TITLE}`) })).toBeVisible({
    timeout: 15_000,
  });
  await rail.getByRole('link', { name: new RegExp(`^${JOB_TITLE}`) }).click();
  await expect(b.page.getByRole('heading', { level: 1, name: JOB_TITLE })).toBeVisible();
  const retired = b.page.locator('main header').getByText('Retired', { exact: true });
  await expect(retired).toHaveCount(0);

  // Not a fit on A: B shows the job retired after its pull.
  await a.page.goto('/#/apply');
  await expect(a.page.getByRole('heading', { level: 1, name: JOB_TITLE })).toBeVisible();
  await a.page.getByRole('button', { name: 'Not a fit' }).click();
  const notices = a.page.getByRole('region', { name: /^Notifications/ });
  await expect(notices.getByText(`Marked not a fit: ${JOB_TITLE}`)).toBeVisible();
  await expect.poll(() => cloudJob(cloud.row, JOB_URL)?.archived).toBe(true);
  await pull(b.page);
  await expect(retired).toBeVisible({ timeout: 15_000 });

  // Undo on A: B restores it.
  await notices.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => cloudJob(cloud.row, JOB_URL)?.archived ?? false).toBe(false);
  await pull(b.page);
  await expect(retired).toHaveCount(0, { timeout: 15_000 });
  await expect(b.page.getByRole('heading', { level: 1, name: JOB_TITLE })).toBeVisible();

  // A removes the job. B, before it pulls, saves another one: its send meets A's newer copy, so
  // it merges against its sync base (#219) and the removed job stays removed, on both devices.
  await b.page.goto('/#/apply');
  await synced(b.page);
  await a.page.goto('/#/apply');
  await expect(a.page.getByRole('heading', { level: 1, name: JOB_TITLE })).toBeVisible();
  await a.page.getByRole('button', { name: `More actions: ${JOB_TITLE}` }).click();
  await a.page.getByRole('menuitem', { name: 'Remove from Apply' }).click();
  await expect.poll(() => cloudJob(cloud.row, JOB_URL)).toBeUndefined();

  const turnedDown = cloud.conflicts;
  await addJob(b.page, OTHER_URL);
  await expect.poll(() => cloudJob(cloud.row, OTHER_URL)?.url).toBe(OTHER_URL);
  expect(cloudJob(cloud.row, JOB_URL)).toBeUndefined();
  // B's first send was over its older copy: the cloud turned it down and B merged.
  expect(cloud.conflicts).toBeGreaterThan(turnedDown);
  await expect(rail.getByRole('link', { name: /^Zenith/ })).toBeVisible();
  await expect(rail.getByRole('link', { name: new RegExp(`^${JOB_TITLE}`) })).toHaveCount(0);

  // A pulls: B's job arrives, the removed one does not come back. A reload (the seed merge)
  // on either device brings nothing back either.
  await pull(a.page);
  const railA = a.page.getByRole('navigation', { name: 'Jobs' });
  await expect(railA.getByRole('link', { name: /^Zenith/ })).toBeVisible({ timeout: 15_000 });
  await expect(railA.getByRole('link', { name: new RegExp(`^${JOB_TITLE}`) })).toHaveCount(0);
  for (const page of [a.page, b.page]) {
    await page.reload();
    await synced(page);
    const list = page.getByRole('navigation', { name: 'Jobs' });
    await expect(list.getByRole('link', { name: /^Zenith/ })).toBeVisible({ timeout: 15_000 });
    await expect(list.getByRole('link', { name: new RegExp(`^${JOB_TITLE}`) })).toHaveCount(0);
  }
  expect(cloudJob(cloud.row, JOB_URL)).toBeUndefined();
  expect(cloudJob(cloud.row, OTHER_URL)?.url).toBe(OTHER_URL);
});

import { test, expect, signInAtBoot } from './fixtures';

// The sync stack loads beside the Supabase client (#832): a signed-out visit never fetches it, and a
// signed-in one still reads its cloud row on open, only once the stack is in and the sign-in path
// has run for that user (the guard: nothing pulls before it, CLAUDE.md).
// Dev serves each module on its own; a build puts them in one syncStack chunk.
const isStack = (url: string) => /syncStack|syncBlob|syncBase|trackerRow|localSyncData/.test(url);
const isTrackerRead = (url: string, method: string) =>
  method === 'GET' && /\/rest\/v1\/tracker\b/.test(url);

test('signed out: the sync stack is never fetched', async ({ page }) => {
  const stack: string[] = [];
  page.on('request', (r) => {
    if (isStack(r.url())) stack.push(r.url());
  });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto('/#/apply');
  await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
  await page.waitForLoadState('networkidle');
  expect(stack).toEqual([]);
});

test('signed in at boot: the first sync reads the cloud row after the stack is in', async ({
  page,
}) => {
  const order: string[] = [];
  page.on('requestfinished', (r) => {
    if (isStack(r.url())) order.push('stack');
  });
  page.on('request', (r) => {
    if (isTrackerRead(r.url(), r.method())) order.push('tracker');
  });
  await signInAtBoot(page);
  await page.route(/^https?:\/\/(?!localhost|[a-z0-9]+\.supabase\.co)/, (r) => r.abort());
  await page.goto('/#/apply');
  await expect.poll(() => order.includes('tracker'), { timeout: 15_000 }).toBe(true);
  expect(order.indexOf('stack')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('stack')).toBeLessThan(order.indexOf('tracker'));
});

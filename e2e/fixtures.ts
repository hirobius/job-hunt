// Review reads postings only for a signed-in visitor (#755). A spec that reads Review sets
// `test.use({ signedIn: true })`: a stored Supabase session, an account with an empty cloud copy,
// and this device already that account's (no "add this device's data?" question). A spec's own
// routes win over these (Playwright tries the last-registered route first). Signed out (the
// default) the app is as before, and the sample data is offered on Apply.
import { test as base, type BrowserContext, type Page, type Route } from '@playwright/test';

export * from '@playwright/test';

const PROJECT = 'nelrcmbkimjjmfmgnixj';
export const E2E_USER = { id: '00000000-0000-4000-8000-0000000000e2', email: 'e2e@example.test' }; // pii-allow: fake test address

/** Sign this page in before it loads: the stored session and the fake account. */
export async function signInAtBoot(page: Page): Promise<void> {
  const supabase = `https://${PROJECT}.supabase.co/**`;
  const answer = (route: Route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: E2E_USER });
    // Every other read is empty: no cloud copy, no server rows, no picks, no sync runs.
    return route.fulfill({ json: [] });
  };
  await page.route(supabase, answer);
  // A spec's own catch-all route (every outside host) is added later, so it would answer the
  // account's reads first: put this one back on top after each.
  const route = page.route.bind(page);
  page.route = (async (...args: Parameters<Page['route']>) => {
    await route(...args);
    await page.unroute(supabase, answer);
    await route(supabase, answer);
  }) as Page['route'];
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: E2E_USER.id, email: E2E_USER.email, exp })}.sig`;
  await page.addInitScript(
    ([key, session, uid]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, session);
      if (!localStorage.getItem('rjb_device_account'))
        localStorage.setItem('rjb_device_account', uid);
    },
    [
      `sb-${PROJECT}-auth-token`,
      JSON.stringify({
        access_token: token,
        refresh_token: 'r',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user: { ...E2E_USER, aud: 'authenticated', role: 'authenticated' },
      }),
      E2E_USER.id,
    ] as const,
  );
}

/** The sign-in screen opens on its own once a tab session over a signed-out Review (#755). A spec
 *  about something else starts as if it was already asked; a spec that makes its own context
 *  (`browser.newContext()`) calls this on it. */
export async function skipSignInAsk(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(() => sessionStorage.setItem('rjb_sign_in_asked', '1'));
}

export const test = base.extend<{ signedIn: boolean }>({
  signedIn: [false, { option: true }],
  page: async ({ page, signedIn }, provide) => {
    if (signedIn) await signInAtBoot(page);
    // review-sign-in.spec.ts tests that screen, from '@playwright/test'.
    else await skipSignInAsk(page);
    await provide(page);
  },
});

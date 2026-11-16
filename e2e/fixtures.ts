// Review reads postings only for a signed-in visitor (#755). A spec that reads Review sets
// `test.use({ signedIn: true })`: a stored Supabase session, an account with an empty cloud copy,
// and this device already that account's (no "add this device's data?" question). A spec's own
// routes win over these (Playwright tries the last-registered route first). Signed out (the
// default) the app is as before, and the sample data is offered on Apply.
import { test as base, type Page } from '@playwright/test';

export * from '@playwright/test';

const PROJECT = 'nelrcmbkimjjmfmgnixj';
export const E2E_USER = { id: '00000000-0000-4000-8000-0000000000e2', email: 'e2e@example.test' }; // pii-allow: fake test address

/** Sign this page in before it loads: the stored session and the fake account. */
export async function signInAtBoot(page: Page): Promise<void> {
  await page.route(`https://${PROJECT}.supabase.co/**`, (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: E2E_USER });
    // Every other read is empty: no cloud copy, no server rows, no picks, no sync runs.
    return route.fulfill({ json: [] });
  });
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

export const test = base.extend<{ signedIn: boolean }>({
  signedIn: [false, { option: true }],
  page: async ({ page, signedIn }, provide) => {
    if (signedIn) await signInAtBoot(page);
    // The sign-in screen opens on its own once a tab session over a signed-out Review (#755);
    // a spec about something else starts as if it was already asked (review-sign-in.spec.ts
    // tests that screen, from '@playwright/test').
    else await page.addInitScript(() => sessionStorage.setItem('rjb_sign_in_asked', '1'));
    await provide(page);
  },
});

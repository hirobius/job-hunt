// The sign-in CAPTCHA's loader and widget (#278): one script tag, added on demand; one token per
// ask; a blocked script, a closed or expired challenge and a network fault each come back as a
// named failure, and a retry fetches the script again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Captcha,
  failureOf,
  forgetHcaptcha,
  HCAPTCHA_ONLOAD,
  HCAPTCHA_SCRIPT,
  loadHcaptcha,
  SCRIPT_TIMEOUT_MS,
} from './hcaptcha';

const KEY = '10000000-ffff-ffff-ffff-000000000001'; // hCaptcha's public test site key
type G = Record<string, unknown>;
const g = window as unknown as G;

const scripts = () =>
  [...document.head.querySelectorAll<HTMLScriptElement>('script')].filter((s) =>
    s.src.startsWith(HCAPTCHA_SCRIPT),
  );

function fakeApi() {
  let n = 0;
  return {
    render: vi.fn((_el: HTMLElement, _c: Record<string, unknown>) => `w${++n}`),
    execute: vi.fn(async (_id: string, _c: { async: true }) => ({ response: `token-${n}` })),
    reset: vi.fn((_id: string) => {}),
    remove: vi.fn((_id: string) => {}),
  };
}

/** What api.js does when it arrives: set the global, call the onload function. */
function arrive(api = fakeApi()) {
  g.hcaptcha = api;
  (g[HCAPTCHA_ONLOAD] as () => void)();
  return api;
}

const els = () => [document.createElement('div'), document.createElement('div')] as const;

beforeEach(() => {
  forgetHcaptcha();
  delete g.hcaptcha;
  delete g[HCAPTCHA_ONLOAD];
  scripts().forEach((s) => s.remove());
});
afterEach(() => vi.useRealTimers());

describe('loadHcaptcha', () => {
  it('adds no script until it is asked, then one, explicit and without extras', async () => {
    expect(scripts()).toHaveLength(0);
    const first = loadHcaptcha();
    const second = loadHcaptcha();
    expect(scripts()).toHaveLength(1);
    const url = new URL(scripts()[0].src);
    expect(url.origin + url.pathname).toBe('https://js.hcaptcha.com/1/api.js');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      render: 'explicit',
      onload: HCAPTCHA_ONLOAD,
      recaptchacompat: 'off',
      sentry: 'false',
    });
    const api = arrive();
    expect(await first).toBe(api);
    expect(await second).toBe(api);
  });

  it('a script that fails is blocked, and the next ask fetches it again', async () => {
    const p = loadHcaptcha();
    scripts()[0].dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow('blocked');
    expect(scripts()).toHaveLength(0);
    const again = loadHcaptcha();
    expect(scripts()).toHaveLength(1);
    const api = arrive();
    expect(await again).toBe(api);
  });

  it('a script that never answers is blocked after the timeout', async () => {
    vi.useFakeTimers();
    const p = loadHcaptcha();
    const caught = p.catch((e: Error) => e.message);
    vi.advanceTimersByTime(SCRIPT_TIMEOUT_MS);
    expect(await caught).toBe('blocked');
    expect(scripts()).toHaveLength(0);
  });
});

describe('Captcha', () => {
  it('renders one invisible widget with the site key and gives a token per ask', async () => {
    const api = fakeApi();
    g.hcaptcha = api;
    const [anchor, challenge] = els();
    const c = new Captcha(KEY);
    expect(await c.token(anchor, challenge)).toEqual({ token: 'token-1' });
    expect(await c.token(anchor, challenge)).toEqual({ token: 'token-1' });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledWith(anchor, {
      sitekey: KEY,
      size: 'invisible',
      'challenge-container': challenge,
    });
    expect(api.execute).toHaveBeenCalledTimes(2);
    expect(api.execute).toHaveBeenCalledWith('w1', { async: true });
  });

  it('reset drops the used token; remove takes the widget out, and the next ask renders again', async () => {
    const api = fakeApi();
    g.hcaptcha = api;
    const [anchor, challenge] = els();
    const c = new Captcha(KEY);
    c.reset(); // nothing rendered yet: nothing to do
    expect(api.reset).not.toHaveBeenCalled();
    await c.token(anchor, challenge);
    c.reset();
    expect(api.reset).toHaveBeenCalledWith('w1');
    c.remove();
    expect(api.remove).toHaveBeenCalledWith('w1');
    await c.token(anchor, challenge);
    expect(api.render).toHaveBeenCalledTimes(2);
  });

  it('a screen that was re-mounted gets a new widget in its new place', async () => {
    const api = fakeApi();
    g.hcaptcha = api;
    const c = new Captcha(KEY);
    await c.token(...els());
    await c.token(...els());
    expect(api.remove).toHaveBeenCalledWith('w1');
    expect(api.render).toHaveBeenCalledTimes(2);
  });

  it('a blocked script is "blocked", and the same widget works once the script loads', async () => {
    const [anchor, challenge] = els();
    const c = new Captcha(KEY);
    const p = c.token(anchor, challenge);
    scripts()[0].dispatchEvent(new Event('error'));
    expect(await p).toEqual({ failure: 'blocked' });
    const again = c.token(anchor, challenge);
    arrive();
    expect(await again).toEqual({ token: 'token-1' });
  });

  it.each([
    ['challenge-closed', 'closed'],
    ['challenge-expired', 'expired'],
    ['network-error', 'network'],
    ['rate-limited', 'failed'],
    ['internal-error', 'failed'],
  ])('execute rejecting with %s is "%s"', async (code, failure) => {
    const api = fakeApi();
    api.execute.mockRejectedValueOnce(code);
    g.hcaptcha = api;
    expect(await new Captcha(KEY).token(...els())).toEqual({ failure });
  });

  it('an empty answer, or a render that throws, is "failed"', async () => {
    const api = fakeApi();
    api.execute.mockResolvedValueOnce({ response: '' });
    g.hcaptcha = api;
    expect(await new Captcha(KEY).token(...els())).toEqual({ failure: 'failed' });
    api.render.mockImplementationOnce(() => {
      throw new Error('invalid-data');
    });
    expect(await new Captcha(KEY).token(...els())).toEqual({ failure: 'failed' });
  });

  it('warm fetches the script and says nothing when it is blocked', async () => {
    const c = new Captcha(KEY);
    c.warm();
    expect(scripts()).toHaveLength(1);
    scripts()[0].dispatchEvent(new Event('error'));
    await Promise.resolve();
    expect(scripts()).toHaveLength(0);
  });
});

describe('failureOf', () => {
  it('reads the code from a string or an Error', () => {
    expect(failureOf('challenge-closed')).toBe('closed');
    expect(failureOf(new Error('challenge-expired'))).toBe('expired');
    expect(failureOf(null)).toBe('failed');
    expect(failureOf(undefined)).toBe('failed');
  });
});

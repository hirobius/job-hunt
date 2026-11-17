// hCaptcha for the sign-in email (#278), without a dependency: a small loader for hCaptcha's own
// api.js and one invisible widget. Nothing here runs unless a site key is set (captchaKey.ts) and
// the sign-in screen is open; the script tag is added then, never at boot, and this module is in
// the sign-in screen's lazy chunk (entryChunk.test.ts).
//
// Invisible size: no checkbox on the screen. `execute` gives one token per send (a token is good
// for one use and about two minutes, so Send link and each Resend ask for a fresh one). hCaptcha
// shows a challenge only when it wants one, drawn inside the sign-in screen (`challenge-container`):
// the screen is a modal dialog, and a challenge added to <body> would be inert under it.
// API shapes follow hCaptcha's published types (@hcaptcha/types 1.2.0), read 2026-11-15.

/** Why no token came back. `blocked`: the script never loaded (a content blocker, the network). */
export type CaptchaFailure = 'blocked' | 'closed' | 'expired' | 'network' | 'failed';
export type CaptchaResult = { token: string } | { failure: CaptchaFailure };

interface HCaptchaApi {
  render(
    container: HTMLElement,
    config: { sitekey: string; size: 'invisible'; 'challenge-container': HTMLElement },
  ): string;
  execute(id: string, config: { async: true }): Promise<{ response: string }>;
  reset(id: string): void;
  remove(id: string): void;
}

export const HCAPTCHA_SCRIPT = 'https://js.hcaptcha.com/1/api.js';
/** The global api.js calls when it is ready (its `onload` parameter takes a function's name). */
export const HCAPTCHA_ONLOAD = 'rjbHcaptchaReady';
/** A script that has not answered by then counts as blocked; the next ask tries again. */
export const SCRIPT_TIMEOUT_MS = 10_000;

type Globals = { hcaptcha?: HCaptchaApi } & Record<string, unknown>;
const globals = (): Globals => window as unknown as Globals;

let api: Promise<HCaptchaApi> | null = null;

/** hCaptcha's API, fetched once. A failed fetch is forgotten, so a retry fetches again. */
export function loadHcaptcha(): Promise<HCaptchaApi> {
  api ??= new Promise<HCaptchaApi>((resolve, reject) => {
    const g = globals();
    if (g.hcaptcha) return resolve(g.hcaptcha);
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      g[HCAPTCHA_ONLOAD] = () => {}; // a late answer finds a function, and the next ask finds the API
      api = null;
      reject(new Error('blocked'));
    };
    const timer = setTimeout(fail, SCRIPT_TIMEOUT_MS);
    g[HCAPTCHA_ONLOAD] = () => {
      if (!g.hcaptcha) return fail();
      clearTimeout(timer);
      resolve(g.hcaptcha);
    };
    // explicit: nothing renders until this module asks. recaptchacompat off: no `grecaptcha`
    // global. sentry off: no error reports from this page to hCaptcha.
    script.src = `${HCAPTCHA_SCRIPT}?render=explicit&onload=${HCAPTCHA_ONLOAD}&recaptchacompat=off&sentry=false`;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return api;
}

/** Tests only: forget the loaded API. */
export function forgetHcaptcha(): void {
  api = null;
}

/** hCaptcha rejects `execute` with a code ("challenge-closed", "challenge-expired",
 *  "network-error", "rate-limited", …), as a string or on an Error. */
export function failureOf(e: unknown): CaptchaFailure {
  const code = String(
    typeof e === 'string' ? e : ((e as { message?: unknown } | null)?.message ?? ''),
  ).toLowerCase();
  if (code.includes('closed')) return 'closed';
  if (code.includes('expired')) return 'expired';
  if (code.includes('network')) return 'network';
  return 'failed';
}

/** One invisible widget for the sign-in screen. */
export class Captcha {
  private hc: HCaptchaApi | null = null;
  private id: string | null = null;
  private anchor: HTMLElement | null = null;

  constructor(private readonly siteKey: string) {}

  /** Fetch the script when the screen opens, so the first Send link does not wait for it. A
   *  failure says nothing here: `token` tries again and reports it. */
  warm(): void {
    void loadHcaptcha().catch(() => {});
  }

  /** A fresh token: the widget is rendered into `anchor` on first use (again if the screen was
   *  re-mounted), then run. A challenge, if hCaptcha wants one, is drawn inside `challenge`. */
  async token(anchor: HTMLElement, challenge: HTMLElement): Promise<CaptchaResult> {
    let hc: HCaptchaApi;
    try {
      hc = await loadHcaptcha();
    } catch {
      return { failure: 'blocked' };
    }
    try {
      if (this.id === null || this.anchor !== anchor) {
        this.remove();
        this.hc = hc;
        this.anchor = anchor;
        this.id = hc.render(anchor, {
          sitekey: this.siteKey,
          size: 'invisible',
          'challenge-container': challenge,
        });
      }
      const r = await hc.execute(this.id, { async: true });
      return r?.response ? { token: r.response } : { failure: 'failed' };
    } catch (e) {
      return { failure: failureOf(e) };
    }
  }

  /** Drop the used token (one use each) and any open challenge state. */
  reset(): void {
    try {
      if (this.hc && this.id !== null) this.hc.reset(this.id);
    } catch {
      /* the widget is gone with the screen */
    }
  }

  /** Take the widget out when the screen closes. */
  remove(): void {
    try {
      if (this.hc && this.id !== null) this.hc.remove(this.id);
    } catch {
      /* already gone */
    }
    this.id = null;
    this.anchor = null;
  }
}

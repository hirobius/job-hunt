// The server's reads of the five newer board kinds (#576 item 1): BambooHR, Rippling, Gem, Pinpoint
// and Breezy HR. Their endpoints are unofficial or new to the sync, so each read is held to the
// security review's SSRF rules (2026-10-27) on top of the slug rule in plan.ts:
//   - the URL is built from a validated slug on a fixed host (ats.ts `boardApiUrl`) and checked
//     again here before it leaves: host on the allow list, https, no port, no credentials;
//   - `redirect: 'error'`: a board that answers with a redirect is a failed read, so a slug can
//     never walk the sync to a host off the list;
//   - the body is read up to MAX_BOARD_BYTES and the read fails past it (Content-Length first,
//     then the stream itself, as a missing or false header must not get round the cap).
// Pure apart from the fetch it is given: the edge function, the dry run and the tests share it.
import type { BoardKind } from '../feed/sources/ats.ts';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The kinds this guard covers (the rest keep the reader they had). */
export const GUARDED_KINDS = ['bamboohr', 'rippling', 'gem', 'pinpoint', 'breezy'] as const;
export type GuardedKind = (typeof GUARDED_KINDS)[number];
export const isGuarded = (k: BoardKind): k is GuardedKind =>
  (GUARDED_KINDS as readonly string[]).includes(k);

/** A board's list over this is refused. Real lists are well under 1 MB (a few hundred jobs). */
export const MAX_BOARD_BYTES = 4 * 1024 * 1024;

/** A slug that is one DNS label: what a `<slug>.host` board may use (no dots, 63 chars max). */
export const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** The guarded kinds whose slug is a subdomain (`<slug>.host`): it must be one DNS label. */
export const SUBDOMAIN_KINDS: readonly GuardedKind[] = ['bamboohr', 'pinpoint', 'breezy'];

/** Each kind's host rule: a fixed host, or one DNS label under a fixed domain. */
const HOSTS: Record<GuardedKind, (host: string) => boolean> = {
  bamboohr: (h) => sub(h, 'bamboohr.com'),
  rippling: (h) => h === 'api.rippling.com',
  gem: (h) => h === 'api.gem.com',
  pinpoint: (h) => sub(h, 'pinpointhq.com'),
  breezy: (h) => sub(h, 'breezy.hr'),
};
function sub(host: string, domain: string) {
  if (!host.endsWith(`.${domain}`)) return false;
  return LABEL.test(host.slice(0, -domain.length - 1));
}

/** True when `url` is a read the guard lets out for this kind. */
export function allowedUrl(kind: GuardedKind, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    !u.port &&
    !u.username &&
    !u.password &&
    HOSTS[kind](u.hostname.toLowerCase())
  );
}

export class BoardFetchError extends Error {
  // A plain field, not a parameter property: `node --experimental-strip-types` (the dry run)
  // rejects parameter properties (stripTypes.test.ts).
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** The body as text, failing past `max` bytes. */
async function readCapped(r: Response, max: number): Promise<string> {
  const len = Number(r.headers.get('content-length'));
  if (Number.isFinite(len) && len > max) throw new BoardFetchError(`board list over ${max} bytes`);
  if (!r.body) return '';
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new BoardFetchError(`board list over ${max} bytes`);
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** A fetch for one guarded kind: refuses a URL off its hosts, never follows a redirect, caps the
 *  body. Returns a Response so it drops into the sync's JSON reader unchanged. */
export const guardedFetch =
  (kind: GuardedKind, f: Fetch, max = MAX_BOARD_BYTES): Fetch =>
  async (url, init) => {
    if (!allowedUrl(kind, url)) throw new BoardFetchError(`${kind}: refused URL off its hosts`);
    const r = await f(url, { ...init, redirect: 'error' });
    // A runtime that ignores `redirect` (or a test double) still must not land off the list.
    if (r.redirected || (r.url && !allowedUrl(kind, r.url)))
      throw new BoardFetchError(`${kind}: redirected off its hosts`);
    if (r.status >= 300 && r.status < 400)
      throw new BoardFetchError(`${kind}: redirect refused`, r.status);
    if (!r.ok) return new Response(null, { status: r.status });
    const text = await readCapped(r, max);
    return new Response(text, {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  };

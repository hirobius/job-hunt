import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './config';

/**
 * The Content-Security-Policy (#41, #97) lives in vercel.json, far from the code that
 * needs it. These tests tie the two together: an origin the app talks to that the policy
 * doesn't allow would be silently blocked once the policy is enforced.
 *
 * Shipped report-only first (#97); enforcing since #106 after a zero-violation check of
 * production (every tab, sample data, dialogs, the live feed). Fonts are HDS's self-hosted
 * fonts.css (bundled woff2), so styles and fonts load from 'self' only — no font CDN (#115 Phase 0).
 */

// Every origin the live feed's sources fetch from. Adding a source means adding its origin here AND
// in vercel.json's connect-src; a source whose origin is missing here would be silently blocked.
const FEED_HOSTS = [
  'https://hn.algolia.com',
  'https://remotive.com',
  'https://jobicy.com',
  'https://remoteok.com',
  'https://public.api.bsky.app',
  'https://mastodon.social',
  'https://hachyderm.io',
  'https://boards-api.greenhouse.io',
  'https://api.lever.co',
  'https://api.eu.lever.co',
  'https://api.ashbyhq.com',
  'https://apply.workable.com',
  'https://*.recruitee.com',
  'https://api.smartrecruiters.com',
  'https://*.teamtailor.com',
  'https://*.jobs.personio.de',
  'https://*.bamboohr.com',
  'https://api.rippling.com',
  'https://api.gem.com',
  'https://*.pinpointhq.com',
  'https://*.breezy.hr',
  'https://yc-oss.github.io',
  'https://api.github.com',
];

// hCaptcha (#278), the sign-in screen's CAPTCHA, used only when a site key is set at build time
// (account/captchaKey.ts). Its own documented policy: these two sources in script-src, frame-src,
// style-src and connect-src. Its script comes from js.hcaptcha.com and its frames from other
// hcaptcha.com subdomains, which it may change, so its wildcard is kept as it gives it.
const HCAPTCHA = ['https://hcaptcha.com', 'https://*.hcaptcha.com'];

type Header = { key: string; value: string };
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: Header[] }[];
};
const indexHtml = fs.readFileSync('index.html', 'utf8');

const CSP_HEADER = 'Content-Security-Policy';

function policy(): Map<string, string[]> {
  const all = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
  const value = all.find((h) => h.key === CSP_HEADER)?.value;
  if (!value) throw new Error(`${CSP_HEADER} missing from vercel.json`);
  const directives = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}

describe('content security policy', () => {
  const csp = policy();
  const src = (d: string) => csp.get(d) ?? [];

  it('locks down scripts, plugins, framing, base and form targets', () => {
    expect(src('default-src')).toEqual(["'self'"]);
    // no unsafe-inline / unsafe-eval; the one outside script is hCaptcha's (#278)
    expect(src('script-src')).toEqual(["'self'", ...HCAPTCHA]);
    expect(src('object-src')).toEqual(["'none'"]);
    expect(src('frame-ancestors')).toEqual(["'none'"]);
    expect(src('base-uri')).toEqual(["'self'"]);
    expect(src('form-action')).toEqual(["'self'"]);
  });

  it('allows inline styles — HDS (incl. Box sx) injects them at runtime', () => {
    expect(src('style-src')).toContain("'unsafe-inline'");
  });

  it('loads fonts and styles from the app only — no font CDN', () => {
    // HDS fonts.css ships woff2 files the bundler hashes into dist/ — no data: fonts either.
    expect(src('font-src')).toEqual(["'self'"]);
    expect(src('style-src')).toEqual(["'self'", "'unsafe-inline'", ...HCAPTCHA]);
  });

  it('lets the sign-in CAPTCHA load: hCaptcha in the four directives it documents, nowhere else (#278)', () => {
    for (const d of ['script-src', 'frame-src', 'style-src', 'connect-src'])
      for (const host of HCAPTCHA) expect(src(d), d).toContain(host);
    // Frames come from hCaptcha only; the app itself is never framed (frame-ancestors, above).
    expect(src('frame-src')).toEqual(HCAPTCHA);
    for (const d of ['default-src', 'img-src', 'font-src', 'form-action', 'base-uri'])
      expect(src(d).join(' '), d).not.toMatch(/hcaptcha/);
    // The loader asks for the script the policy allows.
    const loader = fs.readFileSync('src/account/hcaptcha.ts', 'utf8');
    expect(loader).toContain("HCAPTCHA_SCRIPT = 'https://js.hcaptcha.com/1/api.js'");
  });

  it.each(FEED_HOSTS)('lets the live feed reach %s', (host) => {
    expect(src('connect-src')).toContain(host);
  });

  it('loads images from the app, data: URIs and DuckDuckGo’s icon service (company logos)', () => {
    expect(src('img-src')).toEqual(["'self'", 'data:', 'https://icons.duckduckgo.com']);
  });

  it('lets cloud sync reach Supabase over https and wss', () => {
    const origin = new URL(SUPABASE_URL).origin;
    expect(src('connect-src')).toContain(origin);
    expect(src('connect-src')).toContain(origin.replace(/^https:/, 'wss:'));
  });

  it('allows every external stylesheet index.html loads', () => {
    const sheets = [...indexHtml.matchAll(/<link\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /rel=["']?stylesheet/.test(tag))
      .map((tag) => /href=["']?((?:https?:)?\/\/[^"'\s>]+)/.exec(tag)?.[1])
      .filter((href): href is string => !!href)
      .map((href) => new URL(href, 'https://x').origin);
    for (const origin of sheets) expect(src('style-src')).toContain(origin);
  });

  it('loads no external scripts from index.html (the CAPTCHA script is added on demand)', () => {
    expect(indexHtml).not.toMatch(/<script\b[^>]*src=["']?(?:https?:)?\/\//);
  });
});

// The other security headers (#394, security review 2026-10-28).
describe('security headers', () => {
  const all = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
  const header = (key: string) => all.find((h) => h.key === key)?.value ?? '';

  it('keeps the app’s files to its own pages (Cross-Origin-Resource-Policy)', () => {
    expect(header('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('denies the powerful features the app never uses', () => {
    const denied = header('Permissions-Policy')
      .split(',')
      .map((d) => d.trim());
    for (const feature of [
      'camera',
      'microphone',
      'geolocation',
      'browsing-topics',
      'payment',
      'usb',
    ])
      expect(denied, feature).toContain(`${feature}=()`);
  });

  // Accepted risk: anyone can register a subdomain on these hosts, so after an XSS they could
  // take data out. script-src 'self' is what stops the XSS; a same-origin proxy would close it.
  // Pinned so no other wildcard joins them without the same call being made. hCaptcha's wildcard
  // (#278) is not a tenant one: only hCaptcha can make a subdomain of hcaptcha.com.
  it('allows tenant wildcards only for the boards hosted on a per-company subdomain', () => {
    const csp = policy();
    const wild = (csp.get('connect-src') ?? []).filter((s) => s.includes('*'));
    expect(wild.filter((s) => s.endsWith('.hcaptcha.com'))).toEqual(['https://*.hcaptcha.com']);
    expect(wild.filter((s) => !s.endsWith('.hcaptcha.com'))).toEqual([
      'https://*.recruitee.com',
      'https://*.teamtailor.com',
      'https://*.jobs.personio.de',
      'https://*.bamboohr.com',
      'https://*.pinpointhq.com',
      'https://*.breezy.hr',
    ]);
  });
});

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

// The live-feed sources (PR #88) fetch these from the browser. Once the feed lands on main,
// replace this list with one derived from the feed's source modules (follow-up in #97).
const FEED_SOURCE_HOSTS = [
  'https://hn.algolia.com',
  'https://remotive.com',
  'https://boards-api.greenhouse.io',
  'https://api.lever.co',
  'https://api.eu.lever.co',
  'https://api.ashbyhq.com',
];

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
    expect(src('script-src')).toEqual(["'self'"]); // no unsafe-inline / unsafe-eval
    expect(src('object-src')).toEqual(["'none'"]);
    expect(src('frame-ancestors')).toEqual(["'none'"]);
    expect(src('base-uri')).toEqual(["'self'"]);
    expect(src('form-action')).toEqual(["'self'"]);
  });

  it('allows inline styles — HDS (incl. Box sx) injects them at runtime', () => {
    expect(src('style-src')).toContain("'unsafe-inline'");
  });

  it('allows data: fonts — HDS styles.css embeds its fonts as data URIs', () => {
    expect(src('font-src')).toContain('data:');
  });

  it('loads fonts and styles from the app only — no font CDN', () => {
    expect(src('font-src')).toEqual(["'self'", 'data:']);
    expect(src('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it.each(FEED_SOURCE_HOSTS)('lets the live feed reach %s', (host) => {
    expect(src('connect-src')).toContain(host);
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

  it('loads no external scripts from index.html (script-src is self only)', () => {
    expect(indexHtml).not.toMatch(/<script\b[^>]*src=["']?(?:https?:)?\/\//);
  });
});

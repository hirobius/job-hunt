// The Privacy policy and Terms (#43) are checked against the code they describe: every host the
// CSP lets the browser reach is disclosed, and the required disclosures are present.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './config';
import {
  CONTACT_EMAIL,
  LEGAL_DOCS,
  OPERATOR,
  PRIVACY,
  TERMS,
  THIRD_PARTIES,
  legalDocFor,
} from './legal';

const text = (doc: typeof PRIVACY) =>
  doc.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.list ?? [])]).join('\n');

const connectSrc = (): string[] => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const csp = vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy')!.value;
  const hosts = (directive: string) =>
    csp
      .split(';')
      .find((p) => p.trim().startsWith(directive))!
      .trim()
      .split(/\s+/)
      .slice(1);
  // Every origin the browser may contact: fetches (connect-src) and the logo images (img-src).
  return [...hosts('connect-src'), ...hosts('img-src').filter((h) => h.startsWith('https:'))];
};

describe('legal pages (#43)', () => {
  it('discloses every host the browser may contact, and only those', () => {
    const disclosed = THIRD_PARTIES.flatMap((t) => t.hosts).sort();
    const allowed = connectSrc()
      .filter((h) => h !== "'self'")
      .sort();
    expect(disclosed).toEqual(allowed);
  });

  it('names Supabase for sign-in and sync, at the configured project', () => {
    const supa = THIRD_PARTIES.find((t) => t.name === 'Supabase')!;
    expect(supa.hosts).toContain(SUPABASE_URL);
    expect(supa.purpose).toMatch(/email/);
  });

  it('names Vercel for hosting and cookieless analytics', () => {
    const vercel = THIRD_PARTIES.find((t) => t.name === 'Vercel')!;
    expect(vercel.purpose).toMatch(/Hosting/);
    expect(vercel.purpose).toMatch(/without cookies/);
  });

  it('says DuckDuckGo may see the request came from this app, never the page or job', () => {
    const ddg = THIRD_PARTIES.find((t) => t.name === 'DuckDuckGo')!;
    expect(ddg.purpose).toMatch(/came from this app/);
    expect(ddg.purpose).toMatch(/never the page or job/);
  });

  it('lists AI processing for Documents drafting only (#232, ADR 0009), and no other AI provider', () => {
    const ai = THIRD_PARTIES.find((t) => t.name === 'Anthropic')!;
    // Server-side only: the browser never contacts Anthropic, so it adds no connect-src host.
    expect(ai.hosts).toEqual([]);
    expect(ai.purpose).toMatch(/AI drafting in Documents/);
    expect(ai.purpose).toMatch(/never your email, account, jobs or other documents/);
    expect(text(PRIVACY) + text(TERMS)).not.toMatch(/OpenAI|Gemini/);
  });

  it('privacy covers stored PII, local storage, export and erasure', () => {
    const p = text(PRIVACY);
    expect(p).toMatch(/email address/);
    expect(p).toMatch(/saved?|Jobs you save/);
    expect(p).toMatch(/local storage/);
    expect(p).toMatch(/Back up/);
    expect(p).toMatch(/Export CSV/);
    expect(p).toMatch(/Delete my data/);
    expect(p).toMatch(/do not sell/);
  });

  it('privacy discloses crash reports, what they leave out and how long they are kept', () => {
    const p = text(PRIVACY);
    expect(p).toMatch(/crash report/);
    expect(p).toMatch(/never includes your email/);
    expect(p).toMatch(/deleted after 90 days/);
  });

  it('both name the operator and the contact address', () => {
    for (const doc of [PRIVACY, TERMS]) {
      expect(text(doc)).toContain(OPERATOR);
      expect(text(doc)).toContain(CONTACT_EMAIL);
    }
    expect(CONTACT_EMAIL).toBe('hello@hirobius.com');
  });

  it('public copy never links the GitHub org or the npm package', () => {
    const all = text(PRIVACY) + text(TERMS);
    expect(all).not.toMatch(/github\.com\/hirobius|npmjs/);
  });

  it('routes terms to Terms and anything else to Privacy', () => {
    expect(legalDocFor('terms')).toBe(TERMS);
    expect(legalDocFor('privacy')).toBe(PRIVACY);
    expect(legalDocFor(null)).toBe(PRIVACY);
    expect(legalDocFor('nope')).toBe(PRIVACY);
    expect(Object.keys(LEGAL_DOCS)).toEqual(['privacy', 'terms']);
  });
});

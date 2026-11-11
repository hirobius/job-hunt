// Rank parity (#499): a server row carries its description trimmed to what ranking reads
// (matchText.ts). The Feed must list, hide, flag and score the trimmed rows exactly as the full ones.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MATCH_TEXT_AROUND,
  MATCH_TEXT_HEAD,
  MATCH_TEXT_PLAIN_MAX,
  matchKey,
  matchPatterns,
  textTermsOf,
  trimForMatch,
} from './matchText';
import { designSystemsTrack } from './track-config';
import { scoreForTrack } from './scoreForTrack';
import { buildFeed } from '../feed/feed';
import { searchProfileOf, type SearchProfile } from '../feed/profile';
import { sanitizeProfile, type Profile } from '../profileModel';
import { configForProfile } from './plan';
import { detectSignals } from '../feed/match';
import { normalizeForPhrase } from '../feed/mustInclude';
import { htmlToText, decodeEntities } from '../feed/html';
import type { Posting } from '../feed/types';

const NOW = Date.parse('2026-11-09T12:00:00');

// Real job text from the recorded board answers, as filler that reads like a posting.
const fixture = (name: string): string[] => {
  const raw = JSON.parse(readFileSync(`src/tracks/fixtures/${name}`, 'utf8'));
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string' && v.length > 200) out.push(htmlToText(decodeEntities(v)));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(raw);
  return out;
};
const FILLER = [
  ...fixture('greenhouse-discord.json'),
  ...fixture('lever-spotify.json'),
  ...fixture('ashby-linear.json'),
]
  .join('\n\n')
  // No signal or term of its own, so each case controls what the text says.
  .replace(
    /contract|freelanc|part[- ]time|fractional|1099|founding|first (?:design )?hire/gi,
    'work',
  )
  .replace(/design systems?|component librar(?:y|ies)|tokens?|storybook|figma|crypto/gi, 'craft');
const filler = (n: number) => {
  let s = '';
  while (s.length < n) s += FILLER + '\n\n';
  return s.slice(0, n);
};

// The stored profile both sides read: the sync cuts for its terms, the Feed reads it as a
// SearchProfile (feed/profile.ts), exactly as the app does.
const stored = sanitizeProfile({
  id: 'p1',
  label: 'Design systems',
  titles: ['Design Systems Designer', 'Product Designer'],
  include: { terms: ['design system'] },
  leaveOut: ['crypto'],
  mode: 'any',
  scorer: 'design-systems',
})!;
const profile: SearchProfile = { ...searchProfileOf(stored), mode: 'any' };
const config = configForProfile(stored)!;
const patternsFor = (p: Profile) =>
  matchPatterns(
    configForProfile(p)!.descriptionSignals.map((d) => d.pattern),
    textTermsOf(p),
  );
const patterns = patternsFor(stored);

let n = 0;
const posting = (title: string, text: string): Posting => ({
  id: `greenhouse:acme:${++n}`,
  source: 'greenhouse',
  title,
  company: `Co ${n}`,
  url: `https://boards.greenhouse.io/co${n}/jobs/${n}`,
  location: 'Remote',
  mode: 'remote',
  text,
});

// Long postings with what ranking reads placed deep in them, and near-misses.
const CASES: Posting[] = [
  posting(
    'Design Systems Designer',
    `${filler(9000)} We are open to contract work. ${filler(6000)}`,
  ),
  posting(
    'Design Systems Designer',
    `${filler(8000)} This is not a contract role. ${filler(5000)}`,
  ),
  posting(
    'Design Systems Designer',
    `${filler(4000)} You will own the employment contract terms. ${filler(9000)}`,
  ),
  posting(
    'Product Designer',
    `${filler(12000)} You will build our design system and its design tokens in Storybook. ${filler(3000)}`,
  ),
  posting(
    'Product Designer',
    `${filler(7000)} Our component library is new. ${filler(7000)} Figma variables too.`,
  ),
  posting('Product Designer', `${filler(6000)} Experience with design tokens. ${filler(8000)}`),
  posting(
    'Design Systems Designer',
    `${filler(10000)} Our customers trade crypto. ${filler(2000)}`,
  ),
  posting(
    'Design Systems Lead',
    `${filler(5000)} You will be our founding designer. ${filler(5000)}`,
  ),
  // "contractor" one character past a window edge: the window grows to the whole word.
  posting(
    'Design Systems Designer',
    `${filler(3000)} contract ${'x'.repeat(MATCH_TEXT_AROUND - 1)} contractor ${filler(4000)}`,
  ),
  posting(
    'Design Engineer',
    `${filler(9000)} Theming support architecture across design systems. ${filler(4000)}`,
  ),
  posting(
    'Senior Design Systems Engineer',
    `${filler(15000)} W2 only, no part-time. ${filler(4000)}`,
  ),
  posting('Design Systems Designer', `Short text about a design system, ${filler(800)}`),
];

const trimmed = (p: Posting): Posting => ({ ...p, text: trimForMatch(p.text, patterns) });
const feedOf = (postings: Posting[], as: SearchProfile = profile) =>
  buildFeed(
    { postings, sources: [{ key: 'greenhouse:acme', label: 'Acme', fetched: postings.length }] },
    as,
    [],
    { now: NOW, decided: { decided: [], muted: [], followed: [] }, seen: {}, saved: new Set() },
  );
const view = (f: ReturnType<typeof feedOf>) => ({
  rows: f.rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    score: r.score,
    hit: r.hit,
    titles: r.titles,
    why: r.why,
    signals: r.signals,
  })),
  hidden: f.hidden,
  listed: f.listed,
  considered: f.considered,
});

/** What feed_rows sends for a row (the migration's case, pinned below): its match text only when
 *  it was cut for the caller's key, else the full description. */
const sent = (row: { full: string; match: string | null; key: string | null }, key: string) =>
  row.match !== null && row.key === key ? row.match : row.full;

describe('trimForMatch (#499)', () => {
  it('cuts long texts and keeps short ones whole', () => {
    let full = 0;
    let cut = 0;
    for (const p of CASES) {
      const t = trimForMatch(p.text, patterns);
      if (p.text.length <= MATCH_TEXT_PLAIN_MAX) expect(t).toBe(p.text);
      else expect(t.length).toBeLessThan(p.text.length / 2);
      expect(t.startsWith(p.text.slice(0, MATCH_TEXT_HEAD))).toBe(true);
      full += p.text.length;
      cut += t.length;
    }
    // The filler repeats, so each repeat's own phrase hits keep windows too: real rows cut more.
    expect(cut).toBeLessThan(full / 4);
  });

  it('ranks the trimmed rows exactly as the full ones: list, order, hidden counts, signals', () => {
    const full = view(feedOf(CASES));
    expect(full.rows.length).toBeGreaterThan(5);
    expect(full.hidden.exclude).toBe(1);
    expect(full.rows.some((r) => r.signals.some((s) => s.id === 'contract'))).toBe(true);
    expect(full.rows.some((r) => r.signals.some((s) => s.id === 'founding'))).toBe(true);
    expect(view(feedOf(CASES.map(trimmed)))).toEqual(full);
  });

  it('gives the scorer the same score, verdict and signals', () => {
    for (const p of CASES) {
      const norm = (text: string) => ({
        title: p.title,
        company: p.company,
        location: p.location,
        url: p.url,
        source: 'greenhouse',
        sourceId: p.id,
        descriptionText: text,
        remote: true,
      });
      const a = scoreForTrack(norm(p.text) as never, config);
      const b = scoreForTrack(norm(trimmed(p).text) as never, config);
      expect(b).toEqual(a);
    }
  });

  it('keeps the contract rule’s context: negation and contract-as-a-document read the same', () => {
    for (const p of CASES)
      expect(detectSignals(`${p.title}\n${trimmed(p).text}`)).toEqual(
        detectSignals(`${p.title}\n${p.text}`),
      );
  });

  it('never makes a match across a join that the full text lacks', () => {
    // One window ends on "design", the next starts on "systems".
    const text =
      `${filler(3000)} contract ${'a'.repeat(155)} design ${filler(3000)} ` +
      `systems ${'b'.repeat(152)} contract ${filler(3000)}`;
    const t = trimForMatch(text, matchPatterns([], []));
    expect(t).toContain('design\n…\nsystems');
    const p = posting('Product Designer', text);
    expect(scoreForTrack({ ...p, descriptionText: t } as never, designSystemsTrack)).toEqual(
      scoreForTrack({ ...p, descriptionText: text } as never, designSystemsTrack),
    );
    expect(normalizeForPhrase(t)).not.toMatch(/design systems?/);
  });

  it('a term added after the sync: the key differs, the row comes whole, the Feed reads it right', () => {
    const later = sanitizeProfile({ ...stored, leaveOut: ['crypto', 'blockchain'] })!;
    expect(matchKey(later)).not.toBe(matchKey(stored));
    // The posting says the new term deep in its text, far from any window cut for `stored`.
    const deep = posting(
      'Design Systems Designer',
      `${filler(9000)} We build on blockchain rails. ${filler(6000)}`,
    );
    const rows = [...CASES, deep].map((p) => {
      const cut = trimForMatch(p.text, patterns);
      return { p, full: p.text, match: cut === p.text ? null : cut, key: matchKey(stored) };
    });
    const laterProfile: SearchProfile = { ...searchProfileOf(later), mode: 'any' };
    const asSent = rows.map((r) => ({ ...r.p, text: sent(r, matchKey(later)) }));
    expect(view(feedOf(asSent, laterProfile))).toEqual(
      view(feedOf([...CASES, deep], laterProfile)),
    );
    expect(feedOf([...CASES, deep], laterProfile).hidden.exclude).toBe(2);
    // Without the key the stale cut would have listed it: the check matters.
    const stale = rows.map((r) => ({ ...r.p, text: r.match ?? r.full }));
    expect(feedOf(stale, laterProfile).hidden.exclude).toBe(1);
    // The same key: the trimmed text is sent.
    expect(rows.filter((r) => sent(r, matchKey(stored)) !== r.full).length).toBeGreaterThan(5);
  });

  it('rows synced before the migration (no match text) come whole; the SQL says the same', () => {
    expect(sent({ full: 'x'.repeat(5000), match: null, key: null }, matchKey(stored))).toHaveLength(
      5000,
    );
    const sql = readFileSync('supabase/migrations/20261109100000_feed_match_text.sql', 'utf8');
    expect(sql).toMatch(
      /case when p\.match_text is not null and p\.match_key = p_match_key\s+then p\.match_text else p\.description_text end/,
    );
    expect(sql).not.toMatch(/left\(/);
  });

  it('the key is the same for the same profile and changes with its terms or scorer', () => {
    const again = sanitizeProfile(JSON.parse(JSON.stringify(stored)))!;
    expect(matchKey(again)).toBe(matchKey(stored));
    expect(
      matchKey(sanitizeProfile({ ...stored, titles: [...stored.titles, 'Motion Designer'] })!),
    ).not.toBe(matchKey(stored));
    expect(matchKey(sanitizeProfile({ ...stored, scorer: undefined })!)).not.toBe(matchKey(stored));
  });
});

describe('textTermsOf related titles', () => {
  it('holds every related title phrase (feed/mustInclude.ts RELATED_TITLES)', async () => {
    const { RELATED_TITLES } = await import('../feed/mustInclude');
    const terms = textTermsOf(stored);
    for (const phrase of RELATED_TITLES.flatMap((r) => r.phrases)) expect(terms).toContain(phrase);
  });
});

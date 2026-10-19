// Role Radar's fit / gap (docs/specs/role-radar.md, `evidence-profile` + `fit-gap`): what a
// posting asks for, which of those asks the user's evidence covers, and a Strong / Stretch / Reach
// tier. Deterministic phrase rules, no AI (#54): the same posting and evidence always give the
// same answer, and every Fit line cites a proof the user wrote.
import { termRegex } from '../feed/match';
import type { Posting } from '../feed/types';

/** One proof point: a skill and what shows it, optionally with a public link. */
export interface Evidence {
  skill: string;
  proof: string;
  url?: string;
}

/** Something a posting can ask for. */
export interface Ask {
  id: string;
  label: string;
  re: RegExp;
}

export type Tier = 'strong' | 'stretch' | 'reach';

/** The asks the radar knows by default, in the order it reports them. A user's own skills that
 *  aren't here become asks too (see `asksFor`). */
const ASK_CATALOG: readonly Ask[] = [
  {
    id: 'tokens',
    label: 'Design tokens',
    re: /design[\s-]tokens?|token (pipeline|system|architecture)s?|\bdtcg\b/i,
  },
  {
    id: 'a11y',
    label: 'Accessibility',
    re: /accessib|\bwcag\b|\ba11y\b|screen readers?|section 508/i,
  },
  {
    id: 'components',
    label: 'Component library',
    re: /component librar|reusable components?|shared components?|component apis?|ui components?/i,
  },
  {
    id: 'storybook',
    label: 'Storybook / visual regression',
    re: /storybook|chromatic|visual regression/i,
  },
  { id: 'design-system', label: 'Design system ownership', re: /design[\s-]systems?/i },
  {
    id: 'versioning',
    label: 'Versioning & migrations',
    re: /versioning|semver|migration|codemods?|breaking changes?/i,
  },
  {
    id: 'ai',
    label: 'AI agents & coding tools',
    re: /\bai agents?\b|agentic|\bllms?\b|\bcursor\b|\bclaude\b|copilot|coding agents?/i,
  },
  { id: 'figma', label: 'Figma', re: /figma/i },
  {
    id: 'motion',
    label: 'Motion & interaction craft',
    re: /animation|\bmotion\b|micro[\s-]?interactions?/i,
  },
  { id: 'mobile', label: 'React Native / mobile', re: /react native|\bios\b|android|mobile app/i },
  { id: 'experiments', label: 'Experiments & A/B tests', re: /a\/b test|experimentation/i },
  { id: 'docs', label: 'Documentation', re: /documentation|docs site/i },
  {
    id: 'testing',
    label: 'UI testing',
    re: /\bvitest\b|\bjest\b|playwright|testing library|unit tests?|\be2e\b/i,
  },
  { id: 'typescript', label: 'TypeScript', re: /typescript/i },
  {
    id: 'leadership',
    label: 'People leadership',
    re: /people manager|direct reports|manage (a|the) team|lead and develop/i,
  },
];

/** "Skill: proof (https://link)", one per line. A line without a colon is a bare skill. */
export function parseEvidence(text: string): Evidence[] {
  const out: Evidence[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const link = /\((https?:\/\/[^)\s]+)\)\s*$/.exec(line);
    const body = link ? line.slice(0, link.index).trim() : line;
    const colon = body.indexOf(':');
    const skill = (colon < 0 ? body : body.slice(0, colon)).trim();
    if (!skill) continue;
    const item: Evidence = { skill, proof: colon < 0 ? '' : body.slice(colon + 1).trim() };
    if (link) item.url = link[1];
    out.push(item);
  }
  return out;
}

/** The catalog ask a skill names, if any ("Accessibility" → a11y). */
const catalogAskFor = (skill: string) =>
  ASK_CATALOG.find((a) => a.re.test(skill) || a.label.toLowerCase() === skill.toLowerCase());

/** The catalog plus an ask for each evidence skill the catalog doesn't know. */
export function asksFor(evidence: Evidence[]): Ask[] {
  const extra: Ask[] = [];
  for (const e of evidence) {
    if (catalogAskFor(e.skill)) continue;
    const re = termRegex(e.skill);
    if (re && !extra.some((a) => a.label.toLowerCase() === e.skill.toLowerCase()))
      extra.push({ id: `user:${e.skill.toLowerCase()}`, label: e.skill, re });
  }
  return [...ASK_CATALOG, ...extra];
}

/** The asks a posting names, once each, in catalog order. */
export function asksIn(p: Posting, asks: readonly Ask[] = ASK_CATALOG): Ask[] {
  const text = `${p.title}\n${p.text}`;
  return asks.filter((a) => a.re.test(text));
}

/** The evidence that covers an ask, if any. */
function proofFor(ask: Ask, evidence: Evidence[]): Evidence | undefined {
  return evidence.find((e) =>
    ask.id.startsWith('user:')
      ? e.skill.toLowerCase() === ask.label.toLowerCase()
      : catalogAskFor(e.skill)?.id === ask.id,
  );
}

/** Strong: at least 3 asks covered and 70%+ of them. Stretch: 40%+ (or a lone covered ask). */
export function tierOf(fit: number, gap: number): Tier {
  if (fit === 0) return 'reach';
  const coverage = fit / (fit + gap);
  if (fit >= 3 && coverage >= 0.7) return 'strong';
  return coverage >= 0.4 ? 'stretch' : 'reach';
}

export interface FitGap {
  tier: Tier;
  fit: { ask: Ask; proof: string; url?: string }[];
  gap: Ask[];
}

export function fitGap(p: Posting, evidence: Evidence[]): FitGap {
  const fit: FitGap['fit'] = [];
  const gap: Ask[] = [];
  for (const ask of asksIn(p, asksFor(evidence))) {
    const e = proofFor(ask, evidence);
    if (e) fit.push({ ask, proof: e.proof, url: e.url });
    else gap.push(ask);
  }
  return { tier: tierOf(fit.length, gap.length), fit, gap };
}

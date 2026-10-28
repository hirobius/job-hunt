// Seed step 2: find a candidate's job board with the probe (probe.ts: its limiter, its rule that only
// a 200 with a job list is a board) and confirm the board is that company's, not a stranger's under
// the same slug. A board counts as confirmed when one of these holds, strongest first:
//   linked  the source itself linked the board (an HN post's Apply link);
//   domain  the board's own payload names the company's website domain (Greenhouse job links on
//           stripe.com, an "apply at jobs@acme.com" in a description);
//   title   the board lists a job designsystems.jobs saw this company post;
//   name    the board's own name (Greenhouse, Workable) is the company's, or, for a company we only
//           know by name, its descriptions say "At <Name>" / "About <Name>".
// An unconfirmed board is still written to the snapshot (for a person to check) but never watched.
import { createLimiter, hostKey, probeBoard, PROBE_KINDS, type Limiter } from '../probe';
import { boardJobs, canonicalBoardUrl, type Board, type BoardKind } from '../sources/ats';
import { arr, obj, str, type FetchJson } from '../sources/http';
import { domainLabel, normName, registrableDomain, type Candidate } from './parse';

export type Confirmation = 'linked' | 'domain' | 'title' | 'name';

export interface SeedBoard {
  kind: BoardKind;
  slug: string;
  url: string;
  /** Open roles when it was checked. */
  jobs: number;
  /** How we know it is this company's board; null = found under its slug, not confirmed. */
  confirmed: Confirmation | null;
}

export interface Resolved {
  /** found: a live board. missed: every board asked answered none. unknown: some never answered. */
  state: 'found' | 'missed' | 'unknown';
  board: SeedBoard | null;
}

/** Slugs tried per company (each on every probe kind). */
export const MAX_SLUGS = 3;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleKey = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ \d+$/, '');

/** Job titles on a board payload, whatever the ATS calls the field. */
export function boardTitles(b: Board, body: unknown): string[] {
  return (boardJobs(b, body) ?? []).map(obj).map((j) => {
    const attrs = obj(j.attributes);
    return str(j.title) || str(j.text) || str(j.name) || str(attrs.title);
  });
}

/** The name a board gives itself, where its API has one (Workable's payload, Greenhouse's board
 *  endpoint, Recruitee's offers). */
export function boardOwnName(b: Board, body: unknown): string {
  if (b.kind === 'workable') return str(obj(body).name);
  if (b.kind === 'recruitee') return str(obj(arr(obj(body).offers)[0]).company_name);
  return '';
}

export function confirmBoard(
  c: Candidate,
  b: Board,
  body: unknown,
  ownName = boardOwnName(b, body),
): Confirmation | null {
  if (c.linked.some((l) => l.kind === b.kind && l.slug.toLowerCase() === b.slug.toLowerCase()))
    return 'linked';
  const text = JSON.stringify(body ?? '').toLowerCase();
  const domain = c.website && registrableDomain(c.website);
  if (domain && new RegExp(`(^|[^a-z0-9-])${escapeRe(domain)}([^a-z0-9-]|$)`).test(text))
    return 'domain';
  if (c.titles.length) {
    const seen = new Set(c.titles.map(titleKey));
    if (boardTitles(b, body).some((t) => seen.has(titleKey(t)))) return 'title';
  }
  const names = new Set(
    [normName(c.name), c.website ? domainLabel(c.website) : ''].filter(Boolean),
  );
  if (ownName && names.has(normName(ownName))) return 'name';
  // Known only by name (a job post's company line): a description introducing the company.
  if (!c.website && c.name.length >= 4) {
    const raw = JSON.stringify(body ?? '');
    const n = escapeRe(c.name);
    if (new RegExp(`\\b(At|About|Join) ${n}\\b|\\b${n} is (a|an|the)\\b`).test(raw)) return 'name';
  }
  return null;
}

export interface ResolveOptions {
  fetchJson: FetchJson;
  limiter?: Limiter;
  kinds?: BoardKind[];
  signal?: AbortSignal;
}

/** Probe one candidate: its linked boards first, then each slug on every kind, stopping at the
 *  first slug with a confirmed board. An unconfirmed hit is kept only when nothing confirms. */
export async function resolveCandidate(c: Candidate, opts: ResolveOptions): Promise<Resolved> {
  const limiter = opts.limiter ?? createLimiter();
  const kinds = opts.kinds ?? PROBE_KINDS;
  const host = (b: Board) => hostKey(canonicalBoardUrl(b));
  const ask = async (b: Board) => {
    let body: unknown;
    // probeBoard reads the light payload; keep it so confirmation reads the same bytes.
    const ran = await limiter.run(
      host(b),
      () => probeBoard(b, async (url, o) => (body = await opts.fetchJson(url, o))),
      opts.signal,
    );
    if (!ran.ran) return { out: { result: 'unknown' as const, status: 0 }, body };
    if (ran.value.status === 429) limiter.strike(host(b));
    else limiter.ok(host(b));
    return { out: ran.value, body };
  };
  const ownName = async (b: Board, body: unknown) => {
    if (b.kind !== 'greenhouse') return boardOwnName(b, body);
    try {
      return str(
        obj(
          await opts.fetchJson(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}`,
          ),
        ).name,
      );
    } catch {
      return '';
    }
  };
  const seedBoard = (
    b: Board,
    jobs: number | undefined,
    confirmed: Confirmation | null,
  ): SeedBoard => ({
    kind: b.kind,
    slug: b.slug,
    url: canonicalBoardUrl(b),
    jobs: jobs ?? 0,
    confirmed,
  });

  let fallback: SeedBoard | null = null;
  let unknown = false;
  for (const b of c.linked) {
    const { out } = await ask(b);
    if (out.result === 'live') return { state: 'found', board: seedBoard(b, out.jobs, 'linked') };
    if (out.result === 'unknown') unknown = true;
  }
  for (const slug of c.slugs.slice(0, MAX_SLUGS)) {
    const group = kinds.map((kind): Board => ({ kind, slug }));
    const answers = await Promise.all(group.map(ask));
    const reached = answers.some((a) => a.out.result !== 'unknown');
    for (let i = 0; i < group.length; i++) {
      const { out, body } = answers[i];
      if (out.result === 'unknown') {
        // A subdomain board that fails DNS while another ATS answered is simply not there.
        if (!(reached && out.status === 0)) unknown = true;
        continue;
      }
      if (out.result !== 'live') continue;
      const b = group[i];
      const confirmed = confirmBoard(c, b, body, await ownName(b, body));
      if (confirmed) return { state: 'found', board: seedBoard(b, out.jobs, confirmed) };
      fallback ??= seedBoard(b, out.jobs, null);
    }
    if (opts.signal?.aborted) break;
  }
  if (fallback) return { state: 'found', board: fallback };
  return { state: unknown ? 'unknown' : 'missed', board: null };
}

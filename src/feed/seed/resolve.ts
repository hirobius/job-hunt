// Seed step 2: find a candidate's job board with the probe (probe.ts: its limiter, its rule that only
// a 200 with a job list is a board) and confirm the board is that company's, not a stranger's under
// the same slug. A board counts as confirmed when one of these holds, strongest first:
//   linked  the source itself linked the board (an HN post's Apply link);
//   domain  the board's own payload names the company's website domain (Greenhouse job links on
//           stripe.com, an "apply at jobs@acme.com" in a description);
//   title   the board lists a job designsystems.jobs saw this company post;
//   name    the board's own name (Greenhouse, Workable, Recruitee; Lever and Ashby have none) is
//           its website's name, or, for a company seen hiring (a job post), the company's name
//           or a description saying "At <Name>" (only for a distinctive name: DISTINCT_NAME).
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

/** Shortest name a description alone ("At <Name>", "<Name> is a") can confirm. */
export const DISTINCT_NAME = 7;

/** Ordinary English words seen as company names: "At Promise" or "Instrument is a" in a stranger's
 *  description says nothing about whose board it is. Lower case, letters only. */
export const COMMON_WORDS: ReadonlySet<string> = new Set(
  (
    'ability abstract academy account advance advisor airline alliance amplify analyst anchor ' +
    'anthem archive arrival athlete balance barrier battery beacon benefit billion blossom ' +
    'booking bracket brigade cabinet calendar capital caravan careful catalyst central century ' +
    'champion channel chapter charter circuit citizen classic climate cluster collect college ' +
    'compass complete concept conduct connect console contact content context control convert ' +
    'cooking counsel country courage crystal culture current curious customer default delight ' +
    'deliver density digital diploma discord display distant element embassy emerald empower ' +
    'endless engine evident example excited expanse explore express factory faithful fashion ' +
    'feature finance fitness forward freedom frontier gallery general genuine glimpse harbor ' +
    'harvest heritage history holiday homebase horizon imprint instrument journey justice kindred kingdom ' +
    'kitchen landing lantern largest lattice leading lecture liberty library license lighthouse ' +
    'machine mailbox mammoth mansion measure meridian message million mission monarch morning ' +
    'motion natural network neutral notable notion nucleus observe offline opinion orchard ' +
    'outcome outlook outside overture package passage passport pathway pattern payment percent ' +
    'persona picture pilgrim pioneer pivotal planner plateau popular portion premium present ' +
    'primary printer private problem process product program progress project promise prospect ' +
    'protect purpose quantum quarter railway rainbow reality receipt recover reflect relevant ' +
    'remote request reserve resolve respect revenue routine scholar science seasons section ' +
    'segment service shelter signal silicon society soldier speaker spectrum station steward ' +
    'storage strategy studio subject success summary summit support surface sustain teacher ' +
    'thought tonight traffic transit treasure triangle trinity triumph trouble trusted uniform ' +
    'universe upgrade utility venture verdict village virtual visible volume voyage weather ' +
    'welcome western whisper wildfire witness wonder workshop'
  ).split(/\s+/),
);

/** A name a description pattern can safely confirm: long enough and not an everyday word. */
export function distinctName(name: string): boolean {
  const bare = normName(name);
  return bare.length >= DISTINCT_NAME && !COMMON_WORDS.has(bare);
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
  // A design system's name ("Cedar", "Basis") is often some other company's board name, so a
  // name alone confirms only a company seen hiring (a job post) or one named by its own website.
  const hiring = c.evidence.some((e) => e.source === 'dsjobs' || e.source === 'hn');
  const names = new Set(
    [hiring ? normName(c.name) : '', c.website ? domainLabel(c.website) : ''].filter(Boolean),
  );
  if (ownName && names.has(normName(ownName))) return 'name';
  // Known only by a job post's company line: a description introducing the company.
  if (hiring && !c.website && distinctName(c.name)) {
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
  // Greenhouse keeps its board name on a second endpoint: asked (through the limiter) only when
  // the payload alone confirms nothing.
  const greenhouseName = async (b: Board) => {
    try {
      const ran = await limiter.run(
        host(b),
        () =>
          opts.fetchJson(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}`,
          ),
        opts.signal,
      );
      return ran.ran ? str(obj(ran.value).name) : '';
    } catch {
      return '';
    }
  };
  const confirm = async (b: Board, body: unknown) =>
    confirmBoard(c, b, body) ??
    (b.kind === 'greenhouse' ? confirmBoard(c, b, body, await greenhouseName(b)) : null);
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
      const confirmed = await confirm(b, body);
      if (confirmed) return { state: 'found', board: seedBoard(b, out.jobs, confirmed) };
      fallback ??= seedBoard(b, out.jobs, null);
    }
    if (opts.signal?.aborted) break;
  }
  if (fallback) return { state: 'found', board: fallback };
  return { state: unknown ? 'unknown' : 'missed', board: null };
}

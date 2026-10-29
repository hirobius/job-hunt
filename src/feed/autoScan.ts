// Auto-scan (simplify 8/11, #415): one Scan does all discovery, so there are no manual "Load
// batch", "Check open roles", "Find teams" or "Check dream companies" buttons. The client runs it
// when the app opens, at most every 6 hours (the last run is kept in `rjb_autoscan`); "Scan now"
// runs it at once. One run:
//
//   1. discover: leads from YC companies hiring now, the GitHub design-system orgs, the Adele list
//      and the seed list (SEED_LEADS, empty until it lands), each source failure isolated
//   2. probe: up to MAX_PROBES_PER_SCAN new leads through the board probe (its host limits and
//      cache), each hit through the identity check (identity.ts, #417); the rest wait in the queue
//   3. read: every followed board, every confirmed company found, and every job-board feed over
//      every profile title, through the Feed's `PostingReader` (reader.ts; fetchFeed underneath, so
//      the Remotive budget and the session cache hold)
//   4. filter, in idle-time chunks: the design-system inclusion check (mustInclude `passesInclude`)
//      and remote only (Adrian 2026-10-28: remote postings, and those whose place is not stated,
//      marked; on-site and hybrid ones are dropped)
//
// What it keeps: the postings (`rjb_autoscan_postings`, served to Review new by `scanReader`) and
// the New companies it found (Follow / Ignore on Today; a confirmed one's jobs show at once).
// Cancelable (an AbortSignal stops every phase), resumable (the lead queue and an interrupted run
// survive a reload: the next open finishes it), and never in the way: network is async and the
// CPU work yields to the browser between chunks. Everything is per browser (a cache): Follow
// adds the board to the synced Sources, Ignore mutes the company (decided.ts).
import { useSyncExternalStore } from 'react';
import { loadPersisted, savePersisted } from '../persisted';
import { ADELE, adeleNames } from './adele';
import { YC_HIRING_URL, ycMatches } from './companySource';
import { companyKey, muteCompany } from './decided';
import { findDesignSystemOrgs, type GhGet, type RunReport } from './dsOrgs';
import { boardKeyOf, countSources } from './feed';
import { liveFetchJson, type FeedResult } from './fetchFeed';
import { createGithubBudget, type GithubBudget } from './githubBudget';
import { confirmBoard } from './identity';
import { remoteVerdict } from './mode';
import { passesInclude, type IncludeRule } from './mustInclude';
import { termRegex } from './term';
import { createLimiter, probeCompanies, type Limiter } from './probe';
import { browserReader, type PostingReader } from './reader';
import { boardsFromUrls, canonicalBoardUrl, parseBoardUrl, type Board } from './sources/ats';
import type { FetchJson } from './sources/http';
import type { Posting } from './types';
import { followBoard } from '../sources';
import { scanOnOpenEnabled } from './scanOnOpenFlag';

export const SCAN_KEY = 'rjb_autoscan';
export const SCAN_POSTINGS_KEY = 'rjb_autoscan_postings';
/** The client scans on open at most this often. */
export const SCAN_EVERY_MS = 6 * 3600e3;
/** New leads probed per run; the rest wait for the next one (the probe cache makes repeats cheap). */
export const MAX_PROBES_PER_SCAN = 40;
/** YC companies hiring now taken per run (their one-liner or tags must name a profile title). */
export const MAX_YC_LEADS = 30;
/** A lead probed this recently is not probed again. */
export const PROBED_TTL_MS = 14 * 86400e3;
export const MAX_QUEUE = 1000;
export const MAX_FOUND = 300;
/** Postings kept between runs, and how much of each body (storage is small). */
export const MAX_STORED = 300;
export const TEXT_MAX = 1500;
/** A run that has written nothing for this long was cut short (a closed tab): the next open
 *  resumes it. Until then another tab's run is left alone. */
export const RUN_LEASE_MS = 2 * 60e3;
/** Postings filtered between yields to the browser. */
export const CHUNK = 50;

/** The seed list of design-system employers, when it lands (its own slice). */
export const SEED_LEADS: Lead[] = [];

/** Every posting must name a design-system role when the profile has no rule of its own. */
export const DESIGN_SYSTEM_RULE: IncludeRule = {
  terms: ['design system'],
  inTitle: true,
};

export type LeadSource = 'yc' | 'adele' | 'github' | 'seed';

export interface Lead {
  name: string;
  /** The company's website: what the identity check confirms a board against. */
  website?: string;
  via: LeadSource;
  /** A board already found for it (GitHub orgs come probed). */
  board?: Board;
  jobs?: number;
}

export type FoundStatus = 'new' | 'followed' | 'ignored';

export interface FoundCompany {
  /** companyKey of the name. */
  key: string;
  name: string;
  boardUrl: string;
  via: LeadSource;
  /** The identity check trusted the board: its jobs are read into Review at once. */
  confirmed: boolean;
  status: FoundStatus;
  /** Postings from its board that passed the scan's filters, last run. */
  jobs: number;
  at: number;
}

/** A posting the scan kept (`remoteUnstated` marks one that states no work mode or place). */
export type ScanPosting = Posting;

export type ScanPhase = 'discover' | 'probe' | 'read' | 'filter';

export interface ScanState {
  startedAt?: number;
  /** The run in progress last wrote its state (the cross-tab lease). */
  beatAt?: number;
  finishedAt?: number;
  /** Postings first kept by the last run. */
  newCount: number;
  /** Distinct sources that answered on the last run. */
  sourceCount: number;
  /** Postings the last run left out as not design-system roles / not remote. */
  notDesignSystem: number;
  notRemote: number;
  queue: Lead[];
  /** companyKey → when it was probed. */
  probed: Record<string, number>;
  found: FoundCompany[];
  error?: string;
}

const EMPTY: ScanState = {
  newCount: 0,
  sourceCount: 0,
  notDesignSystem: 0,
  notRemote: 0,
  queue: [],
  probed: {},
  found: [],
};

// ---- storage (untrusted on read) ----

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const VIA = new Set<LeadSource>(['yc', 'adele', 'github', 'seed']);
const STATUS = new Set<FoundStatus>(['new', 'followed', 'ignored']);

function sanitizeLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = text(o.name).trim();
  if (!name || !VIA.has(o.via as LeadSource)) return null;
  const board = typeof o.board === 'object' && o.board ? (o.board as Board) : undefined;
  const parsed = board ? parseBoardUrl(canonicalBoardUrlSafe(board)) : null;
  return {
    name,
    via: o.via as LeadSource,
    ...(text(o.website) && { website: text(o.website) }),
    ...(parsed && { board: parsed }),
  };
}

function canonicalBoardUrlSafe(b: Board): string {
  try {
    return canonicalBoardUrl(b);
  } catch {
    return '';
  }
}

export function sanitizeScanState(raw: unknown): ScanState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  const probed: Record<string, number> = {};
  if (o.probed && typeof o.probed === 'object')
    for (const [k, v] of Object.entries(o.probed as Record<string, unknown>))
      if (num(v) !== undefined) probed[k] = v as number;
  const found: FoundCompany[] = [];
  for (const f of Array.isArray(o.found) ? o.found : []) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    const name = text(r.name).trim();
    const boardUrl = text(r.boardUrl);
    if (!name || !parseBoardUrl(boardUrl) || !VIA.has(r.via as LeadSource)) continue;
    found.push({
      key: companyKey(name),
      name,
      boardUrl,
      via: r.via as LeadSource,
      confirmed: r.confirmed === true,
      status: STATUS.has(r.status as FoundStatus) ? (r.status as FoundStatus) : 'new',
      jobs: num(r.jobs) ?? 0,
      at: num(r.at) ?? 0,
    });
  }
  return {
    startedAt: num(o.startedAt),
    beatAt: num(o.beatAt),
    finishedAt: num(o.finishedAt),
    newCount: num(o.newCount) ?? 0,
    sourceCount: num(o.sourceCount) ?? 0,
    notDesignSystem: num(o.notDesignSystem) ?? 0,
    notRemote: num(o.notRemote) ?? 0,
    queue: (Array.isArray(o.queue) ? o.queue : [])
      .map(sanitizeLead)
      .filter((l): l is Lead => !!l)
      .slice(0, MAX_QUEUE),
    probed,
    found: found.slice(-MAX_FOUND),
    ...(text(o.error) && { error: text(o.error) }),
  };
}

function sanitizePostings(raw: unknown): ScanPosting[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is ScanPosting =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as Posting).id === 'string' &&
        typeof (p as Posting).title === 'string' &&
        typeof (p as Posting).company === 'string' &&
        typeof (p as Posting).text === 'string' &&
        typeof (p as Posting).location === 'string' &&
        /^https?:\/\//i.test(String((p as Posting).url)),
    )
    .slice(0, MAX_STORED);
}

const listeners = new Set<() => void>();
let cached: {
  state: ScanState;
  postings: ScanPosting[];
  running: boolean;
  progress?: ScanProgress;
} | null = null;
let running = false;
let progress: ScanProgress | undefined;

function snapshot() {
  if (!cached)
    cached = {
      state: sanitizeScanState(loadPersisted<unknown>(SCAN_KEY, {})),
      postings: sanitizePostings(loadPersisted<unknown>(SCAN_POSTINGS_KEY, [])),
      running,
      progress,
    };
  return cached;
}
const notify = () => {
  cached = null;
  listeners.forEach((l) => l());
};
function writeState(s: ScanState) {
  savePersisted(SCAN_KEY, s);
  notify();
}
function writePostings(p: ScanPosting[]) {
  savePersisted(SCAN_POSTINGS_KEY, p);
  notify();
}

export const getScanState = (): ScanState => snapshot().state;
export const getScanPostings = (): ScanPosting[] => snapshot().postings;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The scan's state for the UI: what the last run found, and whether one is running now. */
export function useScan() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Forget everything (tests; Delete my data clears the `rjb_` keys anyway). */
export function resetScan(): void {
  try {
    localStorage.removeItem(SCAN_KEY);
    localStorage.removeItem(SCAN_POSTINGS_KEY);
  } catch {
    /* blocked storage: nothing to forget */
  }
  notify();
}

/** Whether the app should scan on open: never scanned, a run was cut short, or 6 hours passed.
 *  A run another tab is making (it wrote within RUN_LEASE_MS) is left to that tab. */
export function shouldScan(s: ScanState, now: number): boolean {
  if ((s.startedAt ?? 0) > (s.finishedAt ?? 0))
    return now - (s.beatAt ?? s.startedAt ?? 0) >= RUN_LEASE_MS;
  if (!s.finishedAt) return true;
  return now - s.finishedAt >= SCAN_EVERY_MS;
}

// ---- filters ----

/** Remote only (Adrian 2026-10-28): mode.ts `remoteVerdict` on the posting's mode and location. */
export const remoteOnly = (p: Posting): 'keep' | 'unstated' | 'drop' =>
  remoteVerdict(p.mode, p.location);

/** The profile's must-include when it asks for design systems, else the design-system rule. */
export function inclusionRule(include?: IncludeRule): IncludeRule {
  const terms = !include ? [] : Array.isArray(include) ? include : include.terms;
  if (include && terms.some((t) => t.trim())) return include;
  return DESIGN_SYSTEM_RULE;
}

/** Hand the browser back its turn between chunks of work. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 0);
  });
}

// ---- one run ----

export interface ScanInput {
  /** Every profile title: the feeds are searched for each. */
  terms: string[];
  /** The profile's must include (the inclusion check). */
  include?: IncludeRule;
  /** Boards the user follows (the board Sources). */
  boardUrls: string[];
  /** Keep remote roles only (the profile's Remote only; on unless it says false). */
  remoteOnly?: boolean;
  /** The profile's leave-out words: a posting that says one is not kept. */
  exclude?: string[];
}

export interface ScanDeps {
  fetchJson: FetchJson;
  reader: PostingReader;
  ghGet?: GhGet;
  budget?: GithubBudget;
  limiter?: Limiter;
  now: () => number;
  /** Between chunks of CPU work. */
  pause: () => Promise<void>;
  /** Which lead sources run (all by default). */
  sources?: Partial<Record<LeadSource, boolean>>;
}

export const defaultScanDeps = (): ScanDeps => ({
  fetchJson: liveFetchJson,
  reader: browserReader(),
  now: Date.now,
  pause: yieldToBrowser,
});

const boardKey = (b: Board) => `${b.kind}:${b.slug.toLowerCase()}`;
const boardKeyOfUrl = (url: string) => {
  const b = parseBoardUrl(url);
  return b ? boardKey(b) : null;
};

/** Leads from every discovery source, freshest first (YC hiring now, GitHub orgs, then Adele and
 *  the seed list), each failure isolated (a source that fails adds none). */
export async function gatherLeads(
  input: ScanInput,
  deps: ScanDeps,
  signal?: AbortSignal,
): Promise<Lead[]> {
  const on = (s: LeadSource) => deps.sources?.[s] !== false;
  const out: Lead[] = [];
  if (on('yc') && !signal?.aborted) {
    try {
      const body = await deps.fetchJson(YC_HIRING_URL);
      const terms = ['design system', ...input.terms];
      for (const c of ycMatches(body, terms, MAX_YC_LEADS))
        out.push({ name: c.name, via: 'yc', ...(c.website && { website: c.website }) });
    } catch {
      /* the YC mirror is down: no YC leads this run */
    }
  }
  if (on('github') && !signal?.aborted) {
    const report: RunReport = { searchPages: 0, orgLookups: 0, orgs: 0, unresolved: 0 };
    try {
      for await (const t of findDesignSystemOrgs({
        ghGet: deps.ghGet,
        fetchJson: deps.fetchJson,
        budget: deps.budget ?? createGithubBudget(),
        limiter: deps.limiter,
        signal,
        report,
      }))
        out.push({
          name: t.company,
          via: 'github',
          ...(t.website && { website: t.website }),
          ...(t.board && { board: t.board, jobs: t.openRoles }),
        });
    } catch {
      /* GitHub failed: the orgs found so far stay */
    }
  }
  // The long lists last: hiring-now leads are probed first.
  if (on('seed')) out.push(...SEED_LEADS);
  if (on('adele')) {
    const sites = new Map(ADELE.companies.map((c) => [c.name.toLowerCase(), c.site]));
    for (const name of adeleNames())
      out.push({ name, via: 'adele', website: sites.get(name.toLowerCase()) || undefined });
  }
  return out;
}

export interface ScanProgress {
  phase: ScanPhase;
  /** Leads probed / to probe, while probing. */
  done?: number;
  total?: number;
}

/** One scan. Writes its state as it goes, so a run cut short (closed tab, Cancel) resumes. */
export async function runScan(
  input: ScanInput,
  deps: ScanDeps,
  opts: { signal?: AbortSignal; onProgress?: (p: ScanProgress) => void } = {},
): Promise<ScanState> {
  const { signal, onProgress } = opts;
  const limiter = deps.limiter ?? createLimiter();
  const d: ScanDeps = { ...deps, limiter };
  const halted = () => !!signal?.aborted;
  const now = deps.now();
  let s: ScanState = { ...getScanState(), startedAt: now };
  delete s.error;
  const save = () => writeState({ ...s, beatAt: deps.now() });
  save();
  const step = (p: ScanProgress) => onProgress?.(p);

  // 1. discover
  step({ phase: 'discover' });
  const known = new Set<string>([
    ...s.found.map((f) => f.key),
    ...s.queue.map((l) => companyKey(l.name)),
    ...Object.entries(s.probed)
      .filter(([, at]) => now - at < PROBED_TTL_MS)
      .map(([k]) => k),
  ]);
  const followed = new Set(boardsFromUrls(input.boardUrls, Infinity).map(boardKey));
  const fresh: Lead[] = [];
  for (const l of await gatherLeads(input, d, signal)) {
    const k = companyKey(l.name);
    if (!k || known.has(k)) continue;
    known.add(k);
    fresh.push(l);
  }
  s = { ...s, queue: [...s.queue, ...fresh].slice(0, MAX_QUEUE) };
  save();
  if (halted()) return s;

  // 2. probe (GitHub leads come with their board already; the rest go through the probe)
  const addFound = (lead: Lead, board: Board, confirmed: boolean) => {
    const k = companyKey(lead.name);
    if (s.found.some((f) => f.key === k)) return;
    if (followed.has(boardKey(board))) return;
    s.found = [
      ...s.found,
      {
        key: k,
        name: lead.name,
        boardUrl: canonicalBoardUrl(board),
        via: lead.via,
        confirmed,
        status: 'new' as const,
        jobs: 0,
        at: now,
      },
    ].slice(-MAX_FOUND);
  };
  const markProbed = (lead: Lead) => {
    s.probed = { ...s.probed, [companyKey(lead.name)]: deps.now() };
    s.queue = s.queue.filter((l) => companyKey(l.name) !== companyKey(lead.name));
  };
  const batch = s.queue.slice(0, MAX_PROBES_PER_SCAN);
  const byName = new Map(batch.map((l) => [l.name, l]));
  const toProbe: string[] = [];
  for (const lead of batch) {
    if (lead.board) {
      const r = confirmBoard({
        name: lead.name,
        website: lead.website,
        hits: [{ board: lead.board, jobs: lead.jobs }],
      });
      if (r) addFound(lead, r.board, r.confirmed);
      markProbed(lead);
    } else if (lead.via === 'github') markProbed(lead);
    else toProbe.push(lead.name);
  }
  save();
  let done = 0;
  step({ phase: 'probe', done, total: toProbe.length });
  if (toProbe.length && !halted()) {
    const answered = new Set<string>();
    // The probe's identity check (boardIdentity.ts, #417/#424) weighs each lead's website.
    const websites = new Map(
      toProbe.flatMap((n) => {
        const w = byName.get(n)?.website;
        return w ? [[n.trim().toLowerCase(), w] as const] : [];
      }),
    );
    for await (const r of probeCompanies(toProbe, {
      fetchJson: d.fetchJson,
      signal,
      limiter,
      websites,
    })) {
      const lead = byName.get(r.input);
      done++;
      if (lead) {
        answered.add(r.input);
        if (r.state === 'unknown') {
          // No answer is not "none": back of the queue, asked again next run.
          s.queue = [...s.queue.filter((l) => l !== lead), lead];
        } else {
          // A board the check confirmed is read at once; one it could not is listed, never read.
          if (r.hits.length) addFound(lead, r.hits[0].board, true);
          else if (r.unconfirmed.length) addFound(lead, r.unconfirmed[0].board, false);
          markProbed(lead);
        }
        save();
      }
      step({ phase: 'probe', done, total: toProbe.length });
      await d.pause();
    }
    // Names the probe can't read never answer: drop them once the run got through the batch.
    if (!halted())
      for (const name of toProbe) if (!answered.has(name)) markProbed(byName.get(name)!);
    save();
  }
  if (halted()) return s;

  // 3. read every followed board, every confirmed company found, and every feed
  step({ phase: 'read' });
  const readUrls = scanBoardUrls(input.boardUrls, s);
  let result: FeedResult;
  try {
    result = await d.reader.read({ terms: input.terms, boardUrls: readUrls });
  } catch {
    s = { ...s, error: 'The scan could not read its sources. It will try again.' };
    save();
    return s;
  }
  if (halted()) return s;

  // 4. filter, a chunk at a time
  step({ phase: 'filter' });
  const rule = inclusionRule(input.include);
  const leaveOut = (input.exclude ?? []).map(termRegex).filter((r): r is RegExp => !!r);
  const kept: ScanPosting[] = [];
  let notDs = 0;
  let notRemote = 0;
  const seen = new Set<string>();
  for (let i = 0; i < result.postings.length; i += CHUNK) {
    for (const p of result.postings.slice(i, i + CHUNK)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (!passesInclude(rule, p.title, p.text)) {
        notDs++;
        continue;
      }
      if (leaveOut.some((re) => re.test(p.title) || re.test(p.text))) continue;
      const remote = input.remoteOnly === false ? 'keep' : remoteOnly(p);
      if (remote === 'drop') {
        notRemote++;
        continue;
      }
      kept.push({
        ...p,
        text: p.text.length > TEXT_MAX ? p.text.slice(0, TEXT_MAX) : p.text,
        ...(remote === 'unstated' && { remoteUnstated: true as const }),
      });
    }
    await d.pause();
    if (halted()) return s;
  }
  const before = new Set(getScanPostings().map((p) => p.id));
  const newest = (p: Posting) => (p.postedAt ? Date.parse(p.postedAt) || 0 : 0);
  const stored = kept.sort((a, b) => newest(b) - newest(a)).slice(0, MAX_STORED);
  const perBoard = new Map<string, number>();
  for (const p of stored) {
    const k = boardKeyOf(p.id);
    if (k) perBoard.set(k, (perBoard.get(k) ?? 0) + 1);
  }
  s = {
    ...s,
    finishedAt: deps.now(),
    newCount: stored.filter((p) => !before.has(p.id)).length,
    sourceCount: countSources(result.sources).read,
    notDesignSystem: notDs,
    notRemote,
    found: s.found.map((f) => ({ ...f, jobs: perBoard.get(boardKeyOfUrl(f.boardUrl) ?? '') ?? 0 })),
  };
  writePostings(stored);
  save();
  return s;
}

/** The boards a run reads: every followed board and every confirmed company it found, not ignored.
 *  Today's "Scanning N sources" counts these too (feed/scanningCount.ts). */
export function scanBoardUrls(followed: readonly string[], s: Pick<ScanState, 'found'>): string[] {
  return [
    ...new Set([
      ...followed,
      ...s.found.filter((f) => f.confirmed && f.status !== 'ignored').map((f) => f.boardUrl),
    ]),
  ].sort();
}

// ---- the one run at a time ----

let current: { ctl: AbortController; done: Promise<ScanState> } | null = null;

/** Scan now: start a run (or join the one running). */
export function scanNow(input: ScanInput, deps: ScanDeps = defaultScanDeps()): Promise<ScanState> {
  if (current) return current.done;
  const ctl = new AbortController();
  running = true;
  notify();
  const done = runScan(input, deps, {
    signal: ctl.signal,
    onProgress: (p) => {
      progress = p;
      notify();
    },
  })
    .catch(() => getScanState())
    .finally(() => {
      current = null;
      running = false;
      progress = undefined;
      notify();
    });
  current = { ctl, done };
  return done;
}

/** Stop the run in flight. What it found so far is kept, and the next open finishes it. */
export function cancelScan(): void {
  current?.ctl.abort();
}

export const isScanning = () => !!current;

export { setScanOnOpen } from './scanOnOpenFlag';

/** On app open: scan when it is due, once the browser is idle. Returns a cancel for the wait. */
export function scanOnOpen(
  input: () => ScanInput,
  deps: () => ScanDeps = defaultScanDeps,
): () => void {
  let live = scanOnOpenEnabled();
  if (!live) return () => {};
  void yieldToBrowser().then(() => {
    if (live && !current && shouldScan(getScanState(), Date.now())) void scanNow(input(), deps());
  });
  return () => {
    live = false;
  };
}

// ---- Review new and New companies ----

/** Review new's reader: the inner read (followed boards and feeds, live, as the profile's filters
 *  see them) plus what the last scan kept (remote design-system roles, confirmed New companies'
 *  among them), never an ignored company's. */
export function scanReader(inner: PostingReader = browserReader()): PostingReader {
  return {
    async read(req, onProgress) {
      const live = await inner.read(req, onProgress);
      const state = getScanState();
      const ignored = new Set(
        state.found.filter((f) => f.status === 'ignored').map((f) => boardKeyOfUrl(f.boardUrl)),
      );
      const ids = new Set(live.postings.map((p) => p.id));
      const added = getScanPostings().filter((p) => {
        const board = boardKeyOf(p.id);
        return !ids.has(p.id) && !(board && ignored.has(board));
      });
      return { postings: [...live.postings, ...added], sources: live.sources };
    },
  };
}

function setStatus(key: string, status: FoundStatus) {
  const s = getScanState();
  writeState({ ...s, found: s.found.map((f) => (f.key === key ? { ...f, status } : f)) });
}

/** Follow a company the scan found: its board joins the Sources. Returns the undo. */
export function followFound(key: string): () => void {
  const f = getScanState().found.find((x) => x.key === key);
  if (!f) return () => {};
  const b = parseBoardUrl(f.boardUrl);
  const undo = b ? followBoard(b, f.name).undo : () => {};
  setStatus(key, 'followed');
  return () => {
    undo();
    setStatus(key, f.status);
  };
}

/** Ignore a company the scan found: muted (Not this company), never brought back. */
export function ignoreFound(key: string): () => void {
  const f = getScanState().found.find((x) => x.key === key);
  if (!f) return () => {};
  const unmute = muteCompany(f.name);
  setStatus(key, 'ignored');
  return () => {
    unmute();
    setStatus(key, f.status);
  };
}

/** The companies to show under New companies: found and not yet followed or ignored. */
export const newCompanies = (s: ScanState): FoundCompany[] =>
  s.found.filter((f) => f.status === 'new');

/** "Last scanned 14:05 · 12 new from 9 sources". `counts`: Review new's own (FeedView newToday and
 *  sourcesRead, from feed.ts countSources) once it has read, so the page shows one number; else the
 *  scan's. `scanning`: how many sources are scanned (feed/scanningCount.ts); given, it leads and
 *  stands in for the answered count: "Scanning 5,214 sources · Last scanned 14:05, 12 new". Null
 *  before the first run. */
export function lastScannedLine(
  s: ScanState,
  locale?: string,
  counts?: { newToday: number; sources: number },
  scanning?: number,
): string | null {
  if (!s.finishedAt) return null;
  const at = new Date(s.finishedAt).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const fresh = counts?.newToday ?? s.newCount;
  if (scanning !== undefined)
    return `Scanning ${scanning.toLocaleString('en-US')} ${scanning === 1 ? 'source' : 'sources'} · Last scanned ${at}, ${fresh} new`;
  const n = counts?.sources ?? s.sourceCount;
  return `Last scanned ${at} · ${fresh} new from ${n} ${n === 1 ? 'source' : 'sources'}`;
}

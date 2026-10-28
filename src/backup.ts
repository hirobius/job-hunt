// Full-account backup + validated restore (#100). Pure: build a JSON backup of everything the
// account holds (jobs, copy deck, curation board, tile triage, Recently removed, Documents, the
// Application kit and sweep titles: every synced store, so it is the "download all my data" export, #47), parse + sanitize an untrusted
// file back into that shape, and apply it onto current state as a merge or a replace.
// Parsing never trusts the input: known fields are copied into fresh objects, URLs must be
// http(s), and prototype-pollution keys are dropped.
import { BRAND } from './brand';
import { dedupKey, mergeJobs, sanitizeJobs } from './store';
import { mergeSnippets, type Snippet } from './copyDeckStore';
import { mergeCuration } from './curation/merge';
import type { CurationState } from './curation/types';
import { mergeTriage, type Triage } from './tileTriage';
import { STATUSES, type Job } from './types';
import { isSample, withoutSample } from './demo/isSample';
import { mergeTrash, sanitizeTrash, type Removed } from './trash';
import { mergeTargets, sanitizeTargets, type Target } from './feed/targets';
import { mergeFilters, sanitizeFilters, type SavedFilter } from './feed/savedFilters';
import { capEvidence, mergeEvidence } from './radar/evidenceStore';
import { mergeModes, sanitizeModes } from './trackModes';
import { mergeDreams, sanitizeDreams, type Dream } from './feed/dreams';
import type { WorkMode } from './jobsData';
import {
  mergeDocuments,
  sanitizeDocuments,
  withoutSampleDocuments,
  type Document,
} from './documents';
import { mergeKit, sanitizeKit, type ApplyKit } from './applyKit';
import { mergeSweeps, sanitizeSweeps, type SweepTitles } from './feed/sweepTitles';
import { mergeMustInclude, sanitizeMustInclude, type MustInclude } from './feed/mustInclude';
import { mergeProfiles, sanitizeProfiles, type Profile } from './profile';
import { mergeSources, sanitizeSources, type Source } from './sources';
import { mergeDecided, sanitizeDecided, type Decided } from './decided';

export interface AccountState {
  jobs: Job[];
  copydeck: Snippet[];
  curation: CurationState;
  triage: Triage;
  /** Outreach targets, saved searches, evidence and work modes (ADR 0008). Older backups lack them. */
  targets: Record<string, Target[]>;
  filters: Record<string, SavedFilter[]>;
  evidence: string;
  modes: Record<string, WorkMode>;
  /** Recently removed (blob v8). Older backups lack it. */
  trash: Removed[];
  /** Dream companies per track. Older backups lack them. */
  dreams: Record<string, Dream[]>;
  /** Documents and their Versions (#226). Older backups lack them. */
  documents: Document[];
  /** The Application kit (blob v6) and wide-sweep titles (v7) (#47). Older backups lack them. */
  kit: ApplyKit;
  sweeps: Record<string, SweepTitles>;
  /** Must-include terms per track (blob v11). Older backups lack them. */
  mustInclude: Record<string, MustInclude>;
  /** The Search profile, Sources and decided postings (blob v12). Older backups lack them. */
  profiles: Profile[];
  sources: Source[];
  decided: Decided[];
}

export interface Backup extends AccountState {
  app: 'apply-board';
  kind: 'backup';
  v: 1;
  exportedAt: string;
  /** Read from a file made before blob v12 (none of profiles / sources / decided). Never written. */
  before12?: true;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; reason: string };

/** What one origin's localStorage holds in the browsers we support (about 5M characters), and
 *  so the most a whole account can be: every store, final copies included, lives there. */
export const LOCAL_STORAGE_CHARS = 5 * 1024 * 1024;
/** The restore limit (#340). Back up pretty-prints, which at worst (storage full of tiny nested
 *  objects) about triples the size (backup.test.ts pins it), so 20 MB takes the largest account
 *  a browser can hold, and still refuses a runaway file. */
export const MAX_BACKUP_CHARS = 20 * 1024 * 1024;
export const MAX_BACKUP_MB = MAX_BACKUP_CHARS / 1024 / 1024;

/** A backup file Restore would refuse: Back up warns instead of handing over a dead file. */
export const backupTooLarge = (text: string) => text.length > MAX_BACKUP_CHARS;

export function buildBackup(state: AccountState, now: Date): Backup {
  return {
    app: 'apply-board',
    kind: 'backup',
    v: 1,
    exportedAt: now.toISOString(),
    jobs: withoutSample(state.jobs), // sample data (#107) never goes into a backup
    copydeck: state.copydeck,
    curation: state.curation,
    triage: state.triage,
    targets: state.targets,
    filters: state.filters,
    evidence: state.evidence,
    modes: state.modes,
    trash: state.trash.filter((r) => !isSample(r.job)),
    dreams: state.dreams,
    documents: withoutSampleDocuments(state.documents, state.jobs),
    kit: state.kit,
    sweeps: state.sweeps,
    mustInclude: state.mustInclude,
    profiles: state.profiles,
    sources: state.sources,
    decided: state.decided,
  };
}

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const isHttp = (u: unknown): u is string => {
  if (!isStr(u)) return false;
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
};
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
const safeId = (x: unknown): x is string => isStr(x) && !!x && !UNSAFE_KEYS.includes(x);

/** Strip prototype-pollution keys from an object we did not build field by field. */
function scrub<T extends object>(o: T): T {
  for (const k of UNSAFE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, k)) delete (o as Rec)[k];
  }
  return o;
}

const STATUS_SET = new Set<string>(STATUSES);
const EVENT_KINDS = new Set(['interview', 'call', 'other']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;
const JOB_STRING_KEYS = [
  'applied',
  'followUp',
  'note',
  'contact',
  'resume',
  'salary',
  'company',
  'location',
  'seniority',
  'notes',
  'angle',
  'screenedAt',
  'mode',
  'verdict',
] as const;

/** Every key on the Job model (src/types.ts). A restored job keeps only these (#341):
 *  an unknown key rides in from a hand-edited or foreign backup — worst case `demo: true`,
 *  which makes a real job count as sample data and silently drop out of sync and backups.
 *  Typed as a Record over `keyof Job`, so a new Job field fails typecheck until it is listed
 *  here (else a restore would silently drop it). */
const JOB_KEY_LIST: Record<keyof Job, true> = {
  url: true,
  label: true,
  status: true,
  applied: true,
  followUp: true,
  snoozeUntil: true,
  deadline: true,
  note: true,
  contact: true,
  resume: true,
  salary: true,
  company: true,
  location: true,
  seniority: true,
  priority: true,
  archived: true,
  todos: true,
  notes: true,
  verdict: true,
  mode: true,
  blockers: true,
  angle: true,
  screenedAt: true,
  history: true,
  events: true,
  decks: true,
};
const JOB_KEYS = new Set(Object.keys(JOB_KEY_LIST));

/** Nested job fields are rendered and computed on (agenda, .ics, metrics): keep only
 *  well-formed entries so a hand-edited backup can't crash a view after restore. */
function cleanJobFields(j: Job): Job {
  const o = j as unknown as Rec;
  for (const k of Object.keys(o)) if (!JOB_KEYS.has(k)) delete o[k];
  // Boolean flags are kept only when actually boolean (#341).
  if ('priority' in o && typeof o.priority !== 'boolean') delete o.priority;
  if ('archived' in o && typeof o.archived !== 'boolean') delete o.archived;
  for (const k of JOB_STRING_KEYS) if (k in o && !isStr(o[k])) delete o[k];
  if ('todos' in o)
    j.todos = arr(o.todos)
      .filter(isRec)
      .filter((t) => isStr(t.id) && isStr(t.text))
      .map((t) => ({ id: t.id as string, text: t.text as string, done: t.done === true }));
  if ('history' in o)
    j.history = arr(o.history)
      .filter(isRec)
      .filter((h) => isStr(h.status) && STATUS_SET.has(h.status) && isStr(h.at))
      .map((h) => ({ status: h.status as Job['status'], at: h.at as string }));
  if ('events' in o)
    j.events = arr(o.events)
      .filter(isRec)
      .filter(
        (e) =>
          safeId(e.id) &&
          isStr(e.kind) &&
          EVENT_KINDS.has(e.kind) &&
          isStr(e.date) &&
          YMD.test(e.date),
      )
      .map((e) => {
        const ev: NonNullable<Job['events']>[number] = {
          id: e.id as string,
          kind: e.kind as 'interview' | 'call' | 'other',
          date: e.date as string,
        };
        if (isStr(e.time) && HM.test(e.time)) ev.time = e.time;
        if (typeof e.durationMin === 'number' && e.durationMin > 0) ev.durationMin = e.durationMin;
        if (isStr(e.note)) ev.note = e.note;
        return ev;
      });
  if ('blockers' in o) j.blockers = arr(o.blockers).filter(isStr);
  return j;
}

function cleanJobs(raw: unknown): Job[] {
  const input = arr(raw).filter(isRec);
  return sanitizeJobs(input)
    .filter((j) => isHttp(j.url))
    .map(scrub)
    .map(cleanJobFields);
}

/** Removed jobs get the same field-by-field cleaning as live ones. */
function cleanTrash(raw: unknown): Removed[] {
  const out: Removed[] = [];
  for (const r of arr(raw)) {
    if (!isRec(r)) continue;
    const [job] = cleanJobs([r.job]);
    if (job) out.push({ job, removedAt: str(r.removedAt) });
  }
  return sanitizeTrash(out);
}

/** A job that is saved is not also listed as removed. */
const notSaved = (trash: Removed[], jobs: Job[]) => {
  const saved = new Set(jobs.map((j) => dedupKey(j.url)));
  return trash.filter((r) => !saved.has(dedupKey(r.job.url)));
};

/** A template's variable values (#221): own string values under safe keys; none → undefined. */
function cleanValues(raw: unknown): Record<string, string> | undefined {
  if (!isRec(raw)) return undefined;
  const entries = Object.entries(raw).filter(
    (e): e is [string, string] => safeId(e[0]) && isStr(e[1]),
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function cleanSnippets(raw: unknown): Snippet[] {
  const out: Snippet[] = [];
  for (const s of arr(raw)) {
    if (!isRec(s) || !safeId(s.id) || !isStr(s.label) || !isStr(s.body)) continue;
    const snip: Snippet = { id: s.id, label: s.label, body: s.body };
    if (typeof s.open === 'boolean') snip.open = s.open;
    if (typeof s.pinned === 'boolean') snip.pinned = s.pinned;
    if (Array.isArray(s.pillars)) snip.pillars = s.pillars.filter(isStr);
    if (s.migrated === true) snip.migrated = true;
    const values = cleanValues(s.values);
    if (values) snip.values = values;
    out.push(snip);
  }
  return out;
}

const strList = (x: unknown) => arr(x).filter(isStr);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const str = (x: unknown) => (isStr(x) ? x : '');

function cleanCuration(raw: unknown): CurationState {
  const c = isRec(raw) ? raw : {};
  const categories: CurationState['categories'] = [];
  for (const r of arr(c.categories)) {
    if (!isRec(r) || !safeId(r.id) || !isStr(r.label)) continue;
    categories.push({
      id: r.id,
      label: r.label,
      titles: strList(r.titles),
      atsRoles: strList(r.atsRoles),
      seniority: r.seniority === 'entry' || r.seniority === 'experienced' ? r.seniority : 'any',
      location: str(r.location),
      tailorRole: isStr(r.tailorRole) ? r.tailorRole : null,
      sortOrder: num(r.sortOrder),
      archived: r.archived === true,
      createdAt: str(r.createdAt),
      updatedAt: str(r.updatedAt),
    });
  }
  const groups: CurationState['groups'] = [];
  for (const r of arr(c.groups)) {
    if (!isRec(r) || !safeId(r.id) || !isStr(r.categoryId)) continue;
    groups.push({
      id: r.id,
      categoryId: r.categoryId,
      label: str(r.label),
      sortOrder: num(r.sortOrder),
      archived: r.archived === true,
      createdAt: str(r.createdAt),
    });
  }
  const tiles: CurationState['tiles'] = [];
  for (const r of arr(c.tiles)) {
    if (!isRec(r) || !safeId(r.id) || !isStr(r.groupId) || !isHttp(r.url)) continue;
    tiles.push({
      id: r.id,
      groupId: r.groupId,
      name: str(r.name),
      url: r.url,
      meta: str(r.meta),
      sortOrder: num(r.sortOrder),
      createdAt: str(r.createdAt),
    });
  }
  // Drop orphans: the cloud tables enforce these FKs, so an orphan would fail every upload.
  const catIds = new Set(categories.map((x) => x.id));
  const keptGroups = groups.filter((g) => catIds.has(g.categoryId));
  const groupIds = new Set(keptGroups.map((x) => x.id));
  return { categories, groups: keptGroups, tiles: tiles.filter((t) => groupIds.has(t.groupId)) };
}

function cleanTriage(raw: unknown): Triage {
  const t = isRec(raw) ? raw : {};
  return { dismissed: strList(t.dismissed) }; // an old backup's pins are dropped (#19)
}

export function parseBackup(text: string): ParseResult {
  if (backupTooLarge(text)) {
    return { ok: false, reason: `That file is too large (over ${MAX_BACKUP_MB} MB).` };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file isn't valid JSON." };
  }
  if (!isRec(data) || data.app !== 'apply-board' || data.kind !== 'backup') {
    return { ok: false, reason: `This file isn't a backup from ${BRAND.name}.` };
  }
  if (data.v !== 1) {
    return { ok: false, reason: `Backup version ${String(data.v)} isn't supported.` };
  }
  return {
    ok: true,
    backup: {
      app: 'apply-board',
      kind: 'backup',
      v: 1,
      exportedAt: str(data.exportedAt),
      jobs: cleanJobs(data.jobs),
      copydeck: cleanSnippets(data.copydeck),
      curation: cleanCuration(data.curation),
      triage: cleanTriage(data.triage),
      targets: sanitizeTargets(data.targets),
      filters: sanitizeFilters(data.filters),
      evidence: isStr(data.evidence) ? capEvidence(data.evidence) : '',
      modes: sanitizeModes(data.modes),
      trash: cleanTrash(data.trash),
      dreams: sanitizeDreams(data.dreams),
      documents: sanitizeDocuments(data.documents),
      kit: sanitizeKit(data.kit),
      sweeps: sanitizeSweeps(data.sweeps),
      mustInclude: sanitizeMustInclude(data.mustInclude),
      profiles: sanitizeProfiles(data.profiles),
      sources: sanitizeSources(data.sources),
      decided: sanitizeDecided(data.decided),
      ...(!('profiles' in data || 'sources' in data || 'decided' in data) && {
        before12: true as const,
      }),
    },
  };
}

/** Replace = the backup's data. Merge = the backup plays "cloud" (it wins on shared keys). */
export function applyBackup(
  current: AccountState,
  backup: AccountState & Pick<Backup, 'before12'>,
  mode: 'merge' | 'replace',
): AccountState {
  if (mode === 'replace') {
    return {
      jobs: backup.jobs,
      copydeck: backup.copydeck,
      curation: backup.curation,
      triage: backup.triage,
      targets: backup.targets,
      filters: backup.filters,
      evidence: backup.evidence,
      modes: backup.modes,
      trash: notSaved(backup.trash, backup.jobs),
      dreams: backup.dreams,
      documents: backup.documents,
      kit: backup.kit,
      sweeps: backup.sweeps,
      mustInclude: backup.mustInclude,
      // A backup from before v12 has none of these: Replace keeps this device's (its stars, mutes
      // and profile edits), and the v12 move tops Sources up from the restored tracks.
      ...(backup.before12
        ? { profiles: current.profiles, sources: current.sources, decided: current.decided }
        : { profiles: backup.profiles, sources: backup.sources, decided: backup.decided }),
    };
  }
  const jobs = mergeJobs(backup.jobs, current.jobs);
  return {
    jobs,
    copydeck: mergeSnippets(backup.copydeck, current.copydeck),
    curation: mergeCuration(backup.curation, current.curation),
    triage: mergeTriage(backup.triage, current.triage),
    targets: mergeTargets(backup.targets, current.targets),
    filters: mergeFilters(backup.filters, current.filters),
    evidence: mergeEvidence(backup.evidence, current.evidence),
    modes: mergeModes(backup.modes, current.modes),
    trash: notSaved(mergeTrash(backup.trash, current.trash), jobs),
    dreams: mergeDreams(backup.dreams, current.dreams),
    documents: mergeDocuments(backup.documents, current.documents),
    kit: mergeKit(backup.kit, current.kit),
    sweeps: mergeSweeps(backup.sweeps, current.sweeps),
    mustInclude: mergeMustInclude(backup.mustInclude, current.mustInclude),
    profiles: mergeProfiles(backup.profiles, current.profiles),
    sources: mergeSources(backup.sources, current.sources),
    decided: mergeDecided(backup.decided, current.decided),
  };
}

/** What Replace changes, in the words the app uses (#338): one count per store, each with its
 *  singular and plural. Jobs and Documents always show; the rest only when either side has some. */
const COUNTS: { count: (s: AccountState) => number; one: string; many: string; always?: true }[] = [
  { count: (s) => s.jobs.length, one: 'job', many: 'jobs', always: true },
  {
    // An older backup's messages are snippets, which become Documents once restored.
    count: (s) => s.documents.length + s.copydeck.filter((x) => !x.migrated).length,
    one: 'document',
    many: 'documents',
    always: true,
  },
  { count: (s) => s.curation.categories.length, one: 'track', many: 'tracks' },
  { count: (s) => s.curation.tiles.length, one: 'link', many: 'links' },
  { count: (s) => total(s.dreams), one: 'dream company', many: 'dream companies' },
  { count: (s) => total(s.targets), one: 'saved target', many: 'saved targets' },
  { count: (s) => total(s.filters), one: 'saved search', many: 'saved searches' },
  { count: (s) => s.trash.length, one: 'removed job', many: 'removed jobs' },
  {
    count: (s) =>
      Object.values(s.kit.fields).filter((v) => v?.trim()).length + s.kit.answers.length,
    one: 'kit entry',
    many: 'kit entries',
  },
  { count: (s) => Object.keys(s.sweeps).length, one: 'title list', many: 'title lists' },
  {
    count: (s) => Object.keys(s.mustInclude).length,
    one: 'must-include list',
    many: 'must-include lists',
  },
  { count: (s) => Object.keys(s.modes).length, one: 'work mode', many: 'work modes' },
  { count: (s) => s.triage.dismissed.length, one: 'set-aside link', many: 'set-aside links' },
  { count: (s) => (s.evidence.trim() ? 1 : 0), one: 'evidence note', many: 'evidence notes' },
];

const total = (byTrack: Record<string, unknown[]>) =>
  Object.values(byTrack).reduce((n, list) => n + list.length, 0);

/** Both sides of a restore as one line each ("1 job, 2 documents, 1 track"). */
export function summarizeRestore(
  current: AccountState,
  next: AccountState,
): { current: string; next: string } {
  const rows = COUNTS.map((c) => ({ ...c, now: c.count(current), then: c.count(next) })).filter(
    (r) => r.always || r.now > 0 || r.then > 0,
  );
  const line = (n: (r: (typeof rows)[number]) => number) =>
    rows.map((r) => `${n(r)} ${n(r) === 1 ? r.one : r.many}`).join(', ');
  return { current: line((r) => r.now), next: line((r) => r.then) };
}

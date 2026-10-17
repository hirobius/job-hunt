// Full-account backup + validated restore (#100). Pure: build a JSON backup of everything the
// account holds (jobs, copy deck, curation board, tile triage, Recently removed), parse + sanitize an untrusted
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
import type { WorkMode } from './jobsData';

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
  /** Recently removed (blob v7). Older backups lack it. */
  trash: Removed[];
}

export interface Backup extends AccountState {
  app: 'apply-board';
  kind: 'backup';
  v: 1;
  exportedAt: string;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; reason: string };

export const MAX_BACKUP_CHARS = 5 * 1024 * 1024;

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

/** Nested job fields are rendered and computed on (agenda, .ics, metrics): keep only
 *  well-formed entries so a hand-edited backup can't crash a view after restore. */
function cleanJobFields(j: Job): Job {
  const o = j as unknown as Rec;
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

function cleanSnippets(raw: unknown): Snippet[] {
  const out: Snippet[] = [];
  for (const s of arr(raw)) {
    if (!isRec(s) || !safeId(s.id) || !isStr(s.label) || !isStr(s.body)) continue;
    const snip: Snippet = { id: s.id, label: s.label, body: s.body };
    if (typeof s.open === 'boolean') snip.open = s.open;
    if (typeof s.pinned === 'boolean') snip.pinned = s.pinned;
    if (Array.isArray(s.pillars)) snip.pillars = s.pillars.filter(isStr);
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
  return { pinned: strList(t.pinned), dismissed: strList(t.dismissed) };
}

export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_CHARS) {
    return { ok: false, reason: 'That file is too large (over 5 MB).' };
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
    },
  };
}

/** Replace = the backup's data. Merge = the backup plays "cloud" (it wins on shared keys). */
export function applyBackup(
  current: AccountState,
  backup: AccountState,
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
  };
}

export interface RestoreCounts {
  jobs: number;
  snippets: number;
  tracks: number;
  links: number;
}

const countsOf = (s: AccountState): RestoreCounts => ({
  jobs: s.jobs.length,
  snippets: s.copydeck.length,
  tracks: s.curation.categories.length,
  links: s.curation.tiles.length,
});

export function summarizeRestore(
  current: AccountState,
  next: AccountState,
): { current: RestoreCounts; next: RestoreCounts } {
  return { current: countsOf(current), next: countsOf(next) };
}

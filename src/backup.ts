// Full-account backup + validated restore (#100). Pure: build a JSON backup of everything the
// account holds (jobs, copy deck, curation board, tile triage), parse + sanitize an untrusted
// file back into that shape, and apply it onto current state as a merge or a replace.
// Parsing never trusts the input: known fields are copied into fresh objects, URLs must be
// http(s), and prototype-pollution keys are dropped.
import { mergeJobs, sanitizeJobs } from './store';
import { mergeSnippets, type Snippet } from './copyDeckStore';
import { mergeCuration } from './curation/merge';
import type { CurationState } from './curation/types';
import { mergeTriage, type Triage } from './tileTriage';
import type { Job } from './types';

export interface AccountState {
  jobs: Job[];
  copydeck: Snippet[];
  curation: CurationState;
  triage: Triage;
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
    jobs: state.jobs,
    copydeck: state.copydeck,
    curation: state.curation,
    triage: state.triage,
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

function cleanJobs(raw: unknown): Job[] {
  const input = arr(raw).filter(isRec);
  return sanitizeJobs(input)
    .filter((j) => isHttp(j.url))
    .map(scrub);
}

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
  return { categories, groups, tiles };
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
    return { ok: false, reason: "This isn't an Apply Board backup." };
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
    };
  }
  return {
    jobs: mergeJobs(backup.jobs, current.jobs),
    copydeck: mergeSnippets(backup.copydeck, current.copydeck),
    curation: mergeCuration(backup.curation, current.curation),
    triage: mergeTriage(backup.triage, current.triage),
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

// Copy Deck store — outreach/cover snippets, tagged to pillars, pinnable. Seeds are
// neutral templates using [Company]/[Role]/[Contact]/[Angle] tokens (see templateFill.ts),
// with no personal details (#14, #103). A small external store (mirrors store.ts /
// pillarStore.ts) so the deck can sync to the cloud even when the Copy Deck tab has never
// been opened. Self-initializes from localStorage, falling back to the defaults.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';

export interface Snippet {
  id: string;
  label: string;
  body: string;
  open?: boolean;
  pillars?: string[]; // pillar ids this snippet is tagged to; empty/undefined = global
  pinned?: boolean;
}

const KEY = 'rjb_copydeck_v1';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const DEFAULTS: Snippet[] = [
  {
    id: 'tpl-outreach',
    label: 'Outreach note',
    body: "Hi [Contact],\n\nI came across the [Role] opening at [Company] and wanted to reach out directly. [Angle]\n\nI'd love to learn more about the team and how I could help. Would you be open to a quick conversation? I've attached my resume for context.\n\nThank you for your time,\n[Your name]",
  },
  {
    id: 'tpl-cover',
    label: 'Cover letter',
    body: "Dear [Contact],\n\nI'm writing to apply for the [Role] position at [Company]. [Angle]\n\nI'm drawn to this role because it matches the work I do best, and I'd welcome the chance to show how I can contribute to your team. My resume is attached, and I'm glad to share more detail on anything that would be helpful.\n\nThank you for considering my application. I look forward to hearing from you.\n\nSincerely,\n[Your name]",
  },
  {
    id: 'tpl-followup',
    label: 'Follow-up after applying',
    body: "Hi [Contact],\n\nI applied for the [Role] role at [Company] about a week ago and wanted to follow up. I'm still very interested in the position. [Angle]\n\nIf there's anything else I can send to help with your review, just let me know. Thanks again for your time.\n\nBest,\n[Your name]",
  },
  {
    id: 'tpl-thanks',
    label: 'Thank-you after interview',
    body: "Hi [Contact],\n\nThank you for taking the time to talk with me about the [Role] role at [Company]. I enjoyed learning more about the team and what you're looking for. [Angle]\n\nI'm excited about the opportunity and happy to answer any follow-up questions.\n\nWarm regards,\n[Your name]",
  },
];

function load(): Snippet[] {
  let arr: Snippet[] = DEFAULTS;
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(r) && r.length) arr = r.map((s: Snippet) => ({ ...s, id: s.id || newId() }));
  } catch {
    /* ignore */
  }
  return arr;
}

const store = createStore<Snippet[]>(load(), {
  onSet: (next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },
});
const set = store.set;

// ---- mutators ----
export function addSnippet(tagPillar?: string) {
  set([
    ...store.get(),
    {
      id: newId(),
      label: 'New snippet',
      body: '',
      open: true,
      pillars: tagPillar ? [tagPillar] : [],
    },
  ]);
}
export function updateSnippet(id: string, patch: Partial<Snippet>) {
  set(store.get().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
export function removeSnippet(id: string) {
  set(store.get().filter((s) => s.id !== id));
}
export function duplicateSnippet(id: string) {
  const snippets = store.get();
  const i = snippets.findIndex((s) => s.id === id);
  if (i < 0) return;
  const clone: Snippet = {
    ...snippets[i],
    id: newId(),
    label: `${snippets[i].label} (copy)`,
    open: true,
    pinned: false,
  };
  const next = [...snippets];
  next.splice(i + 1, 0, clone);
  set(next);
}
export function toggleSnippetPin(id: string) {
  set(store.get().map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
}
export function toggleSnippetTag(id: string, pid: string) {
  set(
    store.get().map((s) => {
      if (s.id !== id) return s;
      const tags = new Set(s.pillars ?? []);
      if (tags.has(pid)) tags.delete(pid);
      else tags.add(pid);
      return { ...s, pillars: [...tags] };
    }),
  );
}

/** Re-add any starter template (`tpl-*`) that is missing, by id. Never overwrites one that is there,
 *  edited or not. Built on the existing replaceSnippets mutator (#132). */
export function restoreStarterSnippets() {
  const have = new Set(store.get().map((s) => s.id));
  const missing = DEFAULTS.filter((d) => !have.has(d.id));
  if (missing.length) replaceSnippets([...store.get(), ...missing.map((d) => ({ ...d }))]);
}

// ---- reads + sync ----
export function useSnippets(): Snippet[] {
  return store.use();
}
export function getSnippets(): Snippet[] {
  return store.get();
}
/** Replace the whole deck (cloud sync). Backfills ids defensively. */
export function replaceSnippets(list: Snippet[]) {
  set((Array.isArray(list) ? list : []).map((s) => ({ ...s, id: s.id || newId() })));
}
/** Merge cloud + local snippets by id (local order kept, cloud wins). For the sync layer. */
export const mergeSnippets = (cloud: Snippet[] | null, local: Snippet[]): Snippet[] =>
  mergeByKey((s) => s.id, cloud, local);

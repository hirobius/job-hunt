// The Application kit (rapid apply): the profile fields and saved answers a user pastes into every
// application form, entered once and copied per job in Apply mode. It follows the account in the
// sync blob (ADR 0008, blob v6), like evidence and saved searches. Templates for "Why this company"
// and the cover note are picked by snippet id, so the text itself stays in Templates.
import { createStore } from './createStore';
import { mergeByKey } from './mergeByKey';

const KIT_KEY = 'rjb_apply_kit';

/** The one-line profile fields, in the order Apply mode lists them. */
export const KIT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'location', label: 'Location' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'resume', label: 'Résumé link' },
  { key: 'workAuth', label: 'Work authorization' },
  { key: 'salary', label: 'Salary expectation' },
  { key: 'start', label: 'Notice / start date' },
  { key: 'years', label: 'Years of experience' },
] as const;

export type KitFieldKey = (typeof KIT_FIELDS)[number]['key'];

/** A custom question and the answer the user gives every time. */
export interface KitAnswer {
  id: string;
  q: string;
  a: string;
}

export interface ApplyKit {
  fields: Partial<Record<KitFieldKey, string>>;
  answers: KitAnswer[];
  /** Snippet ids picked for the two filled rows. */
  whyTemplate?: string;
  coverTemplate?: string;
}

export const emptyKit = (): ApplyKit => ({ fields: {}, answers: [] });

const FIELD_KEYS = KIT_FIELDS.map((f) => f.key) as string[];
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Keep only well-formed fields and answers. */
export function sanitizeKit(raw: unknown): ApplyKit {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const f = (o.fields && typeof o.fields === 'object' ? o.fields : {}) as Record<string, unknown>;
  const fields: ApplyKit['fields'] = {};
  for (const k of FIELD_KEYS) if (str(f[k])) fields[k as KitFieldKey] = str(f[k]);
  const answers = (Array.isArray(o.answers) ? o.answers : [])
    .filter((a): a is KitAnswer => !!a && typeof a === 'object' && !!str((a as KitAnswer).id))
    .map((a) => ({ id: a.id, q: str(a.q), a: str(a.a) }));
  const kit: ApplyKit = { fields, answers };
  if (str(o.whyTemplate)) kit.whyTemplate = str(o.whyTemplate);
  if (str(o.coverTemplate)) kit.coverTemplate = str(o.coverTemplate);
  return kit;
}

/** Cloud wins on a field both have; a field only one side has is kept. Answers merge by id. */
export function mergeKit(cloud: ApplyKit, local: ApplyKit): ApplyKit {
  const fields = { ...local.fields };
  for (const [k, v] of Object.entries(cloud.fields)) if (v) fields[k as KitFieldKey] = v;
  return {
    fields,
    answers: mergeByKey((a) => a.id, cloud.answers, local.answers),
    whyTemplate: cloud.whyTemplate || local.whyTemplate,
    coverTemplate: cloud.coverTemplate || local.coverTemplate,
  };
}

function load(): ApplyKit {
  try {
    const raw = localStorage.getItem(KIT_KEY);
    return raw ? sanitizeKit(JSON.parse(raw)) : emptyKit();
  } catch {
    return emptyKit();
  }
}

const store = createStore<ApplyKit>(load(), {
  onSet: (next) => {
    try {
      localStorage.setItem(KIT_KEY, JSON.stringify(next));
    } catch {
      /* blocked storage: kept in memory for the page view */
    }
  },
});

export const useApplyKit = store.use;
export const getApplyKit = store.get;
export const replaceApplyKit = (next: ApplyKit) => store.set(sanitizeKit(next));

export const setKitField = (key: KitFieldKey, value: string) =>
  store.set({ ...store.get(), fields: { ...store.get().fields, [key]: value } });

export const setKitTemplate = (slot: 'whyTemplate' | 'coverTemplate', id: string) =>
  store.set({ ...store.get(), [slot]: id || undefined });

const newId = () => 'qa-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export function addAnswer(q = '', a = ''): string {
  const id = newId();
  store.set({ ...store.get(), answers: [...store.get().answers, { id, q, a }] });
  return id;
}
export const updateAnswer = (id: string, patch: Partial<Omit<KitAnswer, 'id'>>) =>
  store.set({
    ...store.get(),
    answers: store.get().answers.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  });
export const removeAnswer = (id: string) =>
  store.set({ ...store.get(), answers: store.get().answers.filter((x) => x.id !== id) });

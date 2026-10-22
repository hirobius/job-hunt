// The user's own AI connection: their OpenRouter key and the model they picked. Both live in this
// browser's localStorage only. They are never synced (not a blob field), never in a backup or an
// export (backup.ts lists its stores by name), never logged, and never in a crash report (the key
// is never put in an error message; errorReport also scrubs anything key-shaped).
// Reset local data clears them with every other `rjb_` key.
import { useSyncExternalStore } from 'react';

export const KEY_STORAGE = 'rjb_ai_key';
export const MODEL_STORAGE = 'rjb_ai_model';

/** A key as OpenRouter issues it: printable, no spaces, a sane length. Anything else is refused. */
export function validKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  return /^[\x21-\x7e]{16,256}$/.test(key) ? key : null;
}

/** A model id as OpenRouter lists it (`anthropic/claude-sonnet-4.5`, `openai/gpt-5:free`). */
export function validModelId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return /^[\w.-]+\/[\w.:-]+$/.test(id) && id.length <= 120 ? id : null;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    /* storage blocked: the connection lasts for this page only */
  }
  emit();
}

export const getKey = (): string | null => validKey(read(KEY_STORAGE));
export const getModel = (): string | null => validModelId(read(MODEL_STORAGE));

export function saveKey(raw: string): boolean {
  const key = validKey(raw);
  if (!key) return false;
  write(KEY_STORAGE, key);
  return true;
}

export function saveModel(id: string) {
  const model = validModelId(id);
  if (model) write(MODEL_STORAGE, model);
}

/** Disconnect: forget the key (the model choice stays, it is not a secret). */
export function forgetKey() {
  write(KEY_STORAGE, null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Another tab connecting or disconnecting shows here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY_STORAGE || e.key === MODEL_STORAGE || e.key === null) l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

/** Whether a key is stored. Components never see the key itself. */
export const useAiConnected = (): boolean =>
  useSyncExternalStore(subscribe, () => getKey() !== null);

export const useAiModel = (): string | null => useSyncExternalStore(subscribe, getModel);

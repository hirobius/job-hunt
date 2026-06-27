// persisted<T> — the one place localStorage reads/writes live, wrapped in try/catch
// so a blocked or full store degrades gracefully (architecture-review candidate #3).
// New persistence (user pillars) uses it from the start; existing keys can adopt it
// incrementally.
export function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

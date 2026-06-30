// One merge mechanism for the by-identity stores (jobs, pillars, snippets, user tiles).
// Local order is preserved; cloud wins on shared keys; cloud-only items are appended. Each
// store wraps this with its own key function so the *named* merge rule lives with the concept
// while the mechanism stays in one deep place.
export function mergeByKey<T>(getKey: (x: T) => string, cloud: T[] | null, local: T[]): T[] {
  const by: Record<string, T> = {};
  const order: string[] = [];
  const add = (it: T) => {
    if (!it) return;
    const k = getKey(it);
    if (!k) return;
    if (!(k in by)) order.push(k);
    by[k] = it;
  };
  (local || []).forEach(add);
  (cloud || []).forEach(add); // cloud wins on shared keys
  return order.map((k) => by[k]);
}

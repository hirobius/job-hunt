import type { Todo } from './types';

/** Injectable id generator so the helpers stay pure + testable. Defaults to
 *  crypto.randomUUID in the app; tests pass a deterministic stub. */
export type IdGen = () => string;
const uuid: IdGen = () => crypto.randomUUID();

/** Default checklist seeded for a brand-new role (issue: per-role to-dos). */
export const STARTER_TODO_TEXTS: readonly string[] = [
  'Research company / role',
  'Tailor resume + cover letter',
  'Submit application',
  'Follow up (1 week)',
];

/** Append a todo from raw text. Empty / whitespace-only input is ignored
 *  (returns the list unchanged). Never mutates the input array. */
export function addTodo(todos: readonly Todo[], text: string, genId: IdGen = uuid): Todo[] {
  const trimmed = text.trim();
  if (!trimmed) return todos.slice();
  return [...todos, { id: genId(), text: trimmed, done: false }];
}

/** Flip the `done` flag of the item with `id`. A missing id is a no-op
 *  (returns an equivalent new list). */
export function toggleTodo(todos: readonly Todo[], id: string): Todo[] {
  return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

/** Remove the item with `id`. A missing id is a no-op. */
export function deleteTodo(todos: readonly Todo[], id: string): Todo[] {
  return todos.filter((t) => t.id !== id);
}

/** Done / total counts for the summary chip. */
export function todoProgress(todos: readonly Todo[] = []): { done: number; total: number } {
  return { done: todos.filter((t) => t.done).length, total: todos.length };
}

/** Build the starter checklist as real Todo objects (so it persists). */
export function seedStarterTodos(genId: IdGen = uuid): Todo[] {
  return STARTER_TODO_TEXTS.map((text) => ({ id: genId(), text, done: false }));
}

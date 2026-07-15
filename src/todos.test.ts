import { describe, expect, it } from 'vitest';
import {
  addTodo,
  toggleTodo,
  deleteTodo,
  todoProgress,
  seedStarterTodos,
  STARTER_TODO_TEXTS,
} from './todos';
import type { Todo } from './types';

// Deterministic id generator for stable assertions.
const seq = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const t = (id: string, text: string, done = false): Todo => ({ id, text, done });

describe('addTodo', () => {
  const cases: Array<[string, Todo[], string, Todo[]]> = [
    ['appends a trimmed item', [], '  Call recruiter  ', [t('id-1', 'Call recruiter')]],
    ['ignores empty input', [t('id-1', 'x')], '', [t('id-1', 'x')]],
    ['ignores whitespace-only input', [t('id-1', 'x')], '   ', [t('id-1', 'x')]],
    ['keeps existing items', [t('a', 'x')], 'y', [t('a', 'x'), t('id-1', 'y')]],
  ];
  it.each(cases)('%s', (_label, input, text, expected) => {
    expect(addTodo(input, text, seq())).toEqual(expected);
  });

  it('does not mutate the input array', () => {
    const input: Todo[] = [t('id-1', 'x')];
    addTodo(input, 'y', seq());
    expect(input).toEqual([t('id-1', 'x')]);
  });
});

describe('toggleTodo', () => {
  it('flips the matching item', () => {
    expect(toggleTodo([t('a', 'x'), t('b', 'y', true)], 'a')).toEqual([
      t('a', 'x', true),
      t('b', 'y', true),
    ]);
  });
  it('is a no-op for a missing id (returns an equal list)', () => {
    const input = [t('a', 'x')];
    expect(toggleTodo(input, 'nope')).toEqual(input);
  });
  it('does not mutate the input item', () => {
    const input: Todo[] = [t('a', 'x')];
    toggleTodo(input, 'a');
    expect(input[0].done).toBe(false);
  });
});

describe('deleteTodo', () => {
  it('removes the matching item', () => {
    expect(deleteTodo([t('a', 'x'), t('b', 'y')], 'a')).toEqual([t('b', 'y')]);
  });
  it('is a no-op for a missing id', () => {
    expect(deleteTodo([t('a', 'x')], 'nope')).toEqual([t('a', 'x')]);
  });
});

describe('todoProgress', () => {
  const cases: Array<[string, Todo[] | undefined, { done: number; total: number }]> = [
    ['undefined → 0/0', undefined, { done: 0, total: 0 }],
    ['empty → 0/0', [], { done: 0, total: 0 }],
    ['mixed', [t('a', 'x', true), t('b', 'y'), t('c', 'z', true)], { done: 2, total: 3 }],
  ];
  it.each(cases)('%s', (_label, input, expected) => {
    expect(todoProgress(input)).toEqual(expected);
  });
});

describe('seedStarterTodos', () => {
  it('builds the starter checklist as unchecked Todo objects', () => {
    const seeded = seedStarterTodos(seq());
    expect(seeded.map((s) => s.text)).toEqual([...STARTER_TODO_TEXTS]);
    expect(seeded.every((s) => !s.done && s.id)).toBe(true);
  });
});

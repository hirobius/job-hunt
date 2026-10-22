import { describe, expect, it } from 'vitest';
import {
  addTodo,
  toggleTodo,
  deleteTodo,
  restoreTodo,
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

describe('seedStarterTodos', () => {
  it('builds the starter checklist as unchecked Todo objects', () => {
    const seeded = seedStarterTodos(seq());
    expect(seeded.map((s) => s.text)).toEqual([...STARTER_TODO_TEXTS]);
    expect(seeded.every((s) => !s.done && s.id)).toBe(true);
  });
});

describe('restoreTodo (Undo of a delete, #212)', () => {
  const list = [t('a', 'x'), t('c', 'z')];
  it('puts the to-do back at the place it had', () => {
    expect(restoreTodo(list, t('b', 'y'), 1).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(restoreTodo(list, t('b', 'y'), 0).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('an index past the end puts it last', () => {
    expect(restoreTodo(list, t('b', 'y'), 9).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('a to-do still there is not added twice', () => {
    expect(restoreTodo(list, t('a', 'x'), 1)).toEqual(list);
  });
  it('never mutates the input', () => {
    const before = list.slice();
    restoreTodo(list, t('b', 'y'), 1);
    expect(list).toEqual(before);
  });
});

import { useState } from 'react';
import {
  Button as UiButton,
  Checkbox as HdsCheckbox,
  Input as HdsInput,
  Textarea,
  Icon,
  Box,
  Text,
  Disclosure,
} from '@hirobius/design-system';
import { X, Plus } from 'lucide-react';
import { updateJob } from './store';
import { addTodo, toggleTodo, deleteTodo, todoProgress, seedStarterTodos } from './todos';
import type { Job } from './types';

/** Notes field — kept in local state and committed on blur so every keystroke
 *  doesn't thrash the store/Supabase sync. Keyed by job url upstream so it
 *  re-seeds when the card changes. */
function NotesField({ job }: { job: Job }) {
  const [draft, setDraft] = useState(job.notes ?? '');
  return (
    <Textarea
      label="Notes"
      rows={3}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (job.notes ?? '')) updateJob(job.url, { notes: draft });
      }}
      style={{ width: '100%' }}
    />
  );
}

/** Per-role to-dos + notes: a compact summary label that opens a Disclosure
 *  with a checklist and a notes field. All mutations flow through updateJob so
 *  they persist via the existing localStorage + Supabase sync path. */
export function TodosNotes({ job }: { job: Job }) {
  const [draft, setDraft] = useState('');
  const todos = job.todos ?? [];
  const notes = job.notes ?? '';
  const { done, total } = todoProgress(todos);

  const commitAdd = () => {
    const next = addTodo(todos, draft);
    if (next.length !== todos.length) {
      updateJob(job.url, { todos: next });
      setDraft('');
    }
  };

  return (
    <Box>
      <Disclosure
        variant="nav"
        label={`${total > 0 ? `To-dos ${done}/${total}` : 'To-dos & notes'}${notes.trim() ? ' · has notes' : ''}`}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 'xs' }}>
          {/* TO-DOS */}
          <Box>
            <Text
              variant="caption"
              as="span"
              style={{ color: 'var(--semantic-color-content-secondary)' }}
            >
              To-dos
            </Text>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.5 }}>
              {todos.map((todo) => (
                <Box
                  sx={{ display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center' }}
                  key={todo.id}
                >
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      ...(todo.done && {
                        '& label > span:last-of-type': {
                          textDecoration: 'line-through',
                          opacity: 0.6,
                        },
                      }),
                    }}
                  >
                    <HdsCheckbox
                      label={todo.text}
                      checked={todo.done}
                      onChange={() => updateJob(job.url, { todos: toggleTodo(todos, todo.id) })}
                    />
                  </Box>
                  <UiButton
                    size="sm"
                    variant="tertiary"
                    iconOnly
                    iconLeft={<Icon icon={X} />}
                    label={`Delete “${todo.text}”`}
                    onClick={() => updateJob(job.url, { todos: deleteTodo(todos, todo.id) })}
                  />
                </Box>
              ))}

              {todos.length === 0 && (
                <Box>
                  <UiButton
                    size="sm"
                    variant="secondary"
                    onClick={() => updateJob(job.url, { todos: seedStarterTodos() })}
                  >
                    Add starter tasks
                  </UiButton>
                </Box>
              )}
            </Box>

            {/* add-todo row */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                gap: 1.5,
                alignItems: 'center',
                mt: 1.5,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                <HdsInput
                  size="sm"
                  aria-label="New to-do"
                  placeholder="Add a to-do…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitAdd();
                  }}
                  style={{ width: '100%' }}
                />
              </Box>
              <UiButton
                size="small"
                variant="outlined"
                startIcon={<Plus size={16} />}
                disabled={!draft.trim()}
                onClick={commitAdd}
              >
                Add
              </UiButton>
            </Box>
          </Box>

          {/* NOTES */}
          <Box>
            <Text
              variant="caption"
              as="span"
              style={{ color: 'var(--semantic-color-content-secondary)' }}
            >
              Notes
            </Text>
            <Box sx={{ mt: 1.5 }}>
              <NotesField key={job.url} job={job} />
            </Box>
          </Box>
        </Box>
      </Disclosure>
    </Box>
  );
}

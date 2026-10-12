import { useState } from 'react';
import {
  Button as UiButton,
  Checkbox as HdsCheckbox,
  Input as HdsInput,
  Textarea,
  Icon,
} from '@hirobius/design-system';
import { ListChecks, StickyNote, X, Plus } from 'lucide-react';
import { Box, Stack, Typography } from './ui/box';
import { Reveal } from './ui/Reveal';
import { updateJob } from './store';
import { addTodo, toggleTodo, deleteTodo, todoProgress, seedStarterTodos } from './todos';
import type { Job } from './types';

const eyebrowSx = {
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontSize: 11,
} as const;

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

/** Per-role to-dos + notes: a compact summary chip that toggles a Reveal panel
 *  with a checklist and a notes field. All mutations flow through updateJob so
 *  they persist via the existing localStorage + Supabase sync path. */
export function TodosNotes({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
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
      <UiButton
        size="sm"
        variant="tertiary"
        iconLeft={<ListChecks size={16} />}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ whiteSpace: 'nowrap' }}
      >
        {total > 0 ? `✓ ${done}/${total}` : 'To-dos & notes'}
        {notes.trim() && (
          <StickyNote
            size={13}
            aria-label="Has notes"
            style={{ marginLeft: 6, color: 'var(--semantic-color-content-secondary)' }}
          />
        )}
      </UiButton>

      <Reveal open={open}>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {/* TO-DOS */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={eyebrowSx}>
              To-dos
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.75 }}>
              {todos.map((todo) => (
                <Stack key={todo.id} direction="row" alignItems="center" spacing={0.5}>
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      // HDS renders the label text as the last <span> in the <label>
                      // (its color is set inline, so decoration is applied there, not on
                      // the hidden <input> the `style` prop would target).
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
                </Stack>
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
            </Stack>

            {/* add-todo row */}
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
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
            </Stack>
          </Box>

          {/* NOTES */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={eyebrowSx}>
              Notes
            </Typography>
            <Box sx={{ mt: 0.75 }}>
              <NotesField key={job.url} job={job} />
            </Box>
          </Box>
        </Stack>
      </Reveal>
    </Box>
  );
}

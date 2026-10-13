import { useState } from 'react';
import { Box, Button, Checkbox, Icon, Input, Stack, Text, Textarea } from '@hirobius/design-system';
import { X, Plus } from 'lucide-react';
import { updateJob } from './store';
import { addTodo, toggleTodo, deleteTodo, seedStarterTodos } from './todos';
import { notesOf } from './jobNotes';
import type { Job } from './types';

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;

/** The notes field. Saves on every change (the sheet can close at any moment), moving a legacy
 *  `note` into `notes` on the first edit so there is only ever one source. */
function NotesField({ job }: { job: Job }) {
  const [draft, setDraft] = useState(notesOf(job));
  return (
    <Textarea
      label="Notes"
      rows={4}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        updateJob(
          job.url,
          job.note ? { notes: e.target.value, note: '' } : { notes: e.target.value },
        );
      }}
      style={{ width: '100%' }}
    />
  );
}

/** Per-role to-dos + the notes field, for the To-dos sheet. Every change goes through updateJob,
 *  so it persists via the localStorage + Supabase sync path. */
export function TodosNotes({ job }: { job: Job }) {
  const [draft, setDraft] = useState('');
  const todos = job.todos ?? [];

  const commitAdd = () => {
    const next = addTodo(todos, draft);
    if (next.length !== todos.length) {
      updateJob(job.url, { todos: next });
      setDraft('');
    }
  };

  return (
    <Stack gap="normal">
      <Stack gap="tight">
        <Text variant="caption" as="span" style={muted}>
          To-dos
        </Text>
        {todos.map((todo) => (
          <Box key={todo.id} sx={{ display: 'flex', alignItems: 'center', gap: 'xs' }}>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                ...(todo.done && {
                  '& label > span:last-of-type': { textDecoration: 'line-through', opacity: 0.6 },
                }),
              }}
            >
              <Checkbox
                label={todo.text}
                checked={todo.done}
                onChange={() => updateJob(job.url, { todos: toggleTodo(todos, todo.id) })}
              />
            </Box>
            <Button
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
          <Stack gap="tight" align="start">
            <Text variant="body" as="p" style={{ ...muted, margin: 0 }}>
              No to-dos yet.
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateJob(job.url, { todos: seedStarterTodos() })}
            >
              Add starter tasks
            </Button>
          </Stack>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 'xs' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Input
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
          <Button
            variant="secondary"
            iconLeft={<Icon icon={Plus} />}
            disabled={!draft.trim()}
            onClick={commitAdd}
          >
            Add
          </Button>
        </Box>
      </Stack>
      <NotesField key={job.url} job={job} />
    </Stack>
  );
}

// The job's to-dos and its one Notes field, as two panels on the job page's Overview (rev-3 F).
// All mutations flow through updateJob so they persist via the localStorage + Supabase sync path.
import { useState } from 'react';
import {
  Button,
  Checkbox as HdsCheckbox,
  Input as HdsInput,
  Textarea,
  Icon,
  Box,
  Stack,
  Text,
} from '@hirobius/design-system';
import { X, Plus } from 'lucide-react';
import { updateJob } from './store';
import { addTodo, toggleTodo, deleteTodo, seedStarterTodos } from './todos';
import { Panel, PanelBody, PanelRow, PanelRows } from './PipelinePanel';
import type { Job } from './types';

/** The job's one Notes field — kept in local state and committed on blur so every keystroke
 *  doesn't thrash the store/Supabase sync. Keyed by job url upstream so it re-seeds when the job
 *  changes. Jobs carry two: `note` (where it was saved from) and `notes` (the user's). This edits
 *  `notes`, showing `note` only when `notes` is empty; when both are set `note` is a read-only
 *  line above, so neither is ever hidden. */
function NotesField({ job }: { job: Job }) {
  const shown = job.notes || job.note || '';
  const [draft, setDraft] = useState(shown);
  return (
    <Textarea
      aria-label="Notes"
      rows={3}
      value={draft}
      placeholder="What to remember about this job"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== shown) updateJob(job.url, { notes: draft });
      }}
    />
  );
}

/** The Notes panel: the panel's heading names the field. */
export function NotesPanel({ job }: { job: Job }) {
  return (
    <Panel label="Notes" title="Notes">
      <PanelBody>
        <Stack gap="tight">
          {job.notes && job.note && job.note !== job.notes && (
            <Box sx={{ overflowWrap: 'anywhere' }}>
              <Text variant="caption" as="p" tone="secondary">
                From when you saved it: {job.note}
              </Text>
            </Box>
          )}
          {/* HDS fields size to their content otherwise. */}
          <Box sx={{ '& > *': { width: '100%', maxWidth: 'none' } }}>
            <NotesField key={job.url} job={job} />
          </Box>
        </Stack>
      </PanelBody>
    </Panel>
  );
}

/** Per-role to-dos: a checklist, one quiet add row, and starter tasks while it is empty. */
export function TodosPanel({ job }: { job: Job }) {
  const [draft, setDraft] = useState('');
  const todos = job.todos ?? [];
  const open = todos.filter((t) => !t.done).length;

  const commitAdd = () => {
    const next = addTodo(todos, draft);
    if (next.length !== todos.length) {
      updateJob(job.url, { todos: next });
      setDraft('');
    }
  };

  return (
    <Panel
      label="To-dos"
      title="To-dos"
      count={open}
      countLabel={`${open} open`}
      trailing={
        todos.length === 0 ? (
          <Button
            size="md"
            variant="tertiary"
            onClick={() => updateJob(job.url, { todos: seedStarterTodos() })}
          >
            Add starter tasks
          </Button>
        ) : undefined
      }
    >
      <PanelRows>
        {todos.map((todo) => (
          <PanelRow key={todo.id}>
            <Stack direction="row" gap="px8" align="center">
              <Box
                sx={{
                  flex: '1 1 0%',
                  minWidth: 0,
                  ...(todo.done && {
                    '& label > span:last-of-type': {
                      textDecoration: 'line-through',
                      color: 'content.secondary',
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
              <Button
                size="md"
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={X} />}
                label={`Delete “${todo.text}”`}
                onClick={() => updateJob(job.url, { todos: deleteTodo(todos, todo.id) })}
              />
            </Stack>
          </PanelRow>
        ))}
        {/* One quiet add row: type, then Enter or the plus. */}
        <PanelRow>
          <Stack direction="row" gap="px8" align="center">
            <Box sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%', maxWidth: 'none' } }}>
              <HdsInput
                aria-label="New to-do"
                placeholder={todos.length ? 'Add a to-do' : 'No to-dos yet. Add a to-do'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdd();
                }}
              />
            </Box>
            <Button
              size="md"
              variant="secondary"
              iconOnly
              iconLeft={<Icon icon={Plus} />}
              label="Add to-do"
              disabled={!draft.trim()}
              onClick={commitAdd}
            />
          </Stack>
        </PanelRow>
      </PanelRows>
    </Panel>
  );
}

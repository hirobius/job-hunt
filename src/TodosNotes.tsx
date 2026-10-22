// The job's to-dos and its one Notes field, as two panels on the job page's Overview (rev-3 F).
// All mutations flow through updateJob so they persist via the localStorage + Supabase sync path.
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { findJobByUrl, updateJob } from './store';
import { addTodo, toggleTodo, deleteTodo, restoreTodo, seedStarterTodos } from './todos';
import { Panel, PanelBody, PanelRow, PanelRows } from './PipelinePanel';
import { collapseRow } from './feedback';
import { notifyRemoved } from './saveNotice';
import type { Job, Todo } from './types';

/** Delete a to-do (#212): its row collapses, then it goes, and a notice offers Undo, which puts it
 *  back in its place. The job is read when the delete lands, so two deletes inside one collapse
 *  both stick. */
function deleteWithUndo(url: string, todo: Todo, from: Element) {
  collapseRow(from, () => {
    const todos = findJobByUrl(url)?.todos ?? [];
    const at = todos.findIndex((t) => t.id === todo.id);
    if (at < 0) return;
    updateJob(url, { todos: deleteTodo(todos, todo.id) });
    notifyRemoved(`Deleted “${todo.text}”`, () => {
      const now = findJobByUrl(url);
      if (now) updateJob(now.url, { todos: restoreTodo(now.todos ?? [], todo, at) });
    });
  });
}

/** The job's one Notes field. The draft lives in local state and saves 300 ms after the last
 *  keystroke (so typing doesn't thrash the store/Supabase sync), and at once on blur, unmount
 *  (Back, a hash change) and pagehide / a hidden tab (reload, the phone back gesture), so a note
 *  is never lost to a missing blur. Keyed by job url upstream so it re-seeds when the job
 *  changes. Jobs carry two: `note` (where it was saved from) and `notes` (the user's). This edits
 *  `notes`, showing `note` only when `notes` is empty; when both are set `note` is a read-only
 *  line above, so neither is ever hidden. */
const NOTES_DEBOUNCE_MS = 300;

function NotesField({ job }: { job: Job }) {
  const shown = job.notes || job.note || '';
  const [draft, setDraft] = useState(shown);
  const draftRef = useRef(draft);
  const savedRef = useRef(shown);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const url = job.url;
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (draftRef.current === savedRef.current) return;
    savedRef.current = draftRef.current;
    updateJob(url, { notes: draftRef.current });
  }, [url]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'visible') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);
  return (
    <Textarea
      aria-label="Notes"
      rows={3}
      value={draft}
      placeholder="What to remember about this job"
      onChange={(e) => {
        setDraft(e.target.value);
        draftRef.current = e.target.value;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, NOTES_DEBOUNCE_MS);
      }}
      onBlur={flush}
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

/** Per-role to-dos: a checklist, a quiet "Add a to-do" line that opens the field (rev-3 mock),
 *  and starter tasks while it is empty. */
export function TodosPanel({ job }: { job: Job }) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
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
          // Pulled right by the tertiary's padding so its text ends on the panel's edge.
          <Box sx={{ mr: -4 }}>
            <Button
              size="md"
              variant="tertiary"
              onClick={() => updateJob(job.url, { todos: seedStarterTodos() })}
            >
              Add starter tasks
            </Button>
          </Box>
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
                onClick={(e) => deleteWithUndo(job.url, todo, e.currentTarget)}
              />
            </Stack>
          </PanelRow>
        ))}
        {/* One quiet line until it is wanted; then the field: Enter or Add, Escape closes it. */}
        <PanelRow>
          {adding ? (
            <Stack direction="row" gap="px8" align="center">
              <Box
                sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%', maxWidth: 'none' } }}
              >
                <HdsInput
                  aria-label="New to-do"
                  placeholder="Add a to-do"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitAdd();
                    if (e.key === 'Escape') setAdding(false);
                  }}
                  onBlur={() => {
                    if (!draft.trim()) setAdding(false);
                  }}
                />
              </Box>
              <Button size="md" variant="secondary" disabled={!draft.trim()} onClick={commitAdd}>
                Add
              </Button>
            </Stack>
          ) : (
            // Pulled left by the tertiary's padding: the plus sits on the panel's text edge.
            <Box sx={{ ml: -4 }}>
              <Button
                size="md"
                variant="tertiary"
                iconLeft={<Icon icon={Plus} />}
                onClick={() => setAdding(true)}
              >
                Add a to-do
              </Button>
            </Box>
          )}
        </PanelRow>
      </PanelRows>
    </Panel>
  );
}

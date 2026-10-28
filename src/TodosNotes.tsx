// The job's one Notes field, as a panel on the job page (rev-3 F). The to-dos left the page in
// #416; they stay on the Job. Every change flows through updateJob, so it persists and syncs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea, Box, Stack, Text } from '@hirobius/design-system';
import { updateJob } from './store';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';

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
  // A newer note from a sync pull replaces the field while nothing is unsaved (#330); an unsaved
  // edit wins and is saved over it, as before. Only `notes` is followed: the older `note` the field
  // falls back to must not come back into it when the user clears Notes.
  const synced = job.notes;
  useEffect(() => {
    if (!synced || synced === savedRef.current || draftRef.current !== savedRef.current) return;
    savedRef.current = synced;
    draftRef.current = synced;
    setDraft(synced);
  }, [synced]);
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
      placeholder="Notes"
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

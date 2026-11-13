// The job's one Notes field, as a panel on the job page (rev-3 F). The to-dos left the page in
// #416; they stay on the Job. Every change flows through updateJob, so it persists and syncs.
// It saves while you type (debounced) and says so in a quiet polite line under the field:
// "Saving…", then "Saved to this job" (Adrian 2026-11-13).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea, Box, Stack, Text } from '@hirobius/design-system';
import { updateJob } from './store';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';
import { NOTES_STATUS, olderNoteLine, type NotesSaveState } from './notesSave';

const NOTES_DEBOUNCE_MS = 300;

function NotesField({ job }: { job: Job }) {
  const shown = job.notes || job.note || '';
  const [draft, setDraft] = useState(shown);
  const draftRef = useRef(draft);
  const savedRef = useRef(shown);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<NotesSaveState>('idle');
  const mounted = useRef(true);
  const url = job.url;
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (draftRef.current === savedRef.current) {
      if (mounted.current) setState((s) => (s === 'saving' ? 'saved' : s));
      return;
    }
    savedRef.current = draftRef.current;
    updateJob(url, { notes: draftRef.current });
    if (mounted.current) setState('saved');
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
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState !== 'visible') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      mounted.current = false;
      flush();
    };
  }, [flush]);
  return (
    <Box>
      <Textarea
        aria-label="Notes"
        rows={3}
        value={draft}
        placeholder="Notes"
        onChange={(e) => {
          setDraft(e.target.value);
          draftRef.current = e.target.value;
          clearTimeout(timer.current);
          setState('saving');
          timer.current = setTimeout(flush, NOTES_DEBOUNCE_MS);
        }}
        onBlur={flush}
      />
      {/* Polite: it never interrupts typing. Empty (no height) until the first edit, so the
          page does not change before one. */}
      <Box role="status" aria-live="polite" sx={{ pt: state === 'idle' ? 0 : 'xs' }}>
        <Text variant="caption" as="p" tone="secondary">
          {NOTES_STATUS[state]}
        </Text>
      </Box>
    </Box>
  );
}

/** The Notes panel: the panel's heading names the field. */
export function NotesPanel({ job }: { job: Job }) {
  const older = olderNoteLine(job);
  return (
    <Panel label="Notes" title="Notes">
      <PanelBody>
        <Stack gap="tight">
          {older && (
            <Box sx={{ overflowWrap: 'anywhere' }}>
              <Text variant="caption" as="p" tone="secondary">
                From when you saved it: {older}
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

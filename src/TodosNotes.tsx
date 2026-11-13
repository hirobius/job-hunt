// The job's one Notes field, as a panel on the job page (rev-3 F). The to-dos left the page in
// #416; they stay on the Job. Every change flows through updateJob, so it persists and syncs.
// It saves on a Save key under the field (on only while there are unsaved changes; Adrian
// 2026-11-13, in place of saving while typing) and still on blur, tab hide and leaving the page;
// a quiet polite line beside the key then says "Saved to this job".
import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea, Box, Button, Stack, Text } from '@hirobius/design-system';
import { updateJob } from './store';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';
import { NOTES_STATUS, olderNoteLine, type NotesSaveState } from './notesSave';

function NotesField({ job }: { job: Job }) {
  const shown = job.notes || job.note || '';
  const [draft, setDraft] = useState(shown);
  const draftRef = useRef(draft);
  const savedRef = useRef(shown);
  // The saved text as state too, for the Save key (a ref is not read while rendering).
  const [saved, setSaved] = useState(shown);
  const [state, setState] = useState<NotesSaveState>('idle');
  const mounted = useRef(true);
  const url = job.url;
  const flush = useCallback(() => {
    if (draftRef.current === savedRef.current) return;
    savedRef.current = draftRef.current;
    updateJob(url, { notes: draftRef.current });
    if (!mounted.current) return;
    setSaved(draftRef.current);
    setState('saved');
  }, [url]);
  const dirty = draft !== saved;
  // A newer note from a sync pull replaces the field while nothing is unsaved (#330); an unsaved
  // edit wins and is saved over it, as before. Only `notes` is followed: the older `note` the field
  // falls back to must not come back into it when the user clears Notes.
  const synced = job.notes;
  useEffect(() => {
    if (!synced || synced === savedRef.current || draftRef.current !== savedRef.current) return;
    savedRef.current = synced;
    draftRef.current = synced;
    setSaved(synced);
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
    <Stack gap="tight">
      <Textarea
        aria-label="Notes"
        rows={3}
        value={draft}
        placeholder="Notes"
        onChange={(e) => {
          setDraft(e.target.value);
          draftRef.current = e.target.value;
          setState('idle');
        }}
        onBlur={flush}
      />
      <Stack direction="row" gap="px8" align="center">
        {/* On only with unsaved changes. A press after the field's blur (which saved already)
            finds it off, so a note is never saved twice. */}
        <Button variant="secondary" size="md" disabled={!dirty} onClick={flush}>
          Save
        </Button>
        {/* Polite: said once after a save; empty again on the next edit. */}
        <Text variant="caption" as="p" tone="secondary" role="status" aria-live="polite">
          {NOTES_STATUS[state]}
        </Text>
      </Stack>
    </Stack>
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

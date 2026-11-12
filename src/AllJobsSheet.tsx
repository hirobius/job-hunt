// "All jobs" (Proposal A, Adrian 2026-11-08; #543): on a phone the Apply screen shows one job; this
// bottom sheet holds the Apply list (TrackerView JobsList: Add job, the views, search, the filter
// chips, Sort and "Clear N", then the shared rows, the open job filled) to jump to any job. A jump
// moves in place (Back leaves the tab, as the pager does) and closes the sheet.
// A Dialog set as a bottom sheet in place of HDS Sheet (G2: a Sheet build that fits the entry).
// hds-gap: hirobius/hds#1433 (G2)
import { useEffect } from 'react';
import { Box, Dialog } from '@hirobius/design-system';
import { DialogNotice } from './NoticeHost';
import { noticeHost } from './saveNotice';
import { JobsList } from './TrackerView';
import { FILTER_LABEL, usePipelineView, visibleJobs } from './pipelineView';
import { afterBack, openJob, popSheet } from './route';
import { jobIdOf } from './store';
import type { Job } from './types';

export default function AllJobsSheet({
  jobs,
  openId,
  open,
  onOpenChange,
}: {
  jobs: Job[];
  /** The job the page shows: its row is marked. */
  openId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const view = usePipelineView();
  const shown = visibleJobs(jobs, view);
  // Star, Mark applied, Remove… raised in the sheet show their Undo in its footer.
  useEffect(() => {
    if (!open) return;
    noticeHost(1);
    return () => noticeHost(-1);
  }, [open]);
  const jump = (j: Job) => {
    // Pop the sheet's own entry first, then swap the page's: Back leaves the tab in one step.
    popSheet('all-jobs'); // its useBackCloses id in JobPage
    onOpenChange(false);
    afterBack(() => openJob(jobIdOf(j.url), true));
  };
  return (
    // HDS Dialog drawn as a bottom sheet below sm (.rjb-bottom-sheet): HDS Sheet would put ~0.7 kB
    // more into the startup chunk, which is at its budget.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="rjb-dialog rjb-bottom-sheet">
        <Dialog.Header>
          <span className="rjb-sheet-handle" aria-hidden="true" />
          <Dialog.Title>All jobs</Dialog.Title>
          <Dialog.Description>
            {`${FILTER_LABEL[view.filter]} · ${shown.length} ${shown.length === 1 ? 'job' : 'jobs'}`}
          </Dialog.Description>
        </Dialog.Header>
        <Box className="rjb-dialog-body">{open && <JobsList onOpen={jump} openId={openId} />}</Box>
        <Dialog.Footer>
          <DialogNotice />
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

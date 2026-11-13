// "All jobs" (Proposal A, Adrian 2026-11-08; #543): on a phone the Apply screen shows one job; this
// bottom sheet holds the Apply list (TrackerView JobsList: Add job, the views, then the shared rows,
// the open job filled; no search, filters or sort since 2026-11-13) to jump to any job. A jump
// moves in place (Back leaves the tab, as the pager does) and closes the sheet.
// A Dialog set as a bottom sheet in place of HDS Sheet (G2: a Sheet build that fits the entry).
// hds-gap: hirobius/hds#1433 (G2)
import { useEffect } from 'react';
import { Box, Dialog } from '@hirobius/design-system';
import { DialogNotice } from './NoticeHost';
import './hds-gaps/BottomSheet.css';
import { noticeHost } from './saveNotice';
import { JobsList } from './TrackerView';
import { afterBack, openJob, popSheet } from './route';
import { jobIdOf } from './store';
import type { Job } from './types';

export default function AllJobsSheet({
  openId,
  open,
  onOpenChange,
}: {
  /** The job the page shows: its row is marked. */
  openId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      <Dialog.Content className="rjb-dialog rjb-bottom-sheet" aria-describedby={undefined}>
        <Dialog.Header>
          <span className="rjb-sheet-handle" aria-hidden="true" />
          <Dialog.Title>All jobs</Dialog.Title>
        </Dialog.Header>
        <Box className="rjb-dialog-body">{open && <JobsList onOpen={jump} openId={openId} />}</Box>
        <Dialog.Footer>
          <DialogNotice />
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

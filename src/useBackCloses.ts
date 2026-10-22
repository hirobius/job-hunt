// Back closes a sheet (return paths, Adrian 2026-10-22). A dialog, menu or popover that opens
// pushes a history entry of its own with the same URL (route.pushSheet), so the phone's back
// gesture or the browser's Back closes it and stays on the page, instead of leaving the page and the
// typed input behind it. Closing it on screen pops that entry again; so does its component going
// away while it is open (a row removed from its own menu). A sheet that opens as another closes
// (Sign in from the Account menu) pushes its entry once the other's pop has landed. A sheet that can
// `reopen` comes back as it was when a page it linked to returns here (Use template after Edit
// message). `useBackSheet` is the same for a sheet that keeps no open state of its own.
// Every sheet in src is wired one of these two ways (pinned in backCloses.test.ts).
import { useEffect, useRef, useState } from 'react';
import {
  afterBack,
  currentSheet,
  currentSheetData,
  openSheets,
  popSheet,
  pushSheet,
  setSheetData,
} from './route';

/** Which mounted sheet holds each id's entry: a sheet gone while open drops the entry only when it
 *  still holds it (not when a new one has taken it over, reopening onto it). */
const holders = new Map<string, object>();

export function useBackCloses(
  open: boolean,
  close: () => void,
  /** Unique per sheet instance (`use-template:<job url>`). */
  id: string,
  opts: {
    /** What the sheet needs to reopen as it was (kept on its entry). */
    data?: string;
    /** Reopen when history comes back to this sheet's entry. */
    reopen?: (data: string | undefined) => void;
  } = {},
): void {
  const closeRef = useRef(close);
  const reopenRef = useRef(opts.reopen);
  const openRef = useRef(open);
  const dataRef = useRef(opts.data);
  const was = useRef(false);
  /** This sheet's entry is in history (pushed, or come back to), so leaving it closes the sheet. */
  const pushed = useRef(false);
  const mounted = useRef(false);
  /** This instance, as `holders` knows it. */
  const [me] = useState(() => ({}));
  useEffect(() => {
    closeRef.current = close;
    reopenRef.current = opts.reopen;
    openRef.current = open;
    dataRef.current = opts.data;
  });

  // Opened → its own entry; closed on screen → that entry popped. The push waits for this
  // commit's other effects (a menu closing as its item opens this sheet pops its own entry) and
  // for any pop in flight, so it lands on the page's entry, not on one about to go.
  useEffect(() => {
    const hold = () => {
      pushed.current = true;
      holders.set(id, me);
    };
    if (open && !was.current) {
      // Its entry may be showing already (reopened onto it); a pop of it in flight is not that.
      queueMicrotask(() =>
        afterBack(() => {
          if (!openRef.current || pushed.current) return;
          if (currentSheet() !== id) pushSheet(id, dataRef.current);
          hold();
        }),
      );
    } else if (!open && was.current) {
      if (pushed.current) popSheet(id);
      pushed.current = false;
      if (holders.get(id) === me) holders.delete(id);
    }
    was.current = open;
  }, [open, id, me]);

  // What it needs to reopen follows the sheet while it is open (a different pick).
  useEffect(() => {
    if (open) setSheetData(id, opts.data);
  }, [open, id, opts.data]);

  // Back or Forward: off this sheet's entry closes it (a sheet over it closing leaves it open);
  // onto it reopens it.
  useEffect(() => {
    const onPop = () => {
      const s = currentSheet();
      if (openRef.current && pushed.current && !openSheets().includes(id)) {
        pushed.current = false;
        closeRef.current();
      } else if (!openRef.current && s === id)
        reopenRef.current?.(currentSheetData() as string | undefined);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [id]);

  // Mounted onto this sheet's entry (Back from the page it linked to): reopen as it was. Gone
  // while open: drop its entry (unless this was StrictMode's mount check, which mounts it again).
  useEffect(() => {
    mounted.current = true;
    if (!openRef.current && currentSheet() === id)
      reopenRef.current?.(currentSheetData() as string | undefined);
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current || !pushed.current || holders.get(id) !== me) return;
        pushed.current = false;
        holders.delete(id);
        popSheet(id);
      }, 0);
    };
  }, [id, me]);
}

/** Open state for a sheet that keeps none of its own (an HDS Menu or Popover left uncontrolled),
 *  wired to Back: spread it on the sheet's root, `<Menu {...useBackSheet('id')}>`. */
export function useBackSheet(id: string): {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const [open, setOpen] = useState(false);
  useBackCloses(open, () => setOpen(false), id);
  return { open, onOpenChange: setOpen };
}

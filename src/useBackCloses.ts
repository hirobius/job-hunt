// Back closes a sheet (return paths, Adrian 2026-10-22). A dialog or menu that opens pushes a
// history entry of its own with the same URL (route.pushSheet), so the phone's back gesture or the
// browser's Back closes it and stays on the page, instead of leaving the page and the typed input
// behind it. Closing it on screen pops that entry again. A sheet that can `reopen` comes back as it
// was when a page it linked to returns here (Use template after Edit message). The hook lives with
// the state that opens the sheet, in a component that stays mounted while it closes.
import { useEffect, useRef } from 'react';
import { currentSheet, currentSheetData, popSheet, pushSheet, setSheetData } from './route';

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
  const was = useRef(false);
  useEffect(() => {
    closeRef.current = close;
    reopenRef.current = opts.reopen;
    openRef.current = open;
  });

  // Opened → its own entry; closed on screen → that entry popped.
  useEffect(() => {
    if (open && !was.current) {
      if (currentSheet() !== id) pushSheet(id, opts.data);
    } else if (!open && was.current) popSheet(id);
    was.current = open;
    // opts.data is written by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  // What it needs to reopen follows the sheet while it is open (a different pick).
  useEffect(() => {
    if (open) setSheetData(id, opts.data);
  }, [open, id, opts.data]);

  // Back or Forward: off this sheet's entry closes it; onto it reopens it.
  useEffect(() => {
    const onPop = () => {
      const s = currentSheet();
      if (openRef.current && s !== id) closeRef.current();
      else if (!openRef.current && s === id)
        reopenRef.current?.(currentSheetData() as string | undefined);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [id]);

  // Mounted onto this sheet's entry (Back from the page it linked to): reopen as it was.
  useEffect(() => {
    if (!openRef.current && currentSheet() === id)
      reopenRef.current?.(currentSheetData() as string | undefined);
  }, [id]);
}

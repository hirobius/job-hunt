// The job's action dock (redesign §5.5, #535): on a phone the job's keys sit in one dock at the
// bottom (one filled key, one grey key, one exit, in that order of rank), clear of the bottom
// safe-area inset. It hides while a field has focus or the keyboard is up, and comes back on
// blur (hds.motion.spatial; reduced motion uses opacity). Hidden, it is inert. From lg the same
// keys sit inline under the title block. Lives in the JobPage chunk (its CSS is not in base.css).
// The dock follows the visual viewport (`--rjb-vv-bottom` from `useVisualViewportVars`), so it
// stays above an on-screen keyboard even when no field has focus (#593), and it reserves one row
// for one key and two for more (`data-rows`). When a key with focus leaves (the job's state
// changed, e.g. a sync from another device), focus goes to the new filled key, or to `onKeysGone`
// when no key is left (#540 contract, #593); a key that stays keeps its focus. `row` puts every key
// in one row, in order (the Find Deck, #545: Skip grey, Save filled on the right).
// Delete this when HDS ships a bottom action bar.
// hds-gap: hirobius/hds#1432 (G1: a bottom dock that hides while a field has focus)
import { Children, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Box } from '@hirobius/design-system';
import { useVisualViewportVars } from './useVisualViewportVars';
import { useFieldFocused } from './fieldFocus';
import './ActionDock.css';

/** The dock's keys: its buttons and links. */
const KEY = 'a, button';

export function ActionDock({
  docked,
  label,
  onKeysGone,
  row = false,
  children,
}: {
  /** Dock at the bottom (a phone) or sit inline under the title block (lg). */
  docked: boolean;
  /** The group's name, e.g. "Actions for Design Systems Lead". */
  label: string;
  /** Where focus goes when the focused key left and no key is left (e.g. the page's title). */
  onKeysGone?: () => void;
  /** Every key in one row, in the order given (no first row for the filled key). */
  row?: boolean;
  children: ReactNode;
}) {
  const typing = useFieldFocused();
  const vvRef = useVisualViewportVars<HTMLDivElement>();
  const box = useRef<HTMLDivElement | null>(null);
  // The key that has focus, kept until focus leaves it for somewhere still on the page.
  const focused = useRef<HTMLElement | null>(null);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      if (docked) vvRef(el);
    },
    [docked, vvRef],
  );
  const count = Children.toArray(children).length;
  // After each render: the focused key was removed and focus fell to <body>.
  useLayoutEffect(() => {
    const was = focused.current;
    if (!was || was.isConnected) return;
    focused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const first = box.current?.querySelector<HTMLElement>(KEY);
    if (first) first.focus();
    else onKeysGone?.();
  });
  const track = {
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const key = (e.target as HTMLElement).closest<HTMLElement>(KEY);
      if (key) focused.current = key;
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      // Still on the page: focus moved on by choice. Removed: the effect above moves it.
      const key = e.target as HTMLElement;
      requestAnimationFrame(() => {
        if (focused.current === key && key.isConnected) focused.current = null;
      });
    },
  };
  // With no keys there is no dock and no spacer.
  if (count === 0) return null;
  if (!docked)
    return (
      <Box
        ref={ref}
        role="group"
        aria-label={label}
        className="rjb-dock-row"
        data-rjb-actions=""
        {...track}
      >
        {children}
      </Box>
    );
  const hidden = typing;
  return (
    <>
      {/* On body (which carries data-hds): a transformed ancestor would pin a fixed box to
          itself, not to the viewport. */}
      {createPortal(
        <Box
          ref={ref}
          role="group"
          aria-label={label}
          className="rjb-dock"
          data-rjb-actions=""
          // The filled key takes the first row; any other keys share the second.
          data-rows={count > 1 && !row ? '2' : '1'}
          data-layout={row ? 'row' : undefined}
          data-hidden={hidden ? 'true' : 'false'}
          aria-hidden={hidden || undefined}
          inert={hidden || undefined}
          {...track}
        >
          {children}
        </Box>,
        document.body,
      )}
    </>
  );
}

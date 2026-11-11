// The job's action dock (redesign §5.5, #535): on a phone the job's keys sit in one dock at the
// bottom (one filled key, one grey key, one exit, in that order of rank), clear of the bottom
// safe-area inset. It hides while a field has focus or the keyboard is up, and comes back on
// blur (hds.motion.spatial; reduced motion uses opacity). Hidden, it is inert. From lg the same
// keys sit inline under the title block. Lives in the JobPage chunk (its CSS is not in base.css).
// Delete this when HDS ships a bottom action bar.
// hds-gap: hirobius/hds#1432 (G1: a bottom dock that hides while a field has focus)
import { Children, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Box } from '@hirobius/design-system';
import { useVisualViewportVars } from './useVisualViewportVars';
import { useFieldFocused } from './fieldFocus';
import './ActionDock.css';

export function ActionDock({
  docked,
  label,
  children,
}: {
  /** Dock at the bottom (a phone) or sit inline under the title block (lg). */
  docked: boolean;
  /** The group's name, e.g. "Actions for Design Systems Lead". */
  label: string;
  children: ReactNode;
}) {
  const typing = useFieldFocused();
  const vvRef = useVisualViewportVars<HTMLDivElement>();
  // With no keys there is no dock and no spacer.
  if (Children.toArray(children).length === 0) return null;
  if (!docked)
    return (
      <Box role="group" aria-label={label} className="rjb-dock-row" data-rjb-actions="">
        {children}
      </Box>
    );
  const hidden = typing;
  return (
    <>
      {/* Keeps the page's end clear of the dock. */}
      <Box className="rjb-dock-spacer" aria-hidden="true" />
      {/* On body (which carries data-hds): a transformed ancestor would pin a fixed box to
          itself, not to the viewport. */}
      {createPortal(
        <Box
          ref={vvRef}
          role="group"
          aria-label={label}
          className="rjb-dock"
          data-rjb-actions=""
          data-hidden={hidden ? 'true' : 'false'}
          aria-hidden={hidden || undefined}
          inert={hidden || undefined}
        >
          {children}
        </Box>,
        document.body,
      )}
    </>
  );
}

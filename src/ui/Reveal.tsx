// Minimal MUI-free collapse (issue #8): animates open/close via the CSS
// grid-template-rows 0fr↔1fr trick — no measuring, no JS animation. Content stays
// mounted (matching MUI Collapse) but is hidden from the a11y tree while closed.
import type { ReactNode } from 'react';

export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.2s ease',
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  );
}

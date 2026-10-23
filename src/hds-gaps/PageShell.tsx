// HDS gap: the app shell at the portfolio's measure (Adrian 2026-10-22: "match the width of the
// desktop app to that of the portfolio"). The portfolio's shell is 1180px in all, with
// an inline gutter of clamp(1.25rem, 5vw, 4rem), so content tops out near 1052px and the gutters
// grow with the viewport. HDS `Container` only offers `content` (760) and `max` (1200) and owns no
// gutter, so this is HDS Container with the portfolio's width and gutter (PageShell.css). The
// header, the tabs and every page sit in it. Ask: a `shell` width (1180) on Container and a fluid
// region gutter token. Delete this when it lands (docs/hds-upstream-asks-0.9.md).
import type { ReactNode } from 'react';
import { Container } from '@hirobius/design-system';
import './PageShell.css';

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <Container maxWidth="max" className="rjb-shell">
      {children}
    </Container>
  );
}

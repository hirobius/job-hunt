// HDS gap: NavList.Item has no trailing slot. Its children render inside the row's link, so a row
// that needs a second link of its own (the job rail's posting link, Adrian 2026-10-22) can't put
// it there: a link in a link is invalid HTML and a tap couldn't tell the two apart. This is
// NavList.Item's link row (its HDS 0.30 look, in tokens: NavListActionItem.css) with an action
// beside the link in the same `li`, for use inside HDS `NavList`. Ask: a trailing action slot on
// NavList.Item, rendered outside its link. Delete this when it lands
// (docs/hds-upstream-asks-0.9.md).
import type { ReactNode } from 'react';
import './NavListActionItem.css';

export function NavListActionItem({
  href,
  current = false,
  action,
  children,
}: {
  /** The row's destination, as NavList.Item's `href`. */
  href: string;
  /** Marks the row as the current page (aria-current="page"), as NavList.Item's `current`. */
  current?: boolean;
  /** A control beside the row's link, outside it (the job rail's posting link). */
  action?: ReactNode;
  /** The row's content, inside its link: a title line, a meta line, a badge. */
  children: ReactNode;
}) {
  return (
    <li className="rjb-navlist-row">
      <a href={href} aria-current={current ? 'page' : undefined} className="rjb-navlist-link">
        {children}
      </a>
      {action && <div className="rjb-navlist-action">{action}</div>}
    </li>
  );
}

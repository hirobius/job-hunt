// HDS gap (#130): a list of links where one is the current selection. HDS has no selectable list,
// no NavList and no list item with `aria-current`, so this is a `ul` of anchors with the current
// one marked, styled with HDS tokens in RailList.css. Ask (hds#817): a
// `NavList` or a selectable `ListItem`. Delete this when it lands.
import type { ReactNode } from 'react';
import './RailList.css';

export interface RailItem {
  id: string;
  href: string;
  current: boolean;
  /** The row's name for assistive tech when its visible text is more than a name. */
  label?: string;
  children: ReactNode;
}

export default function RailList({ items }: { items: RailItem[] }) {
  return (
    <ul className="rail-list">
      {items.map((it) => (
        <li key={it.id}>
          <a
            className="rail-list__row"
            href={it.href}
            aria-current={it.current ? 'page' : undefined}
            aria-label={it.label}
          >
            {it.children}
          </a>
        </li>
      ))}
    </ul>
  );
}

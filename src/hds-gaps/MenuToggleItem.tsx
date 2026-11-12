// A Menu row that is an on/off toggle (redesign §5.9, #549): the Account menu's Dark theme and
// Pause animations. HDS Menu has a CheckboxItem (a check mark on the left) but no row with a switch
// on its end and a fixed label. This is an HDS Menu.Item with the checkbox item's role and state
// (`menuitemcheckbox`, `aria-checked`, as Radix's CheckboxItem sets them), a 16px icon, the label
// and a switch drawn on the right (`.rjb-menu-switch`, theme/late.css; decorative, the state is
// the row's own). A press flips it and keeps the menu open, so the change is seen in place.
// hds-gap: hirobius/hds#1440 (G9: Menu rows with a toggle and a description line)
import type { ReactNode } from 'react';
import { Menu } from '@hirobius/design-system';

export function MenuToggleItem({
  checked,
  onCheckedChange,
  icon,
  children,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** An HDS Icon at 16px. */
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Menu.Item
      role="menuitemcheckbox"
      aria-checked={checked}
      className="rjb-menu-toggle"
      onSelect={(e) => {
        e.preventDefault(); // stay open: the switch moves under the pointer
        onCheckedChange(!checked);
      }}
    >
      {icon}
      <span className="rjb-menu-toggle-label">{children}</span>
      <span className="rjb-menu-switch" data-state={checked ? 'on' : 'off'} aria-hidden="true" />
    </Menu.Item>
  );
}

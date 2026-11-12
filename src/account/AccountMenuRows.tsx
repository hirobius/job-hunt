// The Account menu's rows (redesign §5.9, #549): 9 items in 4 groups, each with a 16px icon. Its
// own chunk (lazyDialogs.ts `AccountMenuRows`), fetched on idle and as the Account button is pointed
// at or focused, so the icons and the toggle rows stay off the entry (AccountMenu.tsx keeps the
// trigger, the sheet and the dialogs). Header lines are Menu.Labels (not focusable, not clickable).
// The email is plain text; index.html's format-detection meta stops iOS turning it into a mailto link.
import { useState, type ReactNode } from 'react';
import {
  Building2,
  Database,
  FileText,
  LogOut,
  MessageSquare,
  Moon,
  Pause,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Button, Icon, Menu, Text } from '@hirobius/design-system';
import { MenuToggleItem } from '../hds-gaps/MenuToggleItem';
import { useColorMode } from '../ColorMode';
import { openDocuments, openLegal } from '../route';
import { motionPaused, setMotionPaused } from '../motionPref';
import { useCloudSync } from './accountContext';
import { SIGN_IN_ITEM, SIGN_IN_LABEL } from './signInCopy';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenuRows({
  opensDialog,
  openProfile,
  openCompanies,
  openData,
}: {
  /** Wrap an item that opens a dialog: the dialog gives focus back to the Account button. */
  opensDialog: (open: () => void) => () => void;
  openProfile: () => void;
  openCompanies: () => void;
  openData: () => void;
}) {
  const sync = useCloudSync();
  const { mode, toggle } = useColorMode();
  return (
    <>
      {/* 1. Who you are. */}
      {sync.user ? (
        <>
          <Menu.Label data-account-line>Signed in as {sync.user.email}</Menu.Label>
          <Menu.Label data-account-line>
            <Text variant="caption" as="span" tone="secondary">
              {syncLine(sync.status)}
            </Text>
          </Menu.Label>
          {sync.offline && (
            <Row icon={RefreshCw} onSelect={sync.retry}>
              Retry sync
            </Row>
          )}
          <Row icon={LogOut} onSelect={sync.signOut}>
            Sign out
          </Row>
        </>
      ) : (
        <>
          <Menu.Label data-account-line>{SIGN_IN_LABEL}</Menu.Label>
          {/* The grey key (redesign §3): an HDS secondary Button as the menu item, "Sign in"; the
              label above says why (signInCopy.ts). */}
          <Menu.Item asChild onSelect={opensDialog(() => sync.setSignInOpen(true))}>
            <Button variant="secondary" size="sm" className="rjb-menu-key">
              {SIGN_IN_ITEM}
            </Button>
          </Menu.Item>
        </>
      )}
      <Menu.Separator />
      {/* 2. Your things. Documents (was Templates, #227) is a dialog over the page (#471 slice
          4); Back or Close returns to the page under it. */}
      <Row icon={FileText} onSelect={() => openDocuments('')}>
        Documents
      </Row>
      <Row icon={SlidersHorizontal} onSelect={opensDialog(openProfile)}>
        Search profile
      </Row>
      <Row icon={Building2} onSelect={opensDialog(openCompanies)}>
        Companies
      </Row>
      <Row icon={Database} onSelect={opensDialog(openData)}>
        Data
      </Row>
      <Menu.Separator />
      {/* 3. Display: toggles that show their state and keep the menu open. */}
      <MenuToggleItem
        checked={mode === 'dark'}
        onCheckedChange={toggle}
        icon={<Icon icon={Moon} size="small" />}
      >
        Dark theme
      </MenuToggleItem>
      <MotionToggle />
      <Menu.Separator />
      {/* 4. About. */}
      <Row icon={MessageSquare} onSelect={() => window.open(FEEDBACK_URL, '_blank', 'noopener')}>
        Send feedback
      </Row>
      <Row icon={ShieldCheck} onSelect={() => openLegal('privacy')}>
        Privacy and terms
      </Row>
    </>
  );
}

/** One menu row: a 16px icon, then the label. */
function Row({
  icon,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Menu.Item onSelect={onSelect}>
      <Icon icon={icon} size="small" />
      {children}
    </Menu.Item>
  );
}

/** Pause animations (WCAG 2.2.2: the app bar's flame loops on; motionPref.ts). Read as the menu
 *  opens (its content mounts only then), so another tab's choice or a system change shows here
 *  too (#516 review). */
function MotionToggle() {
  const [paused, setPaused] = useState(motionPaused);
  return (
    <MenuToggleItem
      checked={paused}
      onCheckedChange={(next) => {
        setMotionPaused(next);
        setPaused(next);
      }}
      icon={<Icon icon={Pause} size="small" />}
    >
      Pause animations
    </MenuToggleItem>
  );
}

// The status reads "Synced · <email>"; the header already names the email, so drop it here.
function syncLine(status: string): string {
  return status.startsWith('Synced') ? 'Synced' : status;
}

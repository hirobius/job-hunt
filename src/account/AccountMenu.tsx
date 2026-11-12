// The header's account menu (#115 Phase 1; redesign §5.9, #549: 9 items in 4 groups). One home for
// everything about "my account and my data", top to bottom:
//   1. who you are: signed out "On this device only" + why to sign in, and Sign in as a grey key;
//      signed in the email, the sync line (Retry when it failed) and Sign out
//   2. Documents (#227), Search profile (Scan details sits in it, #549), Companies, Data (#550: one
//      lazy dialog for back up, restore, export, Recently removed and the repairs)
//   3. Dark theme and Pause animations, toggles that show their state (MenuToggleItem, G9)
//   4. Send feedback, Privacy and terms (#43)
// Every row has a 16px icon; rows are 44px on a phone, 38px from sm (theme/late.css).
import { useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Avatar, Button, Dialog, Icon, Menu, Text } from '@hirobius/design-system';
import { MenuToggleItem } from '../hds-gaps/MenuToggleItem';
import { useColorMode } from '../ColorMode';
import { refocusAccount, useCloudSync } from './accountContext';
import { openDocuments, openLegal } from '../route';
import { useBackCloses } from '../useBackCloses';
import { CompaniesDialog, DataDialog, SearchProfileDialog, useLoadedWhen } from '../lazyDialogs';
import './sheet.css';
import { setReturnFocus } from './returnFocus';
import { motionPaused, setMotionPaused } from '../motionPref';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenu() {
  const sync = useCloudSync();
  const { accountTrigger, setAccountTrigger } = sync;
  const { mode, toggle } = useColorMode();
  // Followed and Ignored companies (simplify Q6: the Companies tab's place).
  const [companies, setCompanies] = useState(false);
  useBackCloses(companies, () => setCompanies(false), 'companies');
  const companiesReady = useLoadedWhen(CompaniesDialog, companies, () => setCompanies(false));
  // Kept across this menu's own renders: the menu closes as the dialog takes focus, and redrawing
  // the list then held the dialog's first paint past 300 ms (#212).
  const companiesDialog = useMemo(
    () => <CompaniesDialog onCloseAutoFocus={refocusAccount(accountTrigger)} />,
    [accountTrigger],
  );
  // The Search profile (#388: Calibrate's and Manage track's place).
  const [profile, setProfile] = useState(false);
  useBackCloses(profile, () => setProfile(false), 'search-profile');
  const profileReady = useLoadedWhen(SearchProfileDialog, profile, () => setProfile(false));
  // Data (#550): its own lazy dialog.
  const [dataOpen, setDataOpen] = useState(false);
  useBackCloses(dataOpen, () => setDataOpen(false), 'data');
  const dataReady = useLoadedWhen(DataDialog, dataOpen, () => setDataOpen(false));
  // Controlled, so the browser's Back closes the open menu instead of leaving the page.
  const [open, setOpen] = useState(false);

  useBackCloses(open, () => setOpen(false), 'account-menu');
  // Fetch the lazy dialogs' chunks as the menu opens, so Companies and Search profile answer
  // within 300 ms of the press (#212) instead of waiting on the fetch. A failure is retried on
  // the item's press (useLoadedWhen), which closes the sheet and raises the reload notice.
  const openMenu = (next: boolean) => {
    if (next)
      for (const view of [CompaniesDialog, SearchProfileDialog, DataDialog])
        view.preload().catch(() => {});
    setOpen(next);
  };
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Run an item that opens a dialog; the dialog gives focus back to this trigger on close. */
  const opensDialog = (open: () => void) => () => {
    setReturnFocus(triggerRef.current);
    open();
  };
  // The trigger is the HDS Avatar (rev-3 P): your initial when signed in, a neutral person icon
  // when not. No unsynced dot (Adrian 2026-10-22): the menu's sync line says where data lives.
  const initial = sync.user?.email?.trim()[0]?.toUpperCase();

  // Header lines are Menu.Labels (not focusable, not clickable). The email is plain text;
  // index.html's format-detection meta stops iOS turning it into a mailto link.
  return (
    <>
      {/* Non-modal, so a dialog opened from an item (sign-in, restore) takes focus cleanly. */}
      <Menu modal={false} open={open} onOpenChange={openMenu}>
        <Menu.Trigger asChild>
          <Button
            ref={(el: HTMLButtonElement | null) => {
              triggerRef.current = el;
              setAccountTrigger?.(el);
            }}
            variant="tertiary"
            iconOnly
            iconLeft={
              <Avatar
                size="sm"
                alt=""
                initials={initial}
                fallback={initial ? 'initials' : 'icon'}
                className="rjb-avatar"
              />
            }
            label="Account"
            className="rjb-account"
          />
        </Menu.Trigger>
        <Menu.Content align="end" className="rjb-account-menu rjb-menu-sheet">
          {/* The phone sheet's grab handle (theme/late.css); nothing on a wider screen. */}
          <span className="rjb-sheet-handle" aria-hidden="true" />
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
              <Menu.Label data-account-line>On this device only</Menu.Label>
              <Menu.Label data-account-line>
                <Text variant="caption" as="span" tone="secondary">
                  Sign in to see your jobs on any device
                </Text>
              </Menu.Label>
              {/* The grey key (redesign §3): an HDS secondary Button as the menu item. */}
              <Menu.Item asChild onSelect={opensDialog(() => sync.setSignInOpen(true))}>
                <Button variant="secondary" size="sm" className="rjb-menu-key">
                  Sign in
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
          <Row icon={SlidersHorizontal} onSelect={opensDialog(() => setProfile(true))}>
            Search profile
          </Row>
          <Row icon={Building2} onSelect={opensDialog(() => setCompanies(true))}>
            Companies
          </Row>
          <Row icon={Database} onSelect={opensDialog(() => setDataOpen(true))}>
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
          <Row
            icon={MessageSquare}
            onSelect={() => window.open(FEEDBACK_URL, '_blank', 'noopener')}
          >
            Send feedback
          </Row>
          <Row icon={ShieldCheck} onSelect={() => openLegal('privacy')}>
            Privacy and terms
          </Row>
        </Menu.Content>
      </Menu>
      <Dialog open={companies && companiesReady} onOpenChange={setCompanies}>
        {companies && companiesReady && companiesDialog}
      </Dialog>
      <Dialog open={profile && profileReady} onOpenChange={setProfile}>
        {profile && profileReady && (
          <SearchProfileDialog
            onDone={() => setProfile(false)}
            onCloseAutoFocus={refocusAccount(accountTrigger)}
          />
        )}
      </Dialog>
      <Dialog open={dataOpen && dataReady} onOpenChange={setDataOpen}>
        {dataOpen && dataReady && (
          <DataDialog
            onClose={() => setDataOpen(false)}
            onCloseAutoFocus={refocusAccount(accountTrigger)}
          />
        )}
      </Dialog>
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

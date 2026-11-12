// The header's account menu (#115 Phase 1; redesign §5.9, #549: 9 items in 4 groups). One home for
// everything about "my account and my data", top to bottom:
//   1. who you are: signed out "On this device only" + why to sign in, and Sign in as a grey key;
//      signed in the email, the sync line (Retry when it failed) and Sign out
//   2. Documents (#227), Search profile (Scan details sits in it, #549), Companies, Data (#550: one
//      lazy dialog for back up, restore, export, Recently removed and the repairs)
//   3. Dark theme and Pause animations, toggles that show their state (MenuToggleItem, G9)
//   4. Send feedback, Privacy and terms (#43)
// Every row has a 16px icon; rows are 44px on a phone, 38px from sm (theme/late.css). The rows live
// in AccountMenuRows.tsx, a lazy chunk; this file keeps the trigger, the sheet and the dialogs.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Dialog, Menu } from '@hirobius/design-system';
import { refocusAccount, useCloudSync } from './accountContext';
import { useBackCloses } from '../useBackCloses';
import {
  AccountMenuRows,
  CompaniesDialog,
  DataDialog,
  SearchProfileDialog,
  useLoadedWhen,
} from '../lazyDialogs';
import {
  setSearchProfileOpen as setProfile,
  takeSearchProfileOpener,
  useSearchProfileOpen,
} from '../jobDialogs';
import './sheet.css';
import { setReturnFocus } from './returnFocus';

/** Fetch the rows' chunk once the app is idle, so the first open needs no round trip. */
const ROWS_PREFETCH_MS = 3000;
const preloadRows = () => void AccountMenuRows.preload().catch(() => {});

export default function AccountMenu() {
  const sync = useCloudSync();
  const { accountTrigger, setAccountTrigger } = sync;
  useEffect(() => {
    const t = setTimeout(preloadRows, ROWS_PREFETCH_MS);
    return () => clearTimeout(t);
  }, []);
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
  // Shared (jobDialogs.ts): Find's empty state opens it too (#553).
  const profile = useSearchProfileOpen();
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
            onPointerEnter={preloadRows}
            onFocus={preloadRows}
          />
        </Menu.Trigger>
        <Menu.Content align="end" className="rjb-account-menu rjb-menu-sheet">
          {/* The phone sheet's grab handle (theme/late.css); nothing on a wider screen. */}
          <span className="rjb-sheet-handle" aria-hidden="true" />
          {/* The rows are their own chunk (AccountMenuRows.tsx, fetched on idle and as the
              button is pointed at or focused), so their icons and toggles stay off the entry. */}
          <Suspense fallback={null}>
            <AccountMenuRows
              opensDialog={opensDialog}
              openProfile={() => setProfile(true)}
              openCompanies={() => setCompanies(true)}
              openData={() => setDataOpen(true)}
            />
          </Suspense>
        </Menu.Content>
      </Menu>
      <Dialog open={companies && companiesReady} onOpenChange={setCompanies}>
        {companies && companiesReady && companiesDialog}
      </Dialog>
      <Dialog open={profile && profileReady} onOpenChange={setProfile}>
        {profile && profileReady && (
          <SearchProfileDialog
            onDone={() => setProfile(false)}
            onCloseAutoFocus={(e: Event) => {
              const opener = takeSearchProfileOpener();
              if (!opener) return refocusAccount(accountTrigger)();
              e.preventDefault();
              opener.focus();
            }}
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

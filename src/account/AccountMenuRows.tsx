// The Account menu's rows (redesign §5.9, #549): 8 items in 4 groups (9 signed out, with Scan now, #694), each with a 16px icon. Its
// own chunk (lazyDialogs.ts `AccountMenuRows`), fetched on idle and as the Account button is pointed
// at or focused, so the icons and the toggle rows stay off the entry (AccountMenu.tsx keeps the
// trigger, the sheet and the dialogs). Header lines are Menu.Labels (not focusable, not clickable).
// The email is plain text; index.html's format-detection meta stops iOS turning it into a mailto link.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  Check,
  Database,
  FileText,
  LogOut,
  MessageSquare,
  Pause,
  RefreshCw,
  ShieldCheck,
  Eraser,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Button, Icon, Menu, Text } from '@hirobius/design-system';
import { MenuToggleItem } from '../hds-gaps/MenuToggleItem';
import { openDocuments, openLegal } from '../route';
import { motionPaused, setMotionPaused } from '../motionPref';
import { useCloudSync } from './accountContext';
import { SIGN_IN_BENEFIT, SIGN_IN_ITEM, SIGN_IN_STATE } from './signInCopy';
import { useJobs } from '../store';
import { isSample } from '../demo/isSample';
import { clearSample } from '../demo/sampleSession';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenuRows({
  opensDialog,
  openProfile,
  openCompanies,
  openData,
  onReady,
}: {
  /** Wrap an item that opens a dialog: the dialog gives focus back to the Account button. */
  opensDialog: (open: () => void) => () => void;
  openProfile: () => void;
  openCompanies: () => void;
  openData: () => void;
  /** Called once the rows are on the page, with an element inside the menu. */
  onReady?: (inside: HTMLElement | null) => void;
}) {
  const sync = useCloudSync();
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => onReady?.(mark.current), [onReady]);
  return (
    <>
      <span ref={mark} hidden />
      {/* 1. Who you are. */}
      {sync.user ? (
        <>
          <IdentityHeader
            primary={sync.user.email ?? ''}
            spoken="Signed in as "
            caption={syncLine(sync.status)}
            synced={sync.status.startsWith('Synced')}
          />
          {/* The header, then a divider, then the account's actions (2026-11-15). */}
          <Menu.Separator />
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
          <IdentityHeader primary={SIGN_IN_STATE} caption={SIGN_IN_BENEFIT} />
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
      {/* Scan now (#694, was Find's More menu): signed out only, as the server syncs every 15
          minutes signed in; Stop scan while one runs. When it last scanned is Scan details'. */}
      <Row icon={Building2} onSelect={opensDialog(openCompanies)}>
        Companies
      </Row>
      <Row icon={Database} onSelect={opensDialog(openData)}>
        Data
      </Row>
      {/* Clear sample data (bare list, 2026-11-13: was the Apply list's sample line): only while
          sample jobs exist; clears exactly those (sampleSession `clearSample`). */}
      <ClearSampleRow />
      <Menu.Separator />
      {/* 3. Display: Pause animations, a toggle that shows its state (the theme is the app bar's ThemeToggle, #688). */}
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

/** Clear sample data, shown only while the tracker holds sample jobs. */
function ClearSampleRow() {
  const jobs = useJobs();
  if (!jobs.some(isSample)) return null;
  return (
    <Row icon={Eraser} onSelect={() => void clearSample()}>
      Clear sample data
    </Row>
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

/** The menu's identity block (Adrian 2026-11-15): one tight header, a primary line (the email, or
 *  "On this device only" signed out; ui, semibold, truncated) over a caption (the sync status with a
 *  check once synced, or the benefit line), 4px apart (`.rjb-account-id`, late.css). A Menu.Label:
 *  not focusable, not clickable. `spoken` is read before the primary line ("Signed in as …"). */
function IdentityHeader({
  primary,
  spoken,
  caption,
  synced = false,
}: {
  primary: string;
  spoken?: string;
  caption: string;
  synced?: boolean;
}) {
  return (
    <Menu.Label className="rjb-account-id">
      <Text
        variant="ui"
        as="span"
        tone="primary"
        className="rjb-semibold"
        truncate
        data-account-line
      >
        {spoken && <span className="sr-only">{spoken}</span>}
        {primary}
      </Text>
      <Text
        variant="caption"
        as="span"
        tone="secondary"
        className="rjb-account-id-caption"
        data-account-line
      >
        {synced && <Icon icon={Check} size={12} aria-hidden />}
        {caption}
      </Text>
    </Menu.Label>
  );
}

// The status reads "Synced · <email>"; the header already names the email, so drop it here.
function syncLine(status: string): string {
  return status.startsWith('Synced') ? 'Synced' : status;
}

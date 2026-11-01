// The auto-scan's only UI (#415): "Scan now" with "Scanning N sources · Last scanned hh:mm, K new", and
// New companies (Follow / Ignore). Today mounts both: the status at its top, New companies at its
// end. Every action says so with an Undo.
import { Button, Icon, Stack, Text } from '@hirobius/design-system';
import { RefreshCw } from 'lucide-react';
import { ItemList, ItemRow, Panel } from './PipelinePanel';
import { showNotice } from './saveNotice';
import {
  cancelScan,
  followFound,
  ignoreFound,
  lastScannedLine,
  newCompanies,
  scanBoardUrls,
  scanNow,
  useScan,
  type FoundCompany,
  type LeadSource,
  type ScanProgress,
} from './feed/autoScan';
import { useScanningCount } from './feed/scanningCount';
import { useScanInput } from './feed/useAutoScan';
import { useCloudSync } from './account/accountContext';
import { useProfile } from './profile';
import { designSystemsTrack } from './tracks/track-config';

const VIA_LABEL: Record<LeadSource, string> = {
  yc: 'YC',
  adele: 'Adele',
  github: 'GitHub',
  seed: 'the seed list',
};

function progressLine(p: ScanProgress | undefined): string {
  switch (p?.phase) {
    case 'probe':
      return p.total ? `Checking boards (${p.done ?? 0} of ${p.total})…` : 'Checking boards…';
    case 'read':
      return 'Reading boards and feeds…';
    case 'filter':
      return 'Sorting postings…';
    default:
      return 'Finding companies…';
  }
}

/** "Scan now" and the last scan's line (or why it failed). */
export function ScanStatus({
  counts,
}: {
  /** Review new's own new and source counts, once it has read (one number on the page). */
  counts?: { newToday: number; sources: number };
}) {
  const { state, running, progress } = useScan();
  const input = useScanInput();
  const { user } = useCloudSync();
  const profile = useProfile();
  // The server's rotation scans the whole board set only for a signed-in design systems profile
  // (sync-postings, plan.ts compileProfile); anyone else is scanned by this browser alone.
  const serverScans = !!user && profile?.scorer === designSystemsTrack.slug;
  const scanning = useScanningCount(scanBoardUrls(input.boardUrls, state), serverScans);
  const line = running
    ? progressLine(progress)
    : (state.error ??
      lastScannedLine(state, undefined, counts, scanning) ??
      'Not scanned yet. The first scan runs on its own.');
  return (
    <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
      <Text variant="caption" as="p" tone="secondary" role="status">
        {line}
      </Text>
      {running ? (
        <Button size="sm" variant="tertiary" onClick={cancelScan}>
          Stop scan
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<Icon icon={RefreshCw} />}
          onClick={() => void scanNow(input)}
        >
          Scan now
        </Button>
      )}
    </Stack>
  );
}

function companyLine(f: FoundCompany): string {
  const jobs = f.confirmed
    ? `${f.jobs} matching ${f.jobs === 1 ? 'job' : 'jobs'}`
    : 'Board not confirmed: follow it if it is theirs';
  return `${jobs} · from ${VIA_LABEL[f.via]}`;
}

/** The companies the scan found, not yet followed or ignored. Renders nothing when there are none. */
export function NewCompanies() {
  const { state } = useScan();
  const list = newCompanies(state);
  if (!list.length) return null;
  const follow = (f: FoundCompany) => {
    const undo = followFound(f.key);
    showNotice({
      title: `Following ${f.name}`,
      description: 'Its jobs show in Review new.',
      tone: 'success',
      actions: [{ label: 'Undo', run: undo }],
    });
  };
  const ignore = (f: FoundCompany) => {
    const undo = ignoreFound(f.key);
    showNotice({
      title: `Ignored ${f.name}`,
      description: 'The scan won’t bring it back.',
      actions: [{ label: 'Undo', run: undo }],
    });
  };
  return (
    <Panel
      label="New companies"
      title="New companies"
      count={list.length}
      countLabel={`${list.length} companies`}
      description="Found by the scan. A confirmed board’s matching jobs are already in Review new."
    >
      <ItemList label="New companies">
        {list.map((f) => (
          <ItemRow key={f.key}>
            <Stack gap="tight">
              <Stack gap="px4">
                <Text variant="body" as="p" className="rjb-semibold">
                  {f.name}
                </Text>
                <Text variant="caption" as="p" tone="secondary">
                  {companyLine(f)}
                </Text>
              </Stack>
              <Stack direction="row" gap="tight" wrap="wrap">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Follow ${f.name}`}
                  onClick={() => follow(f)}
                >
                  Follow
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Ignore ${f.name}`}
                  onClick={() => ignore(f)}
                >
                  Ignore
                </Button>
              </Stack>
            </Stack>
          </ItemRow>
        ))}
      </ItemList>
    </Panel>
  );
}

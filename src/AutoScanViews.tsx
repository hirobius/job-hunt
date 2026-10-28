// The auto-scan's only UI (#415): "Scan now" with "Last scanned hh:mm · N new from M sources", and
// New companies (Follow / Ignore). Both are exported for Today (the Today slice mounts them) and
// sit on Review new meanwhile. Every action says so with an Undo.
import { Button, Icon, Stack, Text } from '@hirobius/design-system';
import { RefreshCw } from 'lucide-react';
import { CardList, ListCard, Panel } from './PipelinePanel';
import { showNotice } from './saveNotice';
import {
  cancelScan,
  followFound,
  ignoreFound,
  lastScannedLine,
  newCompanies,
  scanNow,
  useScan,
  type FoundCompany,
  type LeadSource,
  type ScanProgress,
} from './feed/autoScan';
import { useScanInput } from './feed/useAutoScan';

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

/** "Scan now" and the last scan's line (or why it failed). `categoryId`: the track on screen
 *  (Review new's), else the one Discover has open. */
export function ScanStatus({ categoryId }: { categoryId?: string | null }) {
  const { state, running, progress } = useScan();
  const { input } = useScanInput(categoryId);
  const line = running
    ? progressLine(progress)
    : (state.error ?? lastScannedLine(state) ?? 'Not scanned yet. The first scan runs on its own.');
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
export function NewCompanies({ categoryId: given }: { categoryId?: string | null }) {
  const { state } = useScan();
  const { categoryId } = useScanInput(given);
  const list = newCompanies(state);
  if (!list.length) return null;
  const follow = (f: FoundCompany) => {
    const undo = followFound(f.key, categoryId);
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
      description="Found by the scan. A confirmed board’s matching jobs are already below."
    >
      <CardList label="New companies">
        {list.map((f) => (
          <ListCard key={f.key}>
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
          </ListCard>
        ))}
      </CardList>
    </Panel>
  );
}

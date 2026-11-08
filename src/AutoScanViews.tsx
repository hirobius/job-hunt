// The auto-scan's UI (#415) on Find: signed out a compact "Scan now" beside Review new's heading
// (signed in nothing: the server syncs), and New companies (Follow / Ignore) at the end. Every action
// says so with an Undo. The scan's line is the Account menu's Scan details (ScanDetailsDialog).
import { Button, Icon, Stack, Text } from '@hirobius/design-system';
import { RefreshCw } from 'lucide-react';
import { ItemList, ItemRow, Panel } from './PipelinePanel';
import { showNotice } from './saveNotice';
import {
  cancelScan,
  followFound,
  ignoreFound,
  newCompanies,
  scanNow,
  useScan,
  type FoundCompany,
  type LeadSource,
} from './feed/autoScan';
import { useScanInput } from './feed/useAutoScan';
import { useCloudSync } from './account/accountContext';

const VIA_LABEL: Record<LeadSource, string> = {
  yc: 'YC',
  adele: 'Adele',
  github: 'GitHub',
  seed: 'the seed list',
};

/** Find's scan control (Adrian 2026-11-08): no status text on the page. Signed in, the server syncs
 *  every 15 minutes, so nothing shows. Signed out, nothing scans on its own: one compact Scan now
 *  (Stop scan while it runs) beside the Review new heading. When it last scanned, the sources that
 *  didn't answer and what was left out are the Account menu's Scan details (ScanDetailsDialog). */
export function ScanStatus() {
  const { user } = useCloudSync();
  return user ? null : <ScanButton />;
}

function ScanButton() {
  const { running } = useScan();
  const input = useScanInput();
  return running ? (
    <Button size="sm" variant="tertiary" onClick={cancelScan}>
      Stop scan
    </Button>
  ) : (
    <Button
      size="sm"
      variant="secondary"
      iconLeft={<Icon icon={RefreshCw} />}
      onClick={() => void scanNow(input, undefined, { force: true })}
    >
      Scan now
    </Button>
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

// Scan details (Adrian 2026-11-08; in the Search profile since #549): Find shows no status text
// above Browse / Deck, so this is where the scan's freshness, the sources that didn't answer and what
// Review new left out stay reachable. Signed in, "Updated N min ago" from the server's last sync;
// signed out, the last scan's line. A closed row at the end of the Search profile dialog, in its
// chunk (lazyDialogs.ts).
import { Stack, Text } from '@hirobius/design-system';
import { ItemList, ItemRow } from './PipelinePanel';
import { useCloudSync } from './account/accountContext';
import { lastScannedLine, scanBoardUrls, useScan, type ScanProgress } from './feed/autoScan';
import { useScanningCount } from './feed/scanningCount';
import { useServerUpdated } from './feed/serverUpdated';
import { useScanInput } from './feed/useAutoScan';
import { unavailableWhy, useScanDetails } from './feed/scanDetails';

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

/** The scan's line for Scan details: signed in the server's "Updated 4 min ago" (#448); signed
 *  out the last scan's time and counts, the run in progress, or why it failed. */
function useScanLine(counts?: { newToday: number; sources: number }): string {
  const { user } = useCloudSync();
  const { state, running, progress } = useScan();
  const input = useScanInput();
  const scanning = useScanningCount(scanBoardUrls(input.boardUrls, state), false);
  const updated = useServerUpdated(!!user);
  // Signed in, the server's sync is the news; the browser's company discovery runs silently on
  // Find, and its progress shows under it here (useScanProgress).
  if (user) return updated ?? 'Updates every 15 minutes.';
  if (running) return progressLine(progress);
  return (
    state.error ??
    lastScannedLine(state, undefined, counts, scanning) ??
    'Not scanned yet. Sign in for automatic updates, or use Scan now in the Account menu.'
  );
}

export default function ScanDetails() {
  const d = useScanDetails();
  const line = useScanLine(d ? { newToday: d.newToday, sources: d.sourcesRead } : undefined);
  // Signed in, the browser's discovery still runs (silently on Find): its progress shows here.
  const { user } = useCloudSync();
  const { running, progress, state } = useScan();
  const discovering = !!user && running ? progressLine(progress) : null;
  const n = d?.failed.length ?? 0;
  const unsupported = state.unsupported ?? [];
  return (
    <Stack gap="spacious">
      <Text variant="caption" as="p" tone="secondary">
        {line}
      </Text>
      {discovering && (
        <Text variant="caption" as="p" tone="secondary" role="status">
          {discovering}
        </Text>
      )}
      <Stack gap="spacious">
        {!d ? (
          <Text variant="body" as="p" tone="secondary">
            Open Find to read your sources; the details show here after that.
          </Text>
        ) : (
          <>
            <Stack gap="tight" as="section" aria-labelledby="rjb-scan-hidden">
              <Text variant="body" as="h3" className="rjb-semibold" id="rjb-scan-hidden">
                Not shown in Find
              </Text>
              <Text variant="body" as="p" tone="secondary">
                {d.hidden.length ? d.hidden.join(', ') : 'Nothing: every posting read is listed.'}
              </Text>
            </Stack>
            <Stack gap="tight" as="section" aria-labelledby="rjb-scan-unavailable">
              <Text variant="body" as="h3" className="rjb-semibold" id="rjb-scan-unavailable">
                {n ? `${n} ${n === 1 ? 'source' : 'sources'} unavailable` : 'Every source answered'}
              </Text>
              {n > 0 && (
                <>
                  <Text variant="caption" as="p" tone="secondary">
                    The rest are listed. These are tried again on the next read.
                  </Text>
                  <ItemList label="Sources unavailable">
                    {d.failed.map((s) => (
                      <ItemRow key={s.label}>
                        <Text variant="caption" as="p" tone="secondary">
                          {unavailableWhy(s)}
                        </Text>
                      </ItemRow>
                    ))}
                  </ItemList>
                </>
              )}
            </Stack>
          </>
        )}
        {unsupported.length > 0 && (
          <Stack gap="tight" as="section" aria-labelledby="rjb-scan-unsupported">
            <Text variant="body" as="h3" className="rjb-semibold" id="rjb-scan-unsupported">
              {`${unsupported.length} ${unsupported.length === 1 ? 'company' : 'companies'} with an unsupported board`}
            </Text>
            <Text variant="caption" as="p" tone="secondary">
              Their careers sites (Workday, SuccessFactors, Taleo) can’t be read here, so the scan
              skips them.
            </Text>
            <ItemList label="Unsupported boards">
              {unsupported.map((u) => (
                <ItemRow key={u.name}>
                  <Text variant="caption" as="p" tone="secondary">
                    {`${u.name} · unsupported board (${u.ats})`}
                  </Text>
                </ItemRow>
              ))}
            </ItemList>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

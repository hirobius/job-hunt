// The auto-scan's UI (#415) on Find: signed out a compact "Scan now" beside Review new's heading
// (signed in nothing: the server syncs), and New companies (Follow / Ignore) at the end. Every action
// says so with an Undo. The scan's line is the Account menu's Scan details (ScanDetailsDialog).
import { useContext, useState } from 'react';
import {
  Box,
  Button,
  Disclosure,
  Icon,
  InlineLink,
  Stack,
  Text,
  Tooltip as HdsTooltip,
} from '@hirobius/design-system';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { ItemList, ItemRow, Panel, PanelBody } from './PipelinePanel';
import { httpUrl } from './httpUrl';
import { showNotice } from './saveNotice';
import {
  cancelScan,
  followFound,
  foundRoles,
  ignoreFound,
  newCompanies,
  scanNow,
  useScan,
  type FoundCompany,
  type LeadSource,
} from './feed/autoScan';
import { useScanInput } from './feed/useAutoScan';
import { CloudSyncContext, useCloudSync } from './account/accountContext';
import { openSearchProfile } from './jobDialogs';

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

/** Find's "No postings match yet" (#553): Scan now filled and Edit search profile grey; the
 *  heading's compact Scan now steps aside while they show. Signed in there is no Scan now (the
 *  server syncs, Adrian 2026-11-08), so Edit search profile is the one, filled key. Stop scan
 *  (quiet, as the heading's) while a scan runs. */
export function NoResultsKeys() {
  // Read the context directly: Review new also renders on its own (tests), outside the provider.
  const user = useContext(CloudSyncContext)?.user;
  const { running } = useScan();
  const input = useScanInput();
  return (
    <Stack direction="row" wrap="wrap" gap="tight" justify="center">
      {!user &&
        (running ? (
          <Button variant="tertiary" onClick={cancelScan}>
            Stop scan
          </Button>
        ) : (
          <Button
            variant="primary"
            iconLeft={<Icon icon={RefreshCw} />}
            onClick={() => void scanNow(input, undefined, { force: true })}
          >
            Scan now
          </Button>
        ))}
      <Button
        variant={user ? 'primary' : 'secondary'}
        onClick={(e) => openSearchProfile(e.currentTarget)}
      >
        Edit search profile
      </Button>
    </Stack>
  );
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

/** "2 matching jobs · from YC", or why its board isn't read yet. */
function companyLine(f: FoundCompany): string {
  const jobs = f.confirmed
    ? `${f.jobs} matching ${f.jobs === 1 ? 'job' : 'jobs'}`
    : 'Board not confirmed: follow it if it is theirs';
  return `${jobs} · from ${VIA_LABEL[f.via]}`;
}

/** The website's host, "acme.com", for the row's meta line. */
function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The companies the scan found, not yet followed or ignored (Adrian 2026-11-08). Each row says who
 *  they are (the source's one-liner, the website's domain), what the scan read (matching jobs, a
 *  Preview of their titles, the job board once confirmed) and one action row: Follow, Ignore and
 *  Visit website. Companies with no matching job fold under one "Show N with no matching jobs".
 *  Renders nothing when there are none. */
export function NewCompanies() {
  const { state } = useScan();
  const list = newCompanies(state);
  const [showEmpty, setShowEmpty] = useState(false);
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
  const matching = list.filter((f) => f.jobs > 0);
  const empty = list.filter((f) => f.jobs === 0);
  const row = (f: FoundCompany) => (
    <CompanyRow key={f.key} f={f} onFollow={() => follow(f)} onIgnore={() => ignore(f)} />
  );
  return (
    <Panel
      label="New companies"
      title="New companies"
      count={list.length}
      countLabel={`${list.length} companies`}
      description="Found by the scan. A confirmed board’s matching jobs are already in Review new."
    >
      {matching.length > 0 && <ItemList label="New companies">{matching.map(row)}</ItemList>}
      {empty.length > 0 && (
        <PanelBody>
          <Disclosure
            label={`${showEmpty ? 'Hide' : 'Show'} ${empty.length} with no matching jobs`}
            open={showEmpty}
            onOpenChange={setShowEmpty}
          >
            {showEmpty && (
              <ItemList label="New companies with no matching jobs">{empty.map(row)}</ItemList>
            )}
          </Disclosure>
        </PanelBody>
      )}
    </Panel>
  );
}

function CompanyRow({
  f,
  onFollow,
  onIgnore,
}: {
  f: FoundCompany;
  onFollow: () => void;
  onIgnore: () => void;
}) {
  const site = httpUrl(f.website);
  const domain = domainOf(site);
  const roles = f.jobs > 0 ? foundRoles(f) : [];
  const [preview, setPreview] = useState(false);
  return (
    <ItemRow>
      <Stack gap="tight">
        <Stack gap="px4">
          <Text variant="body" as="p" className="rjb-semibold">
            {f.name}
          </Text>
          {f.about && (
            <Text variant="caption" as="p" className="rjb-truncate">
              {f.about}
            </Text>
          )}
          {domain && (
            <Text variant="caption" as="p" tone="secondary">
              {domain}
            </Text>
          )}
          <Text variant="caption" as="p" tone="secondary">
            {companyLine(f)}
          </Text>
          {f.confirmed && (
            <Text variant="caption" as="p">
              <InlineLink href={f.boardUrl}>{`${f.name} job board`}</InlineLink>
            </Text>
          )}
        </Stack>
        {roles.length > 0 && (
          <Disclosure
            label={preview ? 'Hide open roles' : `Preview open roles (${roles.length})`}
            open={preview}
            onOpenChange={setPreview}
          >
            {preview && (
              <Box as="ul" aria-label={`Open roles at ${f.name}`} sx={{ pl: 'md', m: 0 }}>
                {roles.map((t) => (
                  <Text key={t} variant="caption" as="li">
                    {t}
                  </Text>
                ))}
              </Box>
            )}
          </Disclosure>
        )}
        <Stack direction="row" gap="tight" wrap="wrap" align="center">
          <Button size="md" variant="secondary" aria-label={`Follow ${f.name}`} onClick={onFollow}>
            Follow
          </Button>
          <Button size="md" variant="tertiary" aria-label={`Ignore ${f.name}`} onClick={onIgnore}>
            Ignore
          </Button>
          {site && (
            <HdsTooltip>
              <HdsTooltip.Trigger asChild>
                <Button
                  size="md"
                  variant="secondary"
                  iconOnly
                  label={`Visit ${f.name}'s website`}
                  asChild
                >
                  <a
                    href={site}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit ${f.name}'s website`}
                  >
                    <Icon icon={ExternalLink} />
                  </a>
                </Button>
              </HdsTooltip.Trigger>
              <HdsTooltip.Content>Visit website</HdsTooltip.Content>
            </HdsTooltip>
          )}
        </Stack>
      </Stack>
    </ItemRow>
  );
}

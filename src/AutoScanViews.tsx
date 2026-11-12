// The auto-scan's UI (#415). Scan now is Find's More menu, signed out only (FindHeader.tsx, #544).
// The companies the scan found (Follow / Ignore) are the Account menu's Companies dialog's Found list
// (#618, Adrian 2026-11-12). Every action says so with an Undo. The scan's line is Scan details in
// the Account menu's Search profile (ScanDetails.tsx).
import { useState } from 'react';
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
import { ExternalLink } from 'lucide-react';
import { ItemList, ItemRow } from './PipelinePanel';
import { httpUrl } from './httpUrl';
import { showNotice } from './saveNotice';
import {
  followFound,
  foundRoles,
  ignoreFound,
  newCompanies,
  useScan,
  type FoundCompany,
  type LeadSource,
} from './feed/autoScan';

const VIA_LABEL: Record<LeadSource, string> = {
  yc: 'YC',
  adele: 'Adele',
  github: 'GitHub',
  seed: 'the seed list',
};

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

/** The companies the scan found, not yet followed or ignored (Adrian 2026-11-08): the Companies
 *  dialog's Found list since #618. Each row says who they are (the source's one-liner, the
 *  website's domain), what the scan read (matching jobs, a Preview of their titles, the job board
 *  once confirmed) and one action row: Follow, Ignore and Visit website. Companies with no matching
 *  job fold under one "Show N with no matching jobs". Renders nothing when there are none. */
export function NewCompanies() {
  const { state } = useScan();
  const list = newCompanies(state);
  const [showEmpty, setShowEmpty] = useState(false);
  if (!list.length) return null;
  const follow = (f: FoundCompany) => {
    const undo = followFound(f.key);
    showNotice({
      title: `Following ${f.name}`,
      description: 'Its jobs show in Review on Find.',
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
    <Stack gap="tight">
      <Text variant="caption" as="p" tone="secondary">
        Found by the scan. A confirmed board’s matching jobs are already in Review.
      </Text>
      {matching.length > 0 && (
        <ItemList label="Found companies" inset="none">
          {matching.map(row)}
        </ItemList>
      )}
      {empty.length > 0 && (
        <Disclosure
          label={`${showEmpty ? 'Hide' : 'Show'} ${empty.length} with no matching jobs`}
          open={showEmpty}
          onOpenChange={setShowEmpty}
        >
          {showEmpty && (
            <ItemList label="Found companies with no matching jobs" inset="none">
              {empty.map(row)}
            </ItemList>
          )}
        </Disclosure>
      )}
    </Stack>
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

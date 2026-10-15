// Where liveness shows: a bar on the Pipeline (check button, last-checked line, the closed jobs) and
// a note on a job's page. Closed means the company's board no longer lists the posting; nothing here
// changes a job's status.
import { useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, InlineLink, Spinner, Stack, Text } from '@hirobius/design-system';
import { eligibleJobs, type LiveCheck } from './feed/liveness';
import { autoLivenessCheck, checkFor, runLivenessCheck, useLiveness } from './livenessStore';
import { findJobById, jobIdOf, useJobs } from './store';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';

const checkedOn = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The newest check among these jobs, as a date label. */
function lastChecked(checks: LiveCheck[]): string {
  const known = checks.filter((c) => c.state !== 'unknown').map((c) => c.checkedAt);
  return known.length ? checkedOn(known.sort()[known.length - 1]) : '';
}

export function PipelineLiveness({ jobs }: { jobs: Job[] }) {
  const all = useLiveness();
  const eligible = useMemo(() => eligibleJobs(jobs), [jobs]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const hasEligible = eligible.length > 0;
  useEffect(() => {
    if (hasEligible) void autoLivenessCheck(eligible);
    // Once per session: the first Pipeline open with something to check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEligible]);

  if (!hasEligible) return null;

  const checks = eligible.flatMap((j) => checkFor(all, j.url) ?? []);
  const closed = eligible.filter((j) => checkFor(all, j.url)?.state === 'closed');
  const when = lastChecked(checks);

  const onCheck = async () => {
    setBusy(true);
    setNote('');
    const r = await runLivenessCheck(eligible, { force: true });
    setBusy(false);
    if (r.checked === 0 && r.couldNot > 0)
      setNote('Could not check right now. Nothing was changed.');
    else if (r.couldNot > 0) setNote(`Could not check ${r.couldNot}. The rest are up to date.`);
  };

  return (
    <Stack gap="xs" style={{ marginBottom: 'var(--semantic-space-scale-sm)' }}>
      <Stack direction="row" wrap="wrap" gap="xs" align="center">
        <Button size="sm" variant="tertiary" onClick={onCheck} disabled={busy}>
          Check which are still open
        </Button>
        {busy && <Spinner size="sm" label="Checking company boards" />}
        <Text variant="caption" as="span" style={SECONDARY} role="status">
          {note ||
            [
              when && `Checked live ${when}`,
              closed.length > 0 && `${closed.length} closed on the board`,
            ]
              .filter(Boolean)
              .join(' · ')}
        </Text>
      </Stack>
      {closed.length > 0 && (
        <Box as="ul" aria-label="Closed on the board" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {closed.map((j) => (
            <Box as="li" key={j.url}>
              <Text variant="ui" as="span">
                <InlineLink href={`#/queue/${jobIdOf(j.url)}`} externalIcon={false}>
                  {j.label}
                </InlineLink>
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}

/** "Checked live Oct 15", plus a Closed tag; nothing for a job that was never checked. */
export function JobLivenessNote({ url }: { url: string }) {
  const check = checkFor(useLiveness(), url);
  if (!check || check.state === 'unknown') return null;
  return (
    <Stack
      direction="row"
      wrap="wrap"
      gap="xs"
      align="center"
      style={{ marginBottom: 'var(--semantic-space-scale-xs)' }}
    >
      {check.state === 'closed' && <Badge tone="warning">Closed on the board</Badge>}
      <Text variant="caption" as="span" style={SECONDARY}>
        Checked live {checkedOn(check.checkedAt)}
      </Text>
    </Stack>
  );
}

/** The note above a job's page, at the page's own measure. */
export function JobPageLiveness({ jobId }: { jobId: string }) {
  const job = findJobById(jobId, useJobs());
  if (!job) return null;
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <JobLivenessNote url={job.url} />
    </Box>
  );
}

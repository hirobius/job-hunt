// The top of the Pipeline (rapid apply): "To apply (N)" with the one primary Start applying, then
// "Follow up (M)": every applied or interviewing job with the date its follow-up falls due.
import { useMemo } from 'react';
import { Box, Button, Card, InlineLink, Stack, Text } from '@hirobius/design-system';
import { followUpDate, followUpJobs, toApplyQueue } from './applyQueue';
import { deriveJobState } from './jobState';
import { jobIdOf } from './store';
import { jobHash, openApply } from './route';
import { titleOf } from './jobRow';
import { SECONDARY } from './hds-gaps/tone';
import type { Job } from './types';

export default function ApplyQueueSummary({ jobs }: { jobs: Job[] }) {
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  const waiting = useMemo(() => followUpJobs(jobs), [jobs]);
  return (
    <Stack gap="tight">
      <Card bordered padding="none">
        <Box as="section" aria-label={`To apply (${queue.length})`} sx={{ p: 'sm' }}>
          <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
            <Box>
              <Text variant="body" as="h3" className="rjb-semibold">
                {`To apply (${queue.length})`}
              </Text>
              <Text variant="caption" as="p" style={SECONDARY}>
                {queue.length
                  ? 'Pinned first, then newest. Open each, paste from your kit, mark applied.'
                  : 'Nothing waiting. Save jobs from Discover to fill it.'}
              </Text>
            </Box>
            <Button
              variant="primary"
              disabled={!queue.length}
              onClick={() => queue[0] && openApply(jobIdOf(queue[0].url))}
            >
              Start applying
            </Button>
          </Stack>
        </Box>
      </Card>
      {waiting.length > 0 && (
        <Card bordered padding="none">
          <Box as="section" aria-label={`Follow up (${waiting.length})`} sx={{ p: 'sm' }}>
            <Text variant="body" as="h3" className="rjb-semibold">
              {`Follow up (${waiting.length})`}
            </Text>
            <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {waiting.map((j) => {
                const s = deriveJobState(j);
                return (
                  <Box as="li" key={j.url} sx={{ pt: 'xs' }}>
                    <Text variant="ui" as="span">
                      <InlineLink href={jobHash(jobIdOf(j.url))} externalIcon={false}>
                        {`${titleOf(j)} · ${s.status} · ${s.followUp.due ? 'follow up now' : `follow up ${followUpDate(j)}`}`}
                      </InlineLink>
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Card>
      )}
    </Stack>
  );
}

// One job in the Pipeline on a phone (#129): a compact card whose title owns its own row (no
// 1–2-letter line breaks at 390px), a facts line, a status line, then the row's one primary
// action and its menu. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import { Badge, Box, Card, InlineLink, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { appliedAgo, followUpOf, titleOf } from './jobRow';
import { VERDICTS } from './screening';
import { PrimaryAction, RowMenu, StatusBadge } from './JobRowParts';
import type { Job } from './types';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

export default function JobListCard({ job }: { job: Job }) {
  const titleId = useId();
  const facts = [job.company, job.location].filter(Boolean).join(' · ');
  const applied = appliedAgo(job);
  const followUp = followUpOf(job);
  const verdict = VERDICTS.find((v) => v.value === job.verdict);

  return (
    <Card
      as="article"
      aria-labelledby={titleId}
      bordered
      padding="none"
      style={job.archived ? { opacity: 0.55 } : undefined}
    >
      {/* Pinned jobs keep the accent edge they had on the old card. */}
      <Box
        sx={{
          p: 'sm',
          borderLeft: job.priority
            ? '3px solid var(--semantic-accent-rest)'
            : '3px solid transparent',
        }}
      >
        <Stack gap="px8">
          <Text
            variant="body"
            as="h3"
            id={titleId}
            style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}
          >
            <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
              {titleOf(job)}
            </InlineLink>
          </Text>
          {facts && (
            <Text variant="caption" as="p" style={{ ...SECONDARY, margin: 0 }}>
              {facts}
            </Text>
          )}
          <Stack direction="row" wrap="wrap" gap="px8" align="center">
            <StatusBadge job={job} />
            {verdict && <Badge tone={verdict.tone}>{verdict.label}</Badge>}
            {applied && (
              <Text variant="caption" as="span" style={SECONDARY}>
                Applied {applied.toLowerCase()}
              </Text>
            )}
            {followUp &&
              (followUp.due ? (
                <Badge tone="warning">Follow-up due</Badge>
              ) : (
                <Text variant="caption" as="span" style={SECONDARY}>
                  Follow up in {followUp.inDays}d
                </Text>
              ))}
          </Stack>
          <Stack direction="row" gap="px8" align="center" justify="space-between">
            <PrimaryAction job={job} />
            <span style={{ marginInlineStart: 'auto' }}>
              <RowMenu job={job} />
            </span>
          </Stack>
        </Stack>
      </Box>
    </Card>
  );
}

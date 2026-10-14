// One job in the Pipeline on a phone or tablet (#129): a compact card whose title owns its own row
// (no 1–2-letter line breaks at 390px), a facts line, a status line, then the row's one next step
// and its menu as 40px tap targets. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import { Badge, Box, Card, InlineLink, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { RowMenu, RowPrimaryAction, StatusBadge } from './JobRowParts';
import type { Job } from './types';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

export default function JobListCard({ job }: { job: Job }) {
  const titleId = useId();
  const row = rowView(job);

  return (
    <Card as="article" aria-labelledby={titleId} bordered padding="none">
      {/* Pinned jobs keep the accent edge they had on the old card. */}
      <Box
        sx={{
          p: 'sm',
          borderLeft: row.pinned
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
              {row.title}
            </InlineLink>
          </Text>
          {row.facts && (
            <Text variant="caption" as="p" style={{ ...SECONDARY, margin: 0 }}>
              {row.facts}
            </Text>
          )}
          <Stack direction="row" wrap="wrap" gap="px8" align="center">
            <StatusBadge job={job} />
            {row.verdict && <Badge tone={row.verdict.tone}>{row.verdict.label}</Badge>}
            {row.applied && (
              <Text variant="caption" as="span" style={SECONDARY}>
                Applied {row.applied.toLowerCase()}
              </Text>
            )}
            {row.followUp &&
              (row.followUp.due ? (
                <Badge tone="warning">Follow-up due</Badge>
              ) : (
                <Text variant="caption" as="span" style={SECONDARY}>
                  Follow up in {row.followUp.inDays}d
                </Text>
              ))}
          </Stack>
          <Stack
            direction="row"
            gap="px8"
            align="center"
            justify={row.next ? 'space-between' : 'end'}
          >
            <RowPrimaryAction job={job} size="md" />
            <RowMenu job={job} size="md" />
          </Stack>
        </Stack>
      </Box>
    </Card>
  );
}

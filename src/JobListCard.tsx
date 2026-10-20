// One job in the Pipeline on a phone or tablet (#129): a flat row split by a hairline (no card,
// #241) whose title owns its line (no 1–2-letter breaks at 390px), a facts line, a status line,
// then the row's one next step
// and its menu as 40px tap targets. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import { Badge, Box, InlineLink, Stack, Text, VisuallyHidden } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { RowMenu, RowPrimaryAction, StarIcon, StatusBadge } from './JobRowParts';
import type { Job } from './types';

export default function JobListCard({ job }: { job: Job }) {
  const titleId = useId();
  const row = rowView(job);

  return (
    <Box
      as="article"
      aria-labelledby={titleId}
      sx={{ py: 'sm', borderBottom: 'thin solid', borderColor: 'border.default' }}
    >
      <Stack gap="px8">
        {/* Title and menu share the first row, so a card with no next step has no empty footer. */}
        <Stack direction="row" gap="px8" align="start" justify="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Text variant="body" as="h3" weight="bold">
              <Stack direction="row" gap="px4" align="start">
                {/* Starred jobs show a filled star, as in the table. */}
                {row.pinned && (
                  <>
                    <StarIcon on />
                    <VisuallyHidden>Starred</VisuallyHidden>
                  </>
                )}
                <Box as="span" id={titleId} sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                  <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                    {row.title}
                  </InlineLink>
                </Box>
              </Stack>
            </Text>
          </Box>
          <RowMenu job={job} size="md" />
        </Stack>
        {row.factLines.map((line, i) => (
          <Text key={i} variant="caption" as="p" tone="secondary">
            {line}
          </Text>
        ))}
        {/* Badges, not text: status, fit, when and follow-up are chips that wrap, so no dotted line here. */}
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          <StatusBadge job={job} />
          {row.verdict && <Badge tone={row.verdict.tone}>{row.verdict.label}</Badge>}
          {row.applied && (
            <Text variant="caption" as="span" tone="secondary">
              Applied {row.applied.toLowerCase()}
            </Text>
          )}
          {row.followUp &&
            (row.followUp.due ? (
              <Badge tone="warning">Due</Badge>
            ) : (
              <Text variant="caption" as="span" tone="secondary">
                Follow up in {row.followUp.inDays}d
              </Text>
            ))}
        </Stack>
        {row.next && (
          <div>
            <RowPrimaryAction job={job} size="md" />
          </div>
        )}
      </Stack>
    </Box>
  );
}

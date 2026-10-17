// One job in the Pipeline on a phone or tablet (#129): a compact card whose title owns its own row
// (no 1–2-letter line breaks at 390px), a facts line, a status line, then the row's one next step
// and its menu as 40px tap targets. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import {
  Badge,
  Box,
  Card,
  Icon,
  InlineLink,
  Stack,
  Text,
  VisuallyHidden,
} from '@hirobius/design-system';
import { Star } from 'lucide-react';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { RowMenu, RowPrimaryAction, StatusBadge } from './JobRowParts';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';

export default function JobListCard({ job }: { job: Job }) {
  const titleId = useId();
  const row = rowView(job);

  return (
    <Card as="article" aria-labelledby={titleId} bordered padding="none">
      <Box sx={{ p: 'sm' }}>
        <Stack gap="px8">
          {/* Title and menu share the first row, so a card with no next step has no empty footer. */}
          <Stack direction="row" gap="px8" align="start" justify="space-between">
            <Text variant="body" as="h3" className="rjb-semibold" style={{ minWidth: 0 }}>
              <Stack direction="row" gap="px4" align="start">
                {/* Pinned jobs show a star, as in the table. */}
                {row.pinned && (
                  <>
                    <Icon icon={Star} size="small" />
                    <VisuallyHidden>Pinned</VisuallyHidden>
                  </>
                )}
                <Box as="span" id={titleId} sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                  <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                    {row.title}
                  </InlineLink>
                </Box>
              </Stack>
            </Text>
            <RowMenu job={job} size="md" />
          </Stack>
          {row.facts && (
            <Text variant="caption" as="p" style={SECONDARY}>
              {row.facts}
            </Text>
          )}
          {/* One meta line: status · fit · when · follow-up. Short enough to stay on one row at 390. */}
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
                <Badge tone="warning">Due</Badge>
              ) : (
                <Text variant="caption" as="span" style={SECONDARY}>
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
    </Card>
  );
}

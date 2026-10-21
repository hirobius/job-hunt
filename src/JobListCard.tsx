// One job in the Pipeline's Jobs panel on a phone or tablet (#129; rev-3 H anatomy): a badge row
// above the title (fit first, then status, then a due follow-up), the title on its own line, the
// company, the facts with icons (HDS Card.Facts), then the row's one next step and its menu as
// 40px tap targets. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Badge, Box, Card, InlineLink, Stack, Text, VisuallyHidden } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { RowMenu, RowPrimaryAction, StarIcon, StatusBadge } from './JobRowParts';
import { PanelRow } from './PipelinePanel';
import type { Job } from './types';

/** "Oct 11" from a stored date (YYYY-MM-DD or ISO). */
function shortDate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function JobListCard({ job }: { job: Job }) {
  const titleId = useId();
  const row = rowView(job);
  const applied = job.applied ? shortDate(job.applied) : '';
  const facts = [
    job.location ? { icon: MapPin, label: job.location } : null,
    applied ? { icon: Calendar, label: `Applied ${applied}` } : null,
  ].filter((f) => f !== null);

  return (
    // HDS entity card anatomy (0.30): Header (badges above the title), the company, Facts, then
    // Footer with the actions. Flat inside the Jobs panel: no border of its own, a hairline above.
    <PanelRow as="div" flush>
      <Card as="article" aria-labelledby={titleId} padding="none" className="border-0">
        <Card.Header
          metadata={
            // One badge row above the title (rev-3 B): fit first, then status, then due.
            <Stack direction="row" wrap="wrap" gap="px8" align="center">
              {row.verdict && <Badge tone={row.verdict.tone}>{row.verdict.label}</Badge>}
              <StatusBadge job={job} />
              {row.retired && <Badge>Retired</Badge>}
              {row.followUp?.due && <Badge tone="warning">Follow-up due</Badge>}
              {row.pinned && (
                <>
                  <StarIcon on />
                  <VisuallyHidden>Starred</VisuallyHidden>
                </>
              )}
            </Stack>
          }
        >
          {/* Body size, not Card.Title's title size: the page title stays the biggest text. */}
          <Stack gap="px4">
            <Text variant="body" as="h3" className="rjb-semibold" id={titleId}>
              <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                {row.title}
              </InlineLink>
            </Text>
            {job.company && (
              <Text variant="ui" as="p">
                {job.company}
              </Text>
            )}
          </Stack>
        </Card.Header>
        {facts.length > 0 && <Card.Facts items={facts} />}
        {/* The one next step on the left, the menu on the right, on one centre line. */}
        <Card.Footer>
          <Box sx={{ flex: '1 1 auto' }}>
            <Stack direction="row" gap="px8" align="center" justify="space-between">
              {row.next ? <RowPrimaryAction job={job} size="md" /> : <span />}
              <RowMenu job={job} size="md" />
            </Stack>
          </Box>
        </Card.Footer>
      </Card>
    </PanelRow>
  );
}

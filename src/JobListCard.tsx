// One job in the Pipeline's Jobs panel on a phone or tablet (#129; rev-3 H anatomy): a badge row
// above the title (fit first, then status, then a due follow-up), the title on its own line, the
// company, the facts with icons (HDS Card.Facts), then the row's one next step and its menu as
// 40px tap targets. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Box, Card, InlineLink, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { JobBadges, RowMenu, RowPrimaryAction } from './JobRowParts';
import { PanelRow } from './PipelinePanel';
import { shortDate } from './metaLines';
import { savedAgo } from './jobState';
import type { Job } from './types';

export default function JobListCard({ job }: { job: Job }) {
  const titleId = useId();
  const row = rowView(job);
  const applied = job.applied ? shortDate(job.applied) : '';
  const saved = savedAgo(job);
  const facts = [
    job.location ? { icon: MapPin, label: job.location } : null,
    applied
      ? { icon: Calendar, label: `Applied ${applied}` }
      : saved
        ? { icon: Calendar, label: saved }
        : null,
  ].filter((f) => f !== null);

  return (
    // HDS entity card anatomy (0.30): Header (badges above the title), the company, Facts, then
    // Footer with the actions. Flat inside the Jobs panel: no border of its own, a hairline above.
    <PanelRow as="div" flush>
      <Card as="article" aria-labelledby={titleId} padding="none" className="border-0">
        {/* Rev-3 card rhythm: 12 top and bottom, 8 between the badge row, the title block, the
            facts and the actions' line (12 above the actions). Card's own parts pad 16 apiece and
            Card.Facts adds its own block, which made the card about 205px tall instead of ~180,
            so the facts sit in the header and the parts take tighter padding. */}
        <Card.Header metadata={<JobBadges job={job} star />} className="py-3 gap-2">
          <Stack gap="px8">
            {/* Body size, not Card.Title's title size: the page title stays the biggest text. */}
            <Stack gap="px4">
              <Text variant="body" as="h3" weight="bold" className="rjb-card-title" id={titleId}>
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
            {facts.length > 0 && <Card.Facts items={facts} className="p-0" />}
          </Stack>
        </Card.Header>
        {/* The one next step on the left, the menu on the right, on one centre line. */}
        <Card.Footer className="pb-0">
          <Box sx={{ flex: '1 1 auto', pb: 3 }}>
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

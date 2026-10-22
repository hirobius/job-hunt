// One job as an item card (roomy layout, 2026-10-22; was JobListCard on a phone and a table row
// at lg, #129): a borderless HDS Card at every width, the reference board's anatomy built from HDS.
// A round initial; the badge row above the title (status first, then a due follow-up, fit, the
// star; rev-3 B); the title (body, semibold) with the posting link beside it; the company; the
// facts with icons (HDS Card.Facts). The row's one next step and its menu sit under the text on a
// phone and on the right from md. The title links to the job's page, where everything else lives.
import { useId } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Box, Card, InlineLink, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { JobBadges, RowMenu, RowPrimaryAction } from './JobRowParts';
import ItemCard from './ItemCard';
import { useCardPadding } from './cardPadding';
import { JobPostingLink } from './PostingLink';
import { shortDate } from './metaLines';
import { savedAgo } from './jobState';
import type { Job } from './types';

export default function JobCard({
  job,
  avatar = true,
  as = 'article',
  titleAs = 'h3',
}: {
  job: Job;
  /** The company's initial (off on a company's own page, where every job is that company). */
  avatar?: boolean;
  as?: 'article' | 'li';
  /** The title's heading level: one under its section's label. */
  titleAs?: 'h3' | 'h4';
}) {
  const titleId = useId();
  const padding = useCardPadding();
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
    <Card as={as} aria-labelledby={titleId} padding={padding} className="border-0">
      <ItemCard
        avatar={avatar ? job.company || row.title : undefined}
        actions={
          <>
            {row.next ? <RowPrimaryAction job={job} size="md" /> : <span />}
            <RowMenu job={job} size="md" />
          </>
        }
      >
        {/* 8 from the badges to the title, 4 to the company, 12 to the facts. */}
        <Stack gap="px8">
          <JobBadges job={job} star />
          <Stack gap="medium">
            <Stack gap="px4">
              {/* The title opens the job's page; the posting is one tap away right beside it. */}
              <Stack direction="row" gap="px4" align="center">
                <Box sx={{ minWidth: 0 }}>
                  <Text
                    variant="body"
                    as={titleAs}
                    className="rjb-card-title rjb-semibold"
                    id={titleId}
                  >
                    <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                      {row.title}
                    </InlineLink>
                  </Text>
                </Box>
                <JobPostingLink job={job} />
              </Stack>
              {job.company && (
                <Text variant="ui" as="p" tone="secondary">
                  {job.company}
                </Text>
              )}
            </Stack>
            {facts.length > 0 && <Card.Facts items={facts} />}
          </Stack>
        </Stack>
      </ItemCard>
    </Card>
  );
}

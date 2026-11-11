// One job in the Pipeline's Jobs panel on a phone or tablet (#129; rev-3 H anatomy): a badge row
// above the title (fit first, then status, then a due follow-up), the title on its own line, the
// company, the facts with icons (HDS Card.Facts), then the row's one next step and its menu as
// 40px tap targets. The title links to the job's page, where everything else lives; the posting
// opens from the icon link beside it.
import { useId } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { Box, Card, InlineLink, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { JobBadges, RowMenu, RowPrimaryAction } from './JobRowParts';
import { inPlaceClick } from './back';
import { dateLabel } from './jobDates';
import type { Job } from './types';
import CompanyLogo from './CompanyLogo';
import { JOB_ATTR } from './listFocus';
import { useHighlight } from './feedback';
import { jobHighlightKey } from './saveNotice';

export default function JobListCard({
  job,
  onOpen,
}: {
  job: Job;
  /** Open the job in place (the All jobs sheet: a jump replaces the entry and closes the sheet). */
  onOpen?: (job: Job) => void;
}) {
  const titleId = useId();
  // A Remove's Undo (#593) asks for this row: it scrolls into view and flashes.
  const highlight = useHighlight<HTMLElement>(jobHighlightKey(job.url));
  const row = rowView(job);
  // One date per job (Adrian 2026-10-28): posted, else found; the closing date is a badge.
  const when = dateLabel(job);
  const facts = [
    job.location ? { icon: MapPin, label: job.location } : null,
    when ? { icon: Calendar, label: when } : null,
  ].filter((f) => f !== null);

  return (
    // HDS entity anatomy (0.30): Header (badges above the title), the company, Facts, then Footer
    // with the actions. One row of the Jobs panel's list: no card of its own, since the panel is
    // the one card (Adrian 2026-11-01, #449: no cards within cards).
    <Box as="article" ref={highlight} aria-labelledby={titleId} {...{ [JOB_ATTR]: job.url }}>
      {/* Rev-3 card rhythm: 12 top and bottom, 8 between the badge row, the title block, the
            facts and the actions' line (12 above the actions). Card's own parts pad 16 apiece and
            Card.Facts adds its own block, which made the card about 205px tall instead of ~180,
            so the facts sit in the header and the parts take tighter padding. */}
      <Card.Header metadata={<JobBadges job={job} />} className="px-0 py-3 gap-2">
        <Stack gap="px8">
          {/* Body size, not Card.Title's title size: the page title stays the biggest text. */}
          <Stack gap="px4">
            {/* The title opens the job (the posting is the menu's Open posting: no glyph beside the
                title, Adrian 2026-11-08). */}
            <Text variant="body" as="h3" weight="bold" className="rjb-card-title" id={titleId}>
              {/* A click on the link bubbles here: in place when the host opens it itself. */}
              <span onClick={onOpen ? inPlaceClick(() => onOpen(job)) : undefined}>
                <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                  {row.title}
                </InlineLink>
              </span>
            </Text>
            {job.company && (
              <Stack direction="row" gap="px8" align="center">
                <CompanyLogo company={job.company} postings={[job.url]} />
                <Text variant="ui" as="p">
                  {job.company}
                </Text>
              </Stack>
            )}
          </Stack>
          {facts.length > 0 && <Card.Facts items={facts} className="p-0" />}
        </Stack>
      </Card.Header>
      {/* The one next step on the left, the menu on the right, on one centre line. */}
      <Card.Footer className="px-0 pb-0">
        <Box sx={{ flex: '1 1 auto', pb: 3 }}>
          <Stack direction="row" gap="px8" align="center" justify="space-between">
            {row.next ? <RowPrimaryAction job={job} size="md" /> : <span />}
            <RowMenu job={job} size="md" />
          </Stack>
        </Box>
      </Card.Footer>
    </Box>
  );
}

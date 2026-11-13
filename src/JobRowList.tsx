// The one job list (#543, redesign plan 5.7): the phone's All jobs sheet and the lg list column
// beside the job show the same rows. Rows on one surface (in an HDS NavList, never a Card per job):
// the badge row, the title (two lines at most), the company, then its place and its one date. The
// title is the row's link and its hit area covers the row (`::after`), so the link's name is its
// visible text, the title (axe label-content-name-mismatch), and the rest describes it. The open
// job takes the selected fill (#603), never a ring. No key on a row and no posting glyph (#543):
// the job's own page holds its next step and Open posting.
import { useId } from 'react';
import { Box, NavList, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { inPlaceClick } from './back';
import { rowView } from './jobRow';
import { dateLabel } from './jobDates';
import { JobBadges } from './JobRowParts';
import CompanyLogo from './CompanyLogo';
import { JOB_ATTR } from './listFocus';
import { useHighlight } from './feedback';
import { jobHighlightKey } from './saveNotice';
import type { Job } from './types';
import './JobRowList.css';

function Row({ job, current, onPick }: { job: Job; current: boolean; onPick: (job: Job) => void }) {
  const v = rowView(job);
  const id = useId();
  // A Remove's Undo (#593) asks for this row: it scrolls into view and flashes.
  const highlight = useHighlight<HTMLLIElement>(jobHighlightKey(job.url));
  // One date per job (Adrian 2026-10-28): posted, else found; the closing date is a badge.
  const facts = [...v.factLines, dateLabel(job)].filter(Boolean);
  return (
    <li className="rjb-job-row" ref={highlight} {...{ [JOB_ATTR]: job.url }}>
      {/* One badge row above the title (rev-3 B). */}
      <Box id={`${id}-badges`}>
        <JobBadges job={job} />
      </Box>
      <a
        href={jobHash(jobIdOf(job.url))}
        aria-current={current ? 'page' : undefined}
        aria-describedby={`${id}-badges ${id}-facts`}
        className="rjb-job-row-link rjb-semibold rjb-clamp-2"
        onClick={inPlaceClick(() => onPick(job))}
      >
        {v.title}
      </a>
      <Stack direction="row" gap="px8" align="center">
        {job.company && <CompanyLogo inline company={job.company} postings={[job.url]} />}
        <Box id={`${id}-facts`}>
          <Stack>
            {facts.map((line, i) => (
              <Text key={i} variant="caption" as="span" tone="secondary">
                {line}
              </Text>
            ))}
          </Stack>
        </Box>
      </Stack>
    </li>
  );
}

/** The rows of `jobs`, the open one (`openId`) marked. A row's click calls `onPick` in place. */
export default function JobRowList({
  jobs,
  openId,
  onPick,
}: {
  jobs: Job[];
  openId?: string;
  onPick: (job: Job) => void;
}) {
  return (
    <nav aria-label="Jobs" className="rjb-job-rows">
      <NavList>
        {jobs.map((j) => (
          <Row key={j.url} job={j} current={jobIdOf(j.url) === openId} onPick={onPick} />
        ))}
      </NavList>
    </nav>
  );
}

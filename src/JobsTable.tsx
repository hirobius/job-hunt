// The Pipeline at desktop (#129): an HDS Table with sortable columns. A header click goes through
// the same SortKey as the toolbar's Sort menu (jobRow.nextSort), so the two never disagree. Each
// row's title links to the job's page; the last column holds the row's one next step and its
// menu. HDS Table rows can't be clicked, selected or styled (HDS gap, filed with the Phase 7 asks,
// #133), so the title link is the way in, and a retired row says so in words with neutral badges.
import { useId } from 'react';
import {
  Badge,
  InlineLink,
  Stack,
  Table,
  Text,
  VisuallyHidden,
  type TableColumn,
  type TableRow,
} from '@hirobius/design-system';
import { jobIdOf } from './store';
import { jobHash } from './route';
import type { SortKey } from './jobSort';
import { nextSort, rowView, sortDirectionOf, type SortableColumn } from './jobRow';
import { RowMenu, RowPrimaryAction, StarIcon, StatusBadge } from './JobRowParts';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';

const NONE = (
  <Text variant="caption" as="span" style={SECONDARY}>
    —
  </Text>
);
// HDS Table is a CSS grid: the job column takes the room, the rest size to their content.
const HUG = 'max-content';

export default function JobsTable({
  jobs,
  sort,
  onSort,
}: {
  jobs: Job[];
  sort: SortKey;
  onSort: (next: SortKey) => void;
}) {
  const labelId = useId();
  const sortable = (key: SortableColumn, label: string, width = HUG): TableColumn => ({
    key,
    label,
    width,
    sortable: true,
    sortDirection: sortDirectionOf(key, sort),
    onSort: () => onSort(nextSort(key, sort)),
  });
  const columns: TableColumn[] = [
    sortable('job', 'Job', 'minmax(14rem, 1fr)'),
    sortable('status', 'Status'),
    sortable('fit', 'Fit'),
    sortable('applied', 'Applied'),
    sortable('followup', 'Follow-up'),
    { key: 'actions', label: <VisuallyHidden>Actions</VisuallyHidden>, align: 'right', width: HUG },
  ];

  const rows: TableRow[] = jobs.map((job) => {
    const row = rowView(job);
    return {
      key: job.url,
      cells: [
        {
          slot: 'custom',
          content: (
            <Stack gap="px2">
              <Stack direction="row" gap="px4" align="center">
                {/* Starred jobs float to the top in every sort (jobSort), so say why. */}
                {row.pinned && (
                  <>
                    <StarIcon on />
                    <VisuallyHidden>Starred</VisuallyHidden>
                  </>
                )}
                <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                  {row.title}
                </InlineLink>
              </Stack>
              {row.factLines.map((line) => (
                <Text key={line} variant="caption" as="span" style={SECONDARY}>
                  {line}
                </Text>
              ))}
            </Stack>
          ),
        },
        { slot: 'badge', content: <StatusBadge job={job} /> },
        {
          slot: 'badge',
          content: row.verdict ? <Badge tone={row.verdict.tone}>{row.verdict.label}</Badge> : NONE,
        },
        { slot: 'description', content: row.applied ?? NONE },
        {
          slot: 'custom',
          content: !row.followUp ? (
            NONE
          ) : row.followUp.due ? (
            <Badge tone="warning">Due</Badge>
          ) : (
            <Text variant="caption" as="span" style={SECONDARY}>
              In {row.followUp.inDays}d
            </Text>
          ),
        },
        {
          slot: 'action',
          align: 'right',
          content: (
            <Stack direction="row" gap="px8" align="center" justify="end">
              <RowPrimaryAction job={job} />
              <RowMenu job={job} />
            </Stack>
          ),
        },
      ],
    };
  });

  return (
    <>
      <VisuallyHidden id={labelId}>Saved jobs</VisuallyHidden>
      <Table columns={columns} rows={rows} labelledBy={labelId} />
    </>
  );
}

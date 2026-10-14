// The Pipeline at desktop (#129): an HDS Table with sortable columns. A header click goes through
// the same SortKey as the toolbar's Sort menu (jobRow.nextSort), so the two never disagree. Each
// row's title links to the job's page; the last column holds the row's one primary action and its
// menu. HDS Table rows can't be clicked or selected (HDS gap), so the link is the way in.
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
import {
  appliedAgo,
  followUpOf,
  nextSort,
  sortDirectionOf,
  titleOf,
  type SortableColumn,
} from './jobRow';
import { VERDICTS } from './screening';
import { PrimaryAction, RowMenu, StatusBadge } from './JobRowParts';
import type { Job } from './types';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;
const NONE = (
  <Text variant="caption" as="span" style={SECONDARY}>
    —
  </Text>
);

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
  const sortable = (key: SortableColumn, label: string): TableColumn => ({
    key,
    label,
    sortable: true,
    sortDirection: sortDirectionOf(key, sort),
    onSort: () => onSort(nextSort(key, sort)),
  });
  // HDS Table is a CSS grid: the job column takes the room, the rest size to their content.
  const hug = 'max-content';
  const columns: TableColumn[] = [
    { ...sortable('job', 'Job'), width: 'minmax(14rem, 1fr)' },
    { ...sortable('status', 'Status'), width: hug },
    { ...sortable('fit', 'Fit'), width: hug },
    { ...sortable('applied', 'Applied'), width: hug },
    { ...sortable('followup', 'Follow-up'), width: hug },
    { key: 'actions', label: <VisuallyHidden>Actions</VisuallyHidden>, align: 'right', width: hug },
  ];

  const rows: TableRow[] = jobs.map((job) => {
    const facts = [job.company, job.location].filter(Boolean).join(' · ');
    const verdict = VERDICTS.find((v) => v.value === job.verdict);
    const applied = appliedAgo(job);
    const followUp = followUpOf(job);
    return {
      key: job.url,
      cells: [
        {
          slot: 'custom',
          content: (
            <Stack gap="px2">
              <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                {titleOf(job)}
              </InlineLink>
              {facts && (
                <Text variant="caption" as="span" style={SECONDARY}>
                  {facts}
                </Text>
              )}
            </Stack>
          ),
        },
        { slot: 'badge', content: <StatusBadge job={job} /> },
        {
          slot: 'badge',
          content: verdict ? <Badge tone={verdict.tone}>{verdict.label}</Badge> : NONE,
        },
        { slot: 'description', content: applied ?? NONE },
        {
          slot: 'custom',
          content: !followUp ? (
            NONE
          ) : followUp.due ? (
            <Badge tone="warning">Due</Badge>
          ) : (
            <Text variant="caption" as="span" style={SECONDARY}>
              In {followUp.inDays}d
            </Text>
          ),
        },
        {
          slot: 'action',
          align: 'right',
          content: (
            <Stack direction="row" gap="px8" align="center" justify="end">
              <PrimaryAction job={job} />
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

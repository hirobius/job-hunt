// The phone's walk through the Apply list (#471): "‹ 2 of N ›" over the jobs the list shows, in
// its order. Below lg only: at lg the list sits beside the job. A page change moves in place
// (replace), so one Back leaves the job for the list.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Icon, Pagination, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { openJob } from './route';
import { nearestShown } from './pipelineView';
import type { Job } from './types';

const LABEL = 'Jobs in the list';

export default function ApplyPager({
  job,
  list,
  order,
}: {
  job: Job;
  /** The jobs the filter shows, in order. */
  list: Job[];
  /** Every job in the same sort, with no filter: where a hidden job sits between shown ones. */
  order?: Job[];
}) {
  const at = list.findIndex((j) => j.url === job.url);
  // A job the list's filter or search hides has no place in the walk: its arrows go to the nearest
  // shown job on each side (#510 review), never a dead end.
  if (at < 0) return <OutsidePager job={job} list={list} order={order ?? list} />;
  if (list.length < 2) return <OnlyPage />;
  return (
    <Pagination
      variant="compact"
      label={LABEL}
      page={at + 1}
      count={list.length}
      onPageChange={(p) => openJob(jobIdOf(list[p - 1].url), true)}
    />
  );
}

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;

/** A job the filter hides: "Not in this filter" (said as it appears) between arrows that step to
 *  the nearest shown job on each side. */
function OutsidePager({ job, list, order }: { job: Job; list: Job[]; order: Job[] }) {
  const { prev, next } = nearestShown(job, list, order);
  const go = (j?: Job) => j && openJob(jobIdOf(j.url), true);
  return (
    <nav aria-label={LABEL}>
      <Stack as="ul" direction="row" gap="px4" align="center" style={LIST}>
        <li>
          <Button
            iconOnly
            size="sm"
            variant="tertiary"
            label="Previous page"
            disabled={!prev}
            onClick={() => go(prev)}
            iconLeft={<Icon icon={ChevronLeft} size="small" />}
          />
        </li>
        <li>
          <Text variant="caption" as="span" tone="secondary" role="status">
            Not in this filter
          </Text>
        </li>
        <li>
          <Button
            iconOnly
            size="sm"
            variant="tertiary"
            label="Next page"
            disabled={!next}
            onClick={() => go(next)}
            iconLeft={<Icon icon={ChevronRight} size="small" />}
          />
        </li>
      </Stack>
    </nav>
  );
}

/** The compact pager for a walk of one: "1 of 1" with both arrows off. HDS Pagination draws nothing
 *  for a single page, and the top row would change shape when the last job is left (QA). Same
 *  parts as HDS's compact pager (tertiary sm icon buttons around the ui-size count). */
function OnlyPage() {
  return (
    <nav aria-label={LABEL}>
      <Stack as="ul" direction="row" gap="px4" align="center" style={LIST}>
        <li>
          <Button
            iconOnly
            size="sm"
            variant="tertiary"
            label="Previous page"
            disabled
            iconLeft={<Icon icon={ChevronLeft} size="small" />}
          />
        </li>
        <li>
          <Text variant="ui" as="span">
            1 of 1
          </Text>
        </li>
        <li>
          <Button
            iconOnly
            size="sm"
            variant="tertiary"
            label="Next page"
            disabled
            iconLeft={<Icon icon={ChevronRight} size="small" />}
          />
        </li>
      </Stack>
    </nav>
  );
}

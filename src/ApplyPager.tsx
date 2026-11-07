// The phone's walk through the Apply list (#471): "‹ 2 of N ›" over the jobs the list shows, in
// its order. Below lg only: at lg the list sits beside the job. A page change moves in place
// (replace), so one Back leaves the job for the list.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Icon, Pagination, Stack, Text } from '@hirobius/design-system';
import { jobIdOf } from './store';
import { openJob } from './route';
import type { Job } from './types';

const LABEL = 'Jobs in the list';

export default function ApplyPager({ job, list }: { job: Job; list: Job[] }) {
  const at = list.findIndex((j) => j.url === job.url);
  // A job the list's filter or search hides has no place in the walk.
  if (at < 0) return null;
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

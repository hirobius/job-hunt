// Apply's Passed view (Adrian 2026-11-13; rules in passed.ts): the passed jobs as the shared rows,
// each with Delete (to Recently removed, with Undo), then the postings skipped in Find, each with
// Save (a job, like Review's Save), Undo skip (back in Find) and Delete (off this list for good,
// still never back in Find). Shared by the lg list column and the phone's All jobs sheet.
import { Box, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import JobRowList from './JobRowList';
import { ItemList, ItemRow } from './PipelinePanel';
import { decided } from './decided';
import {
  deletePassedJob,
  deleteSkipped,
  saveSkipped,
  skippedPostings,
  skippedTitle,
  undoSkip,
} from './passed';
import type { Job } from './types';

export default function PassedList({
  jobs,
  openId,
  onPick,
}: {
  /** The passed jobs, in the list's order (pipelineView `visibleJobs`). */
  jobs: Job[];
  openId?: string;
  onPick: (job: Job) => void;
}) {
  const skipped = skippedPostings(decided.use().values());
  if (jobs.length === 0 && skipped.length === 0)
    return (
      <Text variant="ui" as="p" tone="secondary">
        Nothing passed yet.
      </Text>
    );
  return (
    <Stack gap="normal">
      {jobs.length > 0 && (
        <JobRowList
          jobs={jobs}
          openId={openId}
          onPick={onPick}
          keys={(j) => (
            <Button
              variant="tertiary"
              size="sm"
              label={`Delete ${j.label || 'job'}`}
              onClick={() => deletePassedJob(j)}
            >
              Delete
            </Button>
          )}
        />
      )}
      {skipped.length > 0 && (
        <Stack gap="tight" as="section" aria-label="Skipped in Find">
          <Text variant="body" as="h3" className="rjb-semibold">
            Skipped in Find
          </Text>
          <ItemList inset="none" label="Skipped postings">
            {skipped.map((d) => {
              const title = skippedTitle(d);
              return (
                <ItemRow key={d.fingerprint} label={title}>
                  <Stack gap="px4">
                    {d.url ? (
                      <InlineLink href={d.url} size="sm">
                        {title}
                      </InlineLink>
                    ) : (
                      <Text variant="ui" as="p" className="rjb-semibold">
                        {title}
                      </Text>
                    )}
                    {d.company && (
                      <Text variant="caption" as="p" tone="secondary">
                        {d.company}
                      </Text>
                    )}
                    <Box>
                      <Stack direction="row" wrap="wrap" gap="px8" align="center">
                        {d.url && (
                          <Button
                            variant="secondary"
                            size="sm"
                            label={`Save ${title}`}
                            onClick={() => saveSkipped(d)}
                          >
                            Save
                          </Button>
                        )}
                        <Button
                          variant="tertiary"
                          size="sm"
                          label={`Undo skip of ${title}`}
                          onClick={() => undoSkip(d)}
                        >
                          Undo skip
                        </Button>
                        <Button
                          variant="tertiary"
                          size="sm"
                          label={`Delete ${title}`}
                          onClick={() => deleteSkipped(d)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Box>
                  </Stack>
                </ItemRow>
              );
            })}
          </ItemList>
        </Stack>
      )}
    </Stack>
  );
}

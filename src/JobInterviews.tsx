// The job page's Interviews tab (#130): who the contact is, and the interview and call log with
// its .ics export, in one panel.
import { Stack, Text } from '@hirobius/design-system';
import InterviewLog from './InterviewLog';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';

export default function JobInterviews({ job }: { job: Job }) {
  const n = job.events?.length ?? 0;
  return (
    <Panel
      label="Interviews and calls"
      title="Interviews and calls"
      count={n}
      countLabel={`${n} booked`}
    >
      <PanelBody>
        <Stack gap="normal">
          {job.contact && (
            <Text variant="ui" as="p">
              <Text variant="ui" as="span" tone="secondary">
                Contact:{' '}
              </Text>
              {job.contact}
            </Text>
          )}
          {n === 0 && (
            <Text variant="caption" as="p" tone="secondary">
              No interviews or calls yet. Add the date when one is booked and export it to your
              calendar.
            </Text>
          )}
          <InterviewLog job={job} />
        </Stack>
      </PanelBody>
    </Panel>
  );
}

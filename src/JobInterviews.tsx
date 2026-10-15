// The job page's Interviews tab (#130): who the contact is, and the interview and call log with
// its .ics export.
import { Stack, Text } from '@hirobius/design-system';
import InterviewLog from './InterviewLog';
import type { Job } from './types';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

export default function JobInterviews({ job }: { job: Job }) {
  return (
    <Stack gap="normal">
      {job.contact && (
        <Text variant="ui" as="p" style={{ margin: 0 }}>
          <span style={SECONDARY}>Contact: </span>
          {job.contact}
        </Text>
      )}
      {!job.events?.length && (
        <Text variant="ui" as="p" style={{ ...SECONDARY, margin: 0 }}>
          No interviews or calls yet. Add the date when one is booked and export it to your
          calendar.
        </Text>
      )}
      <InterviewLog job={job} />
    </Stack>
  );
}

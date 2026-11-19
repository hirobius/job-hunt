// The demo's note (#835): on Review and on Apply, so a way out of the demo is on every screen.
import { Alert, Stack } from '@hirobius/design-system';
import { ExitButton } from '../hds-gaps/ExitButton';
import { leaveDemo } from './demoMode';

export default function DemoNote() {
  return (
    <Alert tone="info" title="This is a demo">
      <Stack gap="px8" align="start">
        <span>
          Sample postings and jobs from fictional companies. Nothing is saved, and your own data is
          not touched.
        </span>
        <ExitButton onClick={() => leaveDemo()}>Leave demo</ExitButton>
      </Stack>
    </Alert>
  );
}

// The job page's final copies (#231, epic #225): the PDF/Word files that actually went out for this
// Job (download back, remove unless Sent) above a collapsed upload form. Shown at the foot of the
// Documents tab through JobDocuments' `uploadSlot`.
import { Disclosure, Stack, Text } from '@hirobius/design-system';
import { FinalCopies, UploadFinalCopy } from './UploadFinalCopy';

export default function JobFinalCopies({ jobUrl }: { jobUrl: string }) {
  return (
    <section aria-labelledby="job-final-copies">
      <Stack gap="tight">
        <Text variant="body" as="h3" id="job-final-copies" className="rjb-semibold">
          Final copies
        </Text>
        <FinalCopies jobUrl={jobUrl} />
        <Disclosure label="Upload a final copy" variant="nav">
          <UploadFinalCopy jobUrl={jobUrl} heading={false} />
        </Disclosure>
      </Stack>
    </section>
  );
}

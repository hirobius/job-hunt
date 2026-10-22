// The job page's Screening tab (#130; rev-3 mock): one Fit panel with the editor's chip rows (fit,
// work mode, dealbreakers, angle), and the paste-a-JD screener as a second panel, closed by default;
// Screen with AI (the user's own model, behind AI_SCREENING) is a third, also closed.
import { ScreeningEditor } from './ScreeningEditor';
import JdScreenPanel from './JdScreenPanel';
import AiScreenPanel from './AiScreenPanel';
import { AI_SCREENING } from './ai/flag';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';
import { Stack, Text } from '@hirobius/design-system';

export default function JobScreening({ job }: { job: Job }) {
  const screened = job.screenedAt ? new Date(job.screenedAt).toLocaleDateString() : '';
  return (
    // Panels 24 apart, as on the Pipeline (rev-3).
    <Stack gap="px24">
      <Panel label="Fit" title="Fit">
        <PanelBody>
          <Stack gap="normal">
            {screened ? (
              <Text variant="caption" as="p" tone="secondary">
                {`Screened ${screened}`}
              </Text>
            ) : (
              !(job.verdict || job.mode || job.blockers?.length) && (
                <Text variant="caption" as="p" tone="secondary">
                  Not screened yet. Screen the job description below, or set the fit yourself.
                </Text>
              )
            )}
            <ScreeningEditor job={job} fitLabel={false} />
          </Stack>
        </PanelBody>
      </Panel>
      <JdScreenPanel job={job} />
      {/* Bring-your-own-model screening, opt in and behind its flag (src/ai/). */}
      {AI_SCREENING && <AiScreenPanel job={job} />}
    </Stack>
  );
}

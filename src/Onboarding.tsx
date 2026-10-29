import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Input as HdsInput,
  Progress,
  Spinner,
  Stack,
  Text,
  Toggle,
} from '@hirobius/design-system';
import { Form } from '@hirobius/design-system/patterns';
import { Panel, PanelBody, PanelRow } from './PipelinePanel';
import { ChipEditor } from './ChipEditor';
import { TrySampleButton } from './demo/SampleData';
import { hasCloudSession } from './demo/loadSample';
import { useCloudSync } from './account/accountContext';
import { finishSetup, NEW_PROFILE, type ProfileDraft } from './searchDefaults';
import { showNotice } from './saveNotice';
import { navigate } from './route';

// The first run is the Search profile form (simplify 7/11, #388). Two short steps in one narrow
// column: the job titles (the design-system ones prefilled), then where (remote only by default,
// Adrian 2026-10-28) and the words to leave out (optional). Nothing is written until Finish, which
// saves the profile, follows the starter design-system companies (searchDefaults.ts, the seed
// list) and opens Today, whose Review new is the Browse list. Back is on the second step, and the
// primary is never shown disabled (rev-3): pressing Continue with no title says why instead. On a
// first run it also offers the sample pipeline (#107), which stays opt-in.
const STEPS = 2;

const TITLE_ERROR = 'Add at least one job title.';

export function TitlesField({
  titles,
  onChange,
  error,
}: {
  titles: string[];
  onChange: (titles: string[]) => void;
  error?: boolean;
}) {
  return (
    <Stack gap="px8">
      <ChipEditor label="Job titles" placeholder="Job title" values={titles} onChange={onChange} />
      <Text variant="caption" as="p" tone="secondary">
        Every board and feed is searched for each title. A posting is listed when its title names a
        design system role.
      </Text>
      {error && (
        <Text variant="caption" as="p" role="alert" tone="danger">
          {TITLE_ERROR}
        </Text>
      )}
    </Stack>
  );
}

export function WhereFields({
  draft,
  onChange,
}: {
  draft: ProfileDraft;
  onChange: (change: Partial<ProfileDraft>) => void;
}) {
  return (
    <Stack gap="normal">
      <Stack gap="px8">
        <Toggle
          label="Remote only"
          checked={draft.remoteOnly}
          onChange={(on) => onChange({ remoteOnly: on })}
        />
        <Text variant="caption" as="p" tone="secondary">
          {draft.remoteOnly
            ? 'On-site and hybrid roles are counted, not listed.'
            : 'Remote, hybrid and on-site roles are all listed.'}
        </Text>
      </Stack>
      {!draft.remoteOnly && (
        <HdsInput
          label="City, state or region"
          placeholder="City, state or region"
          helperText="Optional. Leave it blank to search anywhere."
          value={draft.location}
          onChange={(e) => onChange({ location: e.target.value })}
        />
      )}
      <Stack gap="px8">
        <ChipEditor
          label="Leave out (optional)"
          placeholder="Word to leave out"
          values={draft.leaveOut}
          onChange={(leaveOut) => onChange({ leaveOut })}
        />
        <Text variant="caption" as="p" tone="secondary">
          A posting that says one of these words is hidden.
        </Text>
      </Stack>
    </Stack>
  );
}

export function Onboarding({ offerSample = false }: { offerSample?: boolean }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProfileDraft>(NEW_PROFILE);
  const [titleError, setTitleError] = useState(false);
  const { settled } = useCloudSync();
  const change = (c: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...c }));
  // The step's panel: a step change focuses its heading, a refused Continue focuses the field.
  const panel = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    // Only a step change moves focus (the panel swaps under the button). Compared with the step
    // last shown, not a "mounted" flag: StrictMode runs this twice on mount.
    if (shownStep.current === step) return;
    shownStep.current = step;
    const heading = panel.current?.querySelector<HTMLElement>('h3');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [step]);

  // A signed-in pull may be about to restore this user's profile: don't offer to set one up over it.
  if (hasCloudSession() && !settled)
    return (
      <Box sx={{ p: 12 }}>
        <Stack direction="row" gap="normal" align="center" justify="center">
          <Spinner size="sm" />
          <Text variant="body">Restoring your search…</Text>
        </Stack>
      </Box>
    );

  const finish = () => {
    const followed = finishSetup(draft);
    navigate({ tab: 'today' });
    showNotice({
      title: 'Your search is set up',
      description: followed
        ? `Following ${followed} design-system companies. Their jobs show in Review new.`
        : 'Its jobs show in Review new.',
      tone: 'success',
      actions: [],
    });
  };
  const lastStep = step === STEPS;
  const heading = ['What roles do you want?', 'Where, and what to leave out'][step - 1];
  return (
    // rev-3 mock: the title and "Step N of 2" over the progress bar, then one panel per step whose
    // footer holds Back (not on step 1) and the one primary, then "Just looking?". No top padding:
    // the shell's 24 gap under the tabs sets the rhythm, like every other page.
    <Box sx={{ maxWidth: 560, mx: 'auto', pb: 'md' }}>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.titles.length) {
            setStep(1);
            setTitleError(true);
            panel.current?.querySelector<HTMLInputElement>('input')?.focus();
          } else if (lastStep) finish();
          else setStep(step + 1);
        }}
        noValidate
      >
        <Stack gap="normal">
          <Stack gap="tight">
            <Stack gap="px4">
              <Text variant="title" as="h2">
                Set up your search
              </Text>
              <Text variant="caption" as="p" tone="secondary">
                Step {step} of {STEPS}
              </Text>
            </Stack>
            <Progress value={step} max={STEPS} label={`Step ${step} of ${STEPS}`} />
          </Stack>
          <Box ref={panel}>
            <Panel label={heading} title={heading}>
              <PanelBody>
                {step === 1 ? (
                  <TitlesField
                    titles={draft.titles}
                    onChange={(titles) => {
                      setTitleError(false);
                      change({ titles });
                    }}
                    error={titleError && !draft.titles.length}
                  />
                ) : (
                  <WhereFields draft={draft} onChange={change} />
                )}
              </PanelBody>
              <PanelRow as="div">
                <Stack direction="row" justify="space-between" align="center">
                  {step > 1 ? (
                    <Button type="button" variant="tertiary" onClick={() => setStep(step - 1)}>
                      Back
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button type="submit" variant="primary">
                    {lastStep ? 'Finish' : 'Continue'}
                  </Button>
                </Stack>
              </PanelRow>
            </Panel>
          </Box>
          {/* Never offered signed in (a signed-in tracker syncs), so neither is its caption. */}
          {step === 1 && offerSample && !hasCloudSession() && (
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              <Text variant="caption" as="span" tone="secondary">
                Just looking?
              </Text>
              {/* Caption-sized, like the words before it (the link inherits the font). */}
              <Text variant="caption" as="span">
                <TrySampleButton link />
              </Text>
            </Stack>
          )}
        </Stack>
      </Form>
    </Box>
  );
}

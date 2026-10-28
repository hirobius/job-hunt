import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Input as HdsInput,
  Progress,
  Spinner,
  Box,
  Stack,
  Text,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { Form } from '@hirobius/design-system/patterns';
import { Panel, PanelBody, PanelRow, PanelRows } from './PipelinePanel';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';
import { useCurationSyncStatus } from './curation/syncStatus';
import { TrySampleButton } from './demo/SampleData';
import { hasCloudSession } from './demo/loadSample';
import { addJob, findJobByUrl } from './store';
import { navigate } from './route';

// The guided first run (#132; started as #59 / B1, decision D1). The shell's gate (App.tsx, #128)
// shows it on Companies for a first run and, behind "Choose a track", on Discover with no tracks.
// Three short steps in one narrow column: pick a track, say where you want to work, add a first
// job. Back and Skip are on every step (at the last, Skip reads "I'll do it later"). Nothing is
// written until the end: Finish (or the last Skip) seeds the picked packs (fork-on-pick) with the
// location and saves the job if one was given. Skipping everything seeds nothing, so the gate
// stays and the steps start over. Every pack starts unticked, the Suggested one too (Adrian
// 2026-10-22), and Continue is never shown disabled (rev-3): pressing it with nothing ready says why instead. On a first run it also offers the sample pipeline (#107), which ends
// the first run by filling the Pipeline. Step state is component state only.
const STEPS = 3;

export function Onboarding({ offerSample = false }: { offerSample?: boolean }) {
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickError, setPickError] = useState(false);
  // Each refused Continue, so the track list takes focus again even when the alert already shows.
  const [pickAttempt, setPickAttempt] = useState(0);
  const [firstTitle, setFirstTitle] = useState('');
  const [location, setLocation] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobError, setJobError] = useState('');
  const syncStatus = useCurationSyncStatus();
  // The step's panel: a step change focuses its heading, a refused link focuses the field.
  const panel = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    // Not on the first visit: only a step change moves focus (the panel swaps under the button).
    // Compared with the step last shown, not a "mounted" flag: StrictMode runs this twice on mount.
    if (shownStep.current === step) return;
    shownStep.current = step;
    const heading = panel.current?.querySelector<HTMLElement>('h3');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [step]);
  const toggle = (id: string) => {
    setPickError(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  // "Build your own" starts empty, so it needs one title to search for anything (#59).
  const needsTitle = picked.includes('blank');
  const ready = picked.length > 0 && (!needsTitle || firstTitle.trim() !== '');

  const reset = () => {
    setStep(1);
    setPicked([]);
    setPickError(false);
    setFirstTitle('');
    setLocation('');
    setJobUrl('');
    setJobError('');
  };
  // Seed what was picked, save the job if given, then go home (Companies, which hosts the first-run gate) or stay.
  const finish = (withJob: boolean) => {
    const url = withJob ? jobUrl.trim() : '';
    if (url) {
      addJob(url);
      if (!findJobByUrl(url)) {
        panel.current?.querySelector<HTMLInputElement>('input[type="url"]')?.focus();
        return setJobError("That doesn't look like a link. Paste the job's web address.");
      }
    }
    picked.forEach((id) =>
      seedPack(id, location, id === 'blank' ? { titles: [firstTitle.trim()] } : undefined),
    );
    // Nothing picked and no job: the gate is still up, so start the steps over instead of idling.
    if (picked.length === 0 && !url) return reset();
    if (offerSample) navigate({ tab: 'discover' });
  };

  // A signed-in pull may be about to restore this user's tracks — don't offer to re-onboard
  // over it (that wrote duplicate tracks). The status always settles within a few seconds.
  if (syncStatus === 'syncing')
    return (
      <Box sx={{ p: 12 }}>
        <Stack direction="row" gap="normal" align="center" justify="center">
          <Spinner size="sm" />
          <Text variant="body">Restoring your tracks…</Text>
        </Stack>
      </Box>
    );

  const lastStep = step === STEPS;
  const next = () => setStep((s) => s + 1);
  // Skip on step 1 skips picking a track, so nothing ticked there is seeded behind it.
  const skip = () => {
    if (lastStep) return finish(false);
    if (step === 1) {
      setPicked([]);
      setPickError(false);
    }
    next();
  };
  const heading = ['Pick a track', 'Where do you want to work?', 'Add your first job'][step - 1];
  return (
    // rev-3 mock: the title and "Step N of 3" over the progress bar, then one panel per step
    // whose footer holds Back (not on step 1), Skip and the one primary, then "Just looking?".
    // No top padding: the shell's 24 gap under the tabs sets the rhythm, like every other page.
    <Box sx={{ maxWidth: 560, mx: 'auto', pb: 'md' }}>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          if (lastStep) finish(true);
          else if (step > 1 || ready) next();
          else {
            setPickError(true);
            setPickAttempt((n) => n + 1);
          }
        }}
        noValidate
      >
        <Stack gap="normal">
          <Stack gap="tight">
            <Stack gap="px4">
              <Text variant="title" as="h2">
                Set up your board
              </Text>
              <Text variant="caption" as="p" tone="secondary">
                Step {step} of {STEPS}
              </Text>
            </Stack>
            <Progress value={step} max={STEPS} label={`Step ${step} of ${STEPS}`} />
          </Stack>
          <Box ref={panel}>
            <Panel label={heading} title={heading}>
              {step === 1 ? (
                <PickTrack
                  picked={picked}
                  onToggle={toggle}
                  firstTitle={firstTitle}
                  onFirstTitle={setFirstTitle}
                  showError={pickError}
                  attempt={pickAttempt}
                />
              ) : (
                <PanelBody>
                  {step === 2 ? (
                    <HdsInput
                      label="City, state or Remote"
                      placeholder="City, state or Remote"
                      helperText="Leave it blank to search anywhere. Work mode is set later in Companies."
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  ) : (
                    <HdsInput
                      label="Job link"
                      type="url"
                      placeholder="Job link"
                      helperText="Optional. It lands in your Pipeline."
                      value={jobUrl}
                      onChange={(e) => {
                        setJobUrl(e.target.value);
                        setJobError('');
                      }}
                      error={!!jobError}
                      errorMessage={jobError}
                    />
                  )}
                </PanelBody>
              )}
              {/* rev-3: Skip (step 1) or Back on the left edge; Skip and the one primary on the right.
                The primary is never shown disabled. */}
              <PanelRow as="div">
                <Stack direction="row" justify="space-between" align="center">
                  {step === 1 ? (
                    <Button type="button" variant="tertiary" onClick={skip}>
                      Skip
                    </Button>
                  ) : (
                    <Button type="button" variant="tertiary" onClick={() => setStep(step - 1)}>
                      Back
                    </Button>
                  )}
                  <Stack direction="row" gap="tight" align="center">
                    {step > 1 && (
                      <Button type="button" variant="secondary" onClick={skip}>
                        {lastStep ? "I'll do it later" : 'Skip'}
                      </Button>
                    )}
                    <Button type="submit" variant="primary">
                      {lastStep ? 'Finish' : 'Continue'}
                    </Button>
                  </Stack>
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

const PICK_ERROR_ID = 'onboarding-pick-error';

function PickTrack({
  picked,
  onToggle,
  firstTitle,
  onFirstTitle,
  showError,
  attempt,
}: {
  picked: string[];
  onToggle: (id: string) => void;
  firstTitle: string;
  onFirstTitle: (v: string) => void;
  /** Continue was pressed with nothing ready: say why (the primary is never disabled). */
  showError: boolean;
  /** Counts refused Continues: each one moves focus to the first track when none is picked, else
   *  to the missing first title. */
  attempt: number;
}) {
  const needsTitle = picked.includes('blank');
  const noPick = showError && picked.length === 0;
  // Box types its ref as a div; it is the fieldset, only queried.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!attempt) return;
    if (picked.length === 0)
      list.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    else if (needsTitle && firstTitle.trim() === '')
      list.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus();
    // Only a refused Continue moves focus, not a tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return (
    // rev-3 mock: one panel of hairline checkbox rows (no card in a card), each pack's blurb
    // lined up under its label, past the box.
    <Box
      as="fieldset"
      ref={list}
      aria-label="Starter tracks"
      aria-describedby={noPick ? PICK_ERROR_ID : undefined}
      sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
    >
      <PanelRows>
        {STARTER_PACKS.map((p, i) => (
          <PanelRow key={p.id} dense>
            {/* The smallest gap: the Checkbox row is already 44px tall on a phone. */}
            <Stack gap="xs">
              <Stack direction="row" gap="tight" align="center" wrap="wrap">
                <Checkbox
                  label={p.label}
                  checked={picked.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                  aria-describedby={`pack-${p.id}-blurb`}
                />
                {/* The lead pack (#59): the list follows STARTER_PACKS order, consulting first. */}
                {i === 0 && <Badge tone="neutral">Suggested</Badge>}
              </Stack>
              {/* Pulled up into the 44px row's slack so it sits ~4px under the label (rev-3). */}
              <Box
                sx={{
                  pl: 'var(--primitive-space-6)',
                  mt: 'calc(-1 * var(--primitive-space-2))',
                  pb: 'xs',
                }}
              >
                <Text variant="caption" as="p" tone="secondary" id={`pack-${p.id}-blurb`}>
                  {p.blurb}
                </Text>
              </Box>
            </Stack>
          </PanelRow>
        ))}
      </PanelRows>
      {needsTitle && (
        <PanelRow as="div">
          <Box sx={{ display: 'contents', '& input': { maxWidth: 320 } }}>
            <HdsInput
              label="First job title for your own track"
              required
              placeholder="Job title"
              value={firstTitle}
              onChange={(e) => onFirstTitle(e.target.value)}
              error={showError && firstTitle.trim() === ''}
              errorMessage="Add a first job title for your own track."
            />
          </Box>
        </PanelRow>
      )}
      {noPick && (
        <PanelRow as="div">
          <Text variant="caption" as="p" role="alert" tone="danger" id={PICK_ERROR_ID}>
            Pick at least one track
          </Text>
        </PanelRow>
      )}
    </Box>
  );
}

/** Discover with no track (#132): says what a track is and opens the setup on one click, instead
 *  of dropping a stranger straight into the picker. */
export function ChooseTrack() {
  const [open, setOpen] = useState(false);
  if (open) return <Onboarding />;
  return (
    // rev-3 mock: the page's title over the centred teaching empty, framed (like the Pipeline's).
    // No top padding: the title sits at tabs + 24 (the shell's gap), like Pipeline and Documents.
    <Box sx={{ pb: 'md' }}>
      <Stack gap="normal">
        <Text variant="title" as="h2">
          Companies
        </Text>
        <EmptyState
          framed
          icon={Search}
          title="Pick a track to search"
          description="A track holds your job titles, location and saved links."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              Choose a track
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}

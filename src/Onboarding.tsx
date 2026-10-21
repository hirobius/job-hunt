import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  Badge,
  Button,
  Input as HdsInput,
  Progress,
  Spinner,
  Box,
  Stack,
  Text,
  Card,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { Form } from '@hirobius/design-system/patterns';
import { Panel, PanelBody, PanelRow } from './PipelinePanel';
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
// stays and the steps start over. On a first run it also offers the sample pipeline (#107), which ends
// the first run by filling the Pipeline. Step state is component state only.
const STEPS = 3;

export function Onboarding({ offerSample = false }: { offerSample?: boolean }) {
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [firstTitle, setFirstTitle] = useState('');
  const [location, setLocation] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobError, setJobError] = useState('');
  const syncStatus = useCurationSyncStatus();
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  // "Build your own" starts empty, so it needs one title to search for anything (#59).
  const needsTitle = picked.includes('blank');
  const ready = picked.length > 0 && (!needsTitle || firstTitle.trim() !== '');

  const reset = () => {
    setStep(1);
    setPicked([]);
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
      if (!findJobByUrl(url))
        return setJobError("That doesn't look like a link. Paste the job's web address.");
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

  const next = () => setStep((s) => s + 1);
  const lastStep = step === STEPS;
  const heading = ['Pick a track', 'Where do you want to work?', 'Add your first job'][step - 1];
  return (
    // rev-3 mock: the title and "Step N of 3" over the progress bar, then one panel per step
    // whose footer holds Back (not on step 1), Skip and the one primary, then "Just looking?".
    <Box sx={{ maxWidth: 560, mx: 'auto', py: 'md' }}>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          if (lastStep) finish(true);
          else if (step > 1 || ready) next();
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
          <Panel label={heading} title={heading}>
            <PanelBody>
              {step === 1 && (
                <PickTrack
                  picked={picked}
                  onToggle={toggle}
                  firstTitle={firstTitle}
                  onFirstTitle={setFirstTitle}
                />
              )}
              {step === 2 && (
                <HdsInput
                  aria-label="Location"
                  placeholder="City, state or Remote"
                  helperText="Leave it blank to search anywhere. Work mode is set later in Companies."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              )}
              {step === 3 && (
                <HdsInput
                  aria-label="Job link"
                  type="url"
                  placeholder="Paste a job link"
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
            <PanelRow as="div">
              <Stack direction="row" gap="tight" align="center">
                {step > 1 && (
                  <Button type="button" variant="tertiary" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  variant={step === 1 ? 'tertiary' : 'secondary'}
                  onClick={() => (lastStep ? finish(false) : next())}
                >
                  {lastStep ? "I'll do it later" : 'Skip'}
                </Button>
                {lastStep ? (
                  <Button type="submit" variant="primary">
                    Finish
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" disabled={step === 1 && !ready}>
                    Continue
                  </Button>
                )}
              </Stack>
            </PanelRow>
          </Panel>
          {/* Never offered signed in (a signed-in tracker syncs), so neither is its caption. */}
          {step === 1 && offerSample && !hasCloudSession() && (
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              <Text variant="caption" as="span" tone="secondary">
                Just looking?
              </Text>
              <TrySampleButton />
            </Stack>
          )}
        </Stack>
      </Form>
    </Box>
  );
}

function PickTrack({
  picked,
  onToggle,
  firstTitle,
  onFirstTitle,
}: {
  picked: string[];
  onToggle: (id: string) => void;
  firstTitle: string;
  onFirstTitle: (v: string) => void;
}) {
  return (
    <Stack gap="tight">
      <Text variant="caption" as="p" tone="secondary">
        One or more. Each fills in search terms and a few links; edit them any time.
      </Text>
      <div role="group" aria-label="Starter tracks">
        <Stack gap="tight">
          {STARTER_PACKS.map((p, i) => {
            const on = picked.includes(p.id);
            return (
              // HDS selectable Card = one checkbox-like option (role=checkbox, aria-checked), named
              // by its pack and described by its blurb — keyboard + screen-reader operable (#104).
              <Card
                key={p.id}
                bordered
                selectable
                selected={on}
                onSelectedChange={() => onToggle(p.id)}
                aria-labelledby={`pack-${p.id}`}
                aria-describedby={`pack-${p.id}-blurb`}
                // HDS 0.24 marks a selected Card with a ring only (no fill), so the theme's own text
                // colour reads in both themes. (A pinned dark colour from the old accent fill went
                // black-on-black in dark mode, #129.)
                style={{ textAlign: 'left' }}
              >
                <Stack direction="row" gap="tight" align="center">
                  <Text variant="ui" as="span" id={`pack-${p.id}`} className="rjb-semibold">
                    {p.label}
                  </Text>
                  {/* The lead pack (#59): the grid follows STARTER_PACKS order, consulting first. */}
                  {i === 0 && <Badge tone="neutral">Suggested</Badge>}
                </Stack>
                <Text variant="caption" as="div" tone="secondary" id={`pack-${p.id}-blurb`}>
                  {p.blurb}
                </Text>
              </Card>
            );
          })}
        </Stack>
      </div>
      {picked.includes('blank') && (
        <Box sx={{ display: 'contents', '& input': { maxWidth: 320 } }}>
          <HdsInput
            label="First job title for your own track"
            required
            placeholder="e.g. Design Engineer"
            value={firstTitle}
            onChange={(e) => onFirstTitle(e.target.value)}
          />
        </Box>
      )}
    </Stack>
  );
}

/** Discover with no track (#132): says what a track is and opens the setup on one click, instead
 *  of dropping a stranger straight into the picker. */
export function ChooseTrack() {
  const [open, setOpen] = useState(false);
  if (open) return <Onboarding />;
  return (
    // rev-3 mock: the page's title over one bordered empty state.
    <Box sx={{ py: 'md' }}>
      <Stack gap="normal">
        <Text variant="title" as="h2">
          Companies
        </Text>
        <Card bordered>
          <EmptyState
            icon={Search}
            title="Pick a track to search"
            description="A track holds your job titles, location and saved links."
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                Choose a track
              </Button>
            }
          />
        </Card>
      </Stack>
    </Box>
  );
}

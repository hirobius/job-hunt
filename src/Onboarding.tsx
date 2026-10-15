import { useState } from 'react';
import {
  Button,
  Input as HdsInput,
  Spinner,
  Box,
  Stack,
  Text,
  Card,
} from '@hirobius/design-system';
import EmptyState from './EmptyState';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';
import { useCurationSyncStatus } from './curation/syncStatus';
import { TrySampleButton } from './demo/SampleData';
import { hasCloudSession } from './demo/loadSample';

// First-run onboarding (issue #59 / B1, decision D1): the shell's gate (App.tsx, #128) routes here
// from Discover with no tracks, and from Today on a first run. Pick one or more starter packs + an
// optional location → seed them into the store (fork-on-pick) → the view takes over. On Today it
// also offers the sample pipeline, so a visitor can see the app working in one click (#107).
// Minimal by design; the guided first run is #132.
export function Onboarding({ offerSample = false }: { offerSample?: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const syncStatus = useCurationSyncStatus();
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const [firstTitle, setFirstTitle] = useState('');
  // "Build your own" starts empty, so it needs one title to search for anything (#59).
  const needsTitle = picked.includes('blank');
  const ready = picked.length > 0 && (!needsTitle || firstTitle.trim() !== '');
  const start = () =>
    picked.forEach((id) =>
      seedPack(id, location, id === 'blank' ? { titles: [firstTitle.trim()] } : undefined),
    );

  // A signed-in pull may be about to restore this user's tracks — don't offer to re-onboard
  // over it (that wrote duplicate tracks). The status always settles within a few seconds.
  if (syncStatus === 'syncing')
    return (
      <Stack
        direction="row"
        gap="normal"
        align="center"
        justify="center"
        style={{ padding: 'var(--primitive-space-12)' }}
      >
        <Spinner size="sm" />
        <Text variant="body">Restoring your tracks…</Text>
      </Stack>
    );

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', py: 'lg' }}>
      <Stack gap="tight">
        <Text variant="title" as="h2">
          Set up your board
        </Text>
        <Text variant="body" style={{ color: 'var(--semantic-color-content-secondary)' }}>
          Pick one or more tracks to start with — each pre-fills search terms and a few links. You
          can edit or add more later.
        </Text>
        {/* Up top, so a visitor sees it without scrolling past the packs (#154 review). Never
            offered signed in (a signed-in tracker syncs), so neither is its caption. */}
        {offerSample && !hasCloudSession() && (
          <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="start">
            <Text
              variant="caption"
              as="span"
              style={{ color: 'var(--semantic-color-content-secondary)' }}
            >
              Just looking?
            </Text>
            <TrySampleButton />
          </Stack>
        )}
        <Box>
          <Text
            variant="caption"
            as="span"
            style={{
              color: 'var(--semantic-color-content-secondary)',
              display: 'block',
              marginBottom: 'var(--primitive-space-1)',
            }}
          >
            Location (optional — blank = anywhere)
          </Text>
          <HdsInput
            size="sm"
            aria-label="Location"
            placeholder="City, State or Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </Box>
        <div role="group" aria-label="Starter tracks">
          <Stack gap="tight">
            {STARTER_PACKS.map((p) => {
              const on = picked.includes(p.id);
              return (
                // HDS selectable Card = one checkbox-like option (role=checkbox, aria-checked), named
                // by its pack and described by its blurb — keyboard + screen-reader operable (#104).
                <Card
                  key={p.id}
                  bordered
                  selectable
                  selected={on}
                  onSelectedChange={() => toggle(p.id)}
                  aria-labelledby={`pack-${p.id}`}
                  aria-describedby={`pack-${p.id}-blurb`}
                  // HDS 0.24 marks a selected Card with a ring only (no fill), so the theme's own text
                  // colour reads in both themes. (A pinned dark colour from the old accent fill went
                  // black-on-black in dark mode, #129.)
                  style={{ textAlign: 'left' }}
                >
                  <Text
                    variant="ui"
                    as="span"
                    id={`pack-${p.id}`}
                    style={{ display: 'block', fontWeight: 600, color: 'inherit' }}
                  >
                    {p.label}
                  </Text>
                  <Text
                    variant="caption"
                    as="span"
                    id={`pack-${p.id}-blurb`}
                    style={{ display: 'block', color: 'inherit', opacity: 0.8 }}
                  >
                    {p.blurb}
                  </Text>
                </Card>
              );
            })}
          </Stack>
        </div>
        {needsTitle && (
          <HdsInput
            size="sm"
            label="First job title for your own track"
            required
            placeholder="e.g. Design Engineer"
            value={firstTitle}
            onChange={(e) => setFirstTitle(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        )}
        <Button variant="primary" disabled={!ready} onClick={start}>
          {!picked.length
            ? 'Pick a track'
            : !ready
              ? 'Add a first job title'
              : `Start with ${picked.length} track${picked.length > 1 ? 's' : ''}`}
        </Button>
      </Stack>
    </Box>
  );
}

/** Discover with no track (#132): says what a track is and opens the setup on one click, instead
 *  of dropping a stranger straight into the picker. */
export function ChooseTrack() {
  const [open, setOpen] = useState(false);
  if (open) return <Onboarding />;
  return (
    <Box sx={{ py: 'lg' }}>
      <EmptyState
        title="Pick a track to search"
        message="A track holds your job titles, location and saved links."
        action={
          <Button variant="primary" onClick={() => setOpen(true)}>
            Choose a track
          </Button>
        }
      />
    </Box>
  );
}

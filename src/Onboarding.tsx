import { useState } from 'react';
import {
  Button,
  Input as HdsInput,
  Spinner,
  Card,
  Box,
  Stack,
  Text,
} from '@hirobius/design-system';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';
import { useCurationSyncStatus } from './curation/syncStatus';

// First-run onboarding (issue #59 / B1, decision D1): an empty curation store routes here before
// Discover renders. Pick one or more starter packs + an optional location → seed them into the
// store (fork-on-pick) → Discover takes over. Minimal by design; the fuller catalog polish is B5.
export function Onboarding() {
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
      <Stack direction="row" gap="normal" align="center" justify="center" style={{ padding: 48 }}>
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
                // HDS selectable Card = role="checkbox" with aria-checked (aria-checked), named
                // by its pack and described by its blurb — keyboard + screen-reader operable (#104).
                <Card
                  selectable
                  key={p.id}
                  selected={on}
                  onSelectedChange={() => toggle(p.id)}
                  aria-labelledby={`pack-${p.id}`}
                  aria-describedby={`pack-${p.id}-blurb`}
                  // The jade brand maps the selected fill to a light accent tint in BOTH themes, so
                  // pin dark text on it (HDS's text-foreground stays light in dark mode).
                  style={{
                    textAlign: 'left',
                    color: on ? 'var(--primitive-color-neutral-900)' : undefined,
                  }}
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

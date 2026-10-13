import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Input as HdsInput, Spinner, Card, Stack, Text } from '@hirobius/design-system';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';
import { useCurationSyncStatus } from './curation/syncStatus';

// First-run onboarding (issue #59 / B1, decision D1): an empty curation store routes here before
// Discover renders. Pick one or more starter packs + an optional location → seed them into the
// store (fork-on-pick) → Discover takes over. Order is the decision order: tracks first (required),
// then the optional location, then the start button.
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
      <Stack direction="row" gap="normal" align="center" justify="center" style={{ padding: 'var(--primitive-space-12)' }}>
        <Spinner size="sm" />
        <Text variant="body">Restoring your tracks…</Text>
      </Stack>
    );

  return (
    // Phone-first: one full-width column; from 640px a centred ~560px column. `margin-inline: auto`
    // is what centres it (HDS `sx` has no base breakpoint, so this is plain style).
    <div
      style={{
        maxWidth: 560,
        marginInline: 'auto',
        paddingBlock: 'var(--semantic-space-scale-lg)',
      }}
    >
      <Stack gap="normal">
        <Stack gap="tight">
          <Text variant="title" as="h2">
            Set up your board
          </Text>
          <Text variant="body" style={{ color: 'var(--semantic-color-content-secondary)' }}>
            Pick the tracks you want to search. Each one pre-fills search terms and a few links.
          </Text>
        </Stack>
        <div role="group" aria-label="Starter tracks">
          <Stack gap="px8">
            {STARTER_PACKS.map((p) => {
              const on = picked.includes(p.id);
              return (
                // HDS selectable Card = role="checkbox" with aria-checked, named by its pack and
                // described by its blurb — keyboard + screen-reader operable (#104).
                <Card
                  selectable
                  key={p.id}
                  selected={on}
                  onSelectedChange={() => toggle(p.id)}
                  aria-labelledby={`pack-${p.id}`}
                  aria-describedby={`pack-${p.id}-blurb`}
                  // Selected tint: a jade wash mixed into the raised surface, so the default text
                  // colour stays AA in both themes (no pinned text colour needed).
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    background: on
                      ? 'color-mix(in srgb, var(--semantic-accent-rest) 16%, var(--semantic-color-surface-raised))'
                      : undefined,
                  }}
                >
                  <Stack direction="row" gap="px12" align="center">
                    {/* Selected indicator: an empty ring when off, a filled accent circle + check when on. */}
                    <span
                      aria-hidden="true"
                      data-testid={`pack-${p.id}-indicator`}
                      data-selected={on}
                      style={{
                        flex: 'none',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                        border: `2px solid ${
                          on
                            ? 'var(--semantic-accent-rest)'
                            : 'var(--semantic-color-border-default)'
                        }`,
                        background: on ? 'var(--semantic-accent-rest)' : 'transparent',
                        color: 'var(--semantic-color-content-onAccent)',
                      }}
                    >
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
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
                    </div>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </div>
        {needsTitle && (
          <HdsInput
            label="First job title for your own track"
            required
            placeholder="e.g. Design Engineer"
            value={firstTitle}
            onChange={(e) => setFirstTitle(e.target.value)}
          />
        )}
        <HdsInput
          label="Location (optional, blank = anywhere)"
          placeholder="City, State or Remote"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Button
          variant="primary"
          style={{
            width: '100%',
            // HDS's disabled text (neutral-600 on near-black) is ~2.4:1; lift it to the secondary
            // content token (AA) while the muted fill still reads as disabled.
            color: ready ? undefined : 'var(--semantic-color-content-secondary)',
          }}
          disabled={!ready}
          onClick={start}
        >
          {!picked.length
            ? 'Pick a track'
            : !ready
              ? 'Add a first job title'
              : `Start with ${picked.length} track${picked.length > 1 ? 's' : ''}`}
        </Button>
      </Stack>
    </div>
  );
}

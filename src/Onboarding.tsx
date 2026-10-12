import { useState } from 'react';
import { Button, Input as HdsInput, Tag, Box, Stack, Text, Card } from '@hirobius/design-system';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';

// First-run onboarding (issue #59 / B1, decision D1): an empty curation store routes here before
// Discover renders. Pick one or more starter packs + an optional location → seed them into the
// store (fork-on-pick) → Discover takes over. Minimal by design; the fuller catalog polish is B5.
export function Onboarding() {
  const [picked, setPicked] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const start = () => picked.forEach((id) => seedPack(id, location));

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
        <Stack gap="gap">
          {STARTER_PACKS.map((p) => {
            const on = picked.includes(p.id);
            return (
              <Card
                key={p.id}
                as="button"
                bordered
                selected={on}
                aria-pressed={on}
                padding="none"
                onClick={() => toggle(p.id)}
                style={{ textAlign: 'left', cursor: 'pointer' }}
              >
                <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'center', p: 3 }}>
                  <Tag active={on}>{on ? '✓' : '+'}</Tag>
                  <Box sx={{ minWidth: 0 }}>
                    <Text variant="ui" as="span" style={{ display: 'block' }}>
                      {p.label}
                    </Text>
                    <Text
                      variant="caption"
                      as="span"
                      style={{ color: 'var(--semantic-color-content-secondary)' }}
                    >
                      {p.blurb}
                    </Text>
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Stack>
        <Button variant="primary" disabled={picked.length === 0} onClick={start}>
          {picked.length
            ? `Start with ${picked.length} track${picked.length > 1 ? 's' : ''}`
            : 'Pick a track'}
        </Button>
      </Stack>
    </Box>
  );
}

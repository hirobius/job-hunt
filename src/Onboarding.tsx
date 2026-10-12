import { useState } from 'react';
import { Box, Stack, Typography } from './ui/box';
import {
  Button,
  Input as HdsInput,
  Spinner,
  Stack as HdsStack,
  Tag,
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
  const start = () => picked.forEach((id) => seedPack(id, location));

  // A signed-in pull may be about to restore this user's tracks — don't offer to re-onboard
  // over it (that wrote duplicate tracks). The status always settles within a few seconds.
  if (syncStatus === 'syncing')
    return (
      <HdsStack
        direction="row"
        gap="normal"
        align="center"
        justify="center"
        style={{ padding: 48 }}
      >
        <Spinner size="sm" />
        <Text variant="body">Restoring your tracks…</Text>
      </HdsStack>
    );

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', py: 4 }}>
      <Stack spacing={2}>
        <Typography sx={{ fontSize: '1.4rem', fontWeight: 600 }}>Set up your board</Typography>
        <Typography color="text.secondary">
          Pick one or more tracks to start with — each pre-fills search terms and a few links. You
          can edit or add more later.
        </Typography>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Location (optional — blank = anywhere)
          </Typography>
          <HdsInput
            size="sm"
            aria-label="Location"
            placeholder="City, State or Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </Box>
        <Stack spacing={1}>
          {STARTER_PACKS.map((p) => {
            const on = picked.includes(p.id);
            return (
              <Box
                key={p.id}
                onClick={() => toggle(p.id)}
                sx={{
                  cursor: 'pointer',
                  border: 1,
                  borderColor: on ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  p: 1.5,
                  display: 'flex',
                  gap: 1.25,
                  alignItems: 'center',
                }}
              >
                <Tag active={on}>{on ? '✓' : '+'}</Tag>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>{p.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.blurb}
                  </Typography>
                </Box>
              </Box>
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

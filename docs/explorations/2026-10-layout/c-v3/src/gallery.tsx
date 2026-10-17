/* eslint-disable react-refresh/only-export-components -- exploration gallery, not app code; no fast refresh needed. */
// The C v3 gallery: every screen at its real width (iframes), labelled with the features it
// holds, then the placement map of all 86 inventory functions.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@hirobius/design-system/styles.css';
import '@hirobius/design-system/fonts.css';
import '../../../../../src/theme/base.css';
import { Badge, Box, Container, Stack, Table, Text } from '@hirobius/design-system';
import placement from '../placement.json';

type Feature = [string, string, string, string, string];
const features = placement.features as Feature[];
const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;
const tone = (s: string) => (s.startsWith('Works') ? (s.includes('unverified') ? 'warning' : 'success') : s === 'Off' ? 'neutral' : s === 'Partial' ? 'warning' : 'danger');

function Frame({ id, name, kind, w }: { id: string; name: string; kind: string; w: number }) {
  const held = features.filter((f) => f[3] === id || (id.endsWith('-dark') && f[3] === id.replace('-dark', '')));
  const scale = w > 400 ? 0.5 : 1;
  return (
    <Stack gap="tight" style={{ width: w * scale }}>
      <Stack gap="px4">
        <Text variant="ui" as="h2" className="rjb-semibold">{name}</Text>
        <Text variant="caption" style={SECONDARY}>{kind} · {w}px · {held.map((f) => f[0]).join(' ') || 'shown elsewhere'}</Text>
      </Stack>
      <Box sx={{ width: w * scale, height: 844 * scale, overflow: 'hidden', border: 'thin solid', borderColor: 'border.default', borderRadius: 'var(--primitive-radius-12)' }}>
        <iframe title={name} src={`./screen.html?s=${id}`} style={{ width: w, height: 844, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }} />
      </Box>
    </Stack>
  );
}

function Gallery() {
  const phone = placement.screens.filter((s) => s.w < 400);
  const desk = placement.screens.filter((s) => s.w >= 400);
  return (
    <Container maxWidth="max">
      <Stack gap="spacious" style={{ paddingBlock: 'var(--primitive-space-12)' }}>
        <Stack gap="tight">
          <Text variant="title" as="h1">C v3 · all features placed</Text>
          <Text variant="body" style={SECONDARY}>Direction C (search first, 2 tabs) with every one of the 86 inventory functions given a home. Built from the real HDS package (0.24.1). Claude, 2026-10-17.</Text>
        </Stack>
        <Stack direction="row" gap="spacious" wrap="wrap">{phone.map((s) => <Frame key={s.id} {...s} />)}</Stack>
        <Stack direction="row" gap="spacious" wrap="wrap">{desk.map((s) => <Frame key={s.id} {...s} />)}</Stack>
        <Table
          caption="Placement map"
          description="Every inventory function and where it lives in C v3."
          columns={[{ key: 'id', label: '#' }, { key: 'fn', label: 'Function' }, { key: 'st', label: 'Status' }, { key: 'where', label: 'Home' }, { key: 'how', label: 'How' }]}
          rows={features.map((f) => ({
            key: f[0],
            cells: [
              { slot: 'value', content: f[0] },
              { slot: 'label', content: f[1] },
              { slot: 'badge', content: <Badge tone={tone(f[2])}>{f[2]}</Badge> },
              { slot: 'description', content: f[3] === 'drop' ? 'Dropped' : placement.screens.find((s) => s.id === f[3])?.name },
              { slot: 'description', content: f[4] },
            ],
          }))}
        />
      </Stack>
    </Container>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Gallery />
  </React.StrictMode>,
);

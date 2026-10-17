/* eslint-disable react-refresh/only-export-components -- exploration gallery, not app code; no fast refresh needed. */
// Direction C shell: a small brand mark, the track button and Account in the app bar; two tabs
// (Companies · Pipeline) as the bottom bar on a phone and in the app bar on desktop.
import type { ReactNode } from 'react';
import { ChevronDown, CircleUser } from 'lucide-react';
import { Badge, Box, Button, Container, Icon, SegmentedControl, Stack, Tabs, TabsList, TabsTrigger, Text } from '@hirobius/design-system';
import { BRAND } from '../../../../../src/brand';
import { TRACK } from './data';

export const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

export type Tab = 'companies' | 'pipeline';

export function go(screen: string) {
  const u = new URL(window.location.href);
  u.searchParams.set('s', screen);
  window.location.href = u.toString();
}

function AccountButton() {
  return (
    <Box sx={{ position: 'relative' }}>
      <Button variant="tertiary" size="sm" iconOnly iconLeft={<Icon icon={CircleUser} />} label="Account (not synced)" onClick={() => go('account')} />
      <Box sx={{ position: 'absolute', top: 1, right: 1, pointerEvents: 'none' }}>
        <Badge tone="warning" dot label="Not synced" size="sm">{''}</Badge>
      </Box>
    </Box>
  );
}

function TrackButton() {
  return (
    <Button variant="tertiary" size="sm" iconRight={<Icon icon={ChevronDown} />} onClick={() => go('track')}>
      {TRACK.name}
    </Button>
  );
}

export function PhoneShell({ tab, children, bar }: { tab: Tab; children: ReactNode; bar?: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 'var(--semantic-space-region-gutter)', py: 'xs', borderBottom: 'thin solid', borderColor: 'border.default' }}>
        <Stack direction="row" align="center" justify="space-between" gap="tight">
          <Text variant="caption" className="rjb-semibold">{BRAND.name}</Text>
          <Stack direction="row" align="center" gap="tight">
            <TrackButton />
            <AccountButton />
          </Stack>
        </Stack>
      </Box>
      <Box sx={{ flex: '1 1 auto', px: 'var(--semantic-space-region-gutter)', py: 'md' }}>{children}</Box>
      {bar}
      <Box sx={{ position: 'sticky', bottom: 0, px: 'var(--semantic-space-region-gutter)', py: 'xs', bg: 'surface.page', borderTop: 'thin solid', borderColor: 'border.default' }}>
        <SegmentedControl
          fullWidth
          options={[
            { value: 'companies', label: 'Companies' },
            { value: 'pipeline', label: 'Pipeline' },
          ]}
          value={tab}
          onChange={(v) => go(v)}
        />
      </Box>
    </Box>
  );
}

export function DeskShell({ tab, children }: { tab: Tab; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Box sx={{ borderBottom: 'thin solid', borderColor: 'border.default' }}>
        <Container maxWidth="max">
          <Stack direction="row" align="center" justify="space-between" gap="normal" style={{ minHeight: 'var(--primitive-space-16)' }}>
            <Stack direction="row" align="center" gap="spacious">
              <Text variant="ui" className="rjb-semibold">{BRAND.name}</Text>
              <Tabs value={tab} onValueChange={(v) => go(v === 'companies' ? 'companies-desk' : 'pipeline-desk')}>
                <TabsList>
                  <TabsTrigger value="companies">Companies</TabsTrigger>
                  <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                </TabsList>
              </Tabs>
            </Stack>
            <Stack direction="row" align="center" gap="tight">
              <TrackButton />
              <AccountButton />
            </Stack>
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="max">
        <Box sx={{ py: 'lg' }}>{children}</Box>
      </Container>
    </Box>
  );
}

/** Section head per #133: body text, semibold. Page titles are the only `title` type. */
export function SectionHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <Stack direction="row" align="center" justify="space-between" gap="tight">
      <Text variant="body" as="h2" className="rjb-semibold">{children}</Text>
      {aside}
    </Stack>
  );
}

export function Secondary({ children, as }: { children: ReactNode; as?: 'p' | 'span' }) {
  return (
    <Text variant="caption" as={as ?? 'p'} style={SECONDARY}>
      {children}
    </Text>
  );
}

// Discover's header: the track's name, the track switcher, Manage / New track, and the one place
// where location and work mode are set (a popover, because HDS has no sheet yet). Spec:
// docs/specs/discover.md, "Track header".
import {
  Box,
  Button,
  Combobox,
  Icon,
  Menu as HdsMenu,
  Popover,
  Stack,
  Text,
} from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import { Plus } from 'lucide-react';
import { STARTER_PACKS } from './curation/starterPacks';
import type { Category } from './curation/types';
import { contextLabel, useTrackContext } from './discoverContext';
import LocationControl from './LocationControl';

export default function DiscoverHeader({
  categories,
  cat,
  onChange,
  onSeedPack,
  onBlank,
  onManage,
}: {
  categories: Category[];
  cat: Category;
  onChange: (id: string) => void;
  onSeedPack: (packId: string) => void;
  onBlank: () => void;
  onManage: () => void;
}) {
  const { where, mode } = useTrackContext(cat.id);
  // Packs the user can pull in as a ready-made track (the explicit "Blank track" item is separate),
  // so an existing user can add e.g. the ServiceNow track any time, not only at first run.
  const packs = STARTER_PACKS.filter((p) => p.id !== 'blank');
  return (
    <Box sx={{ mb: 'sm' }}>
      <Stack gap="xs">
        {/* rev-3 G: the track's name, then where and how you search as one caption line with a
            quiet Change (the popover holds the only LocationControl), then Manage track and the
            New track icon button. The track switcher shows only when there is a track to switch
            to, so a one-track user sees two nav levels at most. */}
        <PageHeader
          level={2}
          title={cat.label}
          description={
            // PageHeader wraps the description in a <p>, so this row is inline content only (a
            // span, not a Stack div): "where · Change".
            <Text variant="caption" as="span" tone="secondary">
              {`${contextLabel(where, mode)} · `}
              <Popover>
                <Popover.Trigger asChild>
                  <Button
                    size="sm"
                    variant="tertiary"
                    aria-label={`Change where: ${contextLabel(where, mode)}`}
                  >
                    Change
                  </Button>
                </Popover.Trigger>
                <Popover.Content align="start" aria-label="Where and how you want to work">
                  <LocationControl categoryId={cat.id} />
                </Popover.Content>
              </Popover>
            </Text>
          }
        />
        <Stack direction="row" wrap="wrap" gap="xs" align="center">
          <Button size="md" variant="secondary" onClick={onManage}>
            Manage track
          </Button>
          <HdsMenu>
            <HdsMenu.Trigger asChild>
              <Button
                size="md"
                variant="secondary"
                iconOnly
                iconLeft={<Icon icon={Plus} />}
                label="New track"
              />
            </HdsMenu.Trigger>
            <HdsMenu.Content align="start">
              <HdsMenu.Label>Start from a pack</HdsMenu.Label>
              {packs.map((p) => (
                <HdsMenu.Item key={p.id} onSelect={() => onSeedPack(p.id)}>
                  {p.label}
                </HdsMenu.Item>
              ))}
              <HdsMenu.Separator />
              <HdsMenu.Item onSelect={onBlank}>Blank track</HdsMenu.Item>
            </HdsMenu.Content>
          </HdsMenu>
          {categories.length > 1 && (
            <Box
              sx={{ flex: '1 1 12rem', maxWidth: '24rem', minWidth: 0, '& > *': { width: '100%' } }}
            >
              <Combobox
                aria-label="Track to search"
                options={categories.map((c) => ({ value: c.id, label: c.label }))}
                value={cat.id}
                onChange={onChange}
                placeholder="Pick a track"
              />
            </Box>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

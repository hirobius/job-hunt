import {
  Badge,
  Button,
  Tooltip as HdsTooltip,
  useToast,
  Icon,
  Box,
  Text,
  InlineLink,
} from '@hirobius/design-system';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { addJob, isSaved, useJobs } from './store';
import { useTileTriage, toggleDismiss } from './tileTriage';
import type { Tile } from './jobsData';

// Tile kind, derived from the URL (issue #12): aggregator queries are "Search", Google
// fallback leads are "Lead" (verify before relying), everything else is a direct
// employer/program page.
const kindOf = (url: string): { label: string; tone: 'info' | 'warning' | 'neutral' } =>
  /google\.com\/search/.test(url)
    ? { label: 'Lead', tone: 'warning' }
    : /(indeed|ziprecruiter|linkedin|snagajob|usajobs|worksourcewa)\./.test(url)
      ? { label: 'Search', tone: 'info' }
      : { label: 'Direct', tone: 'neutral' };

// First phone number in the meta becomes tap-to-call (issue #12).
const PHONE = /\b(\d{3}-\d{3}-\d{4})\b/;
function metaWithTel(meta: string) {
  const m = meta.match(PHONE);
  if (!m || m.index == null) return meta;
  return (
    <>
      {meta.slice(0, m.index)}
      <InlineLink href={`tel:${m[1].replace(/-/g, '')}`}>{m[1]}</InlineLink>
      {meta.slice(m.index + m[1].length)}
    </>
  );
}

/** Compact link rows (v1): name + kind Badge + a one-line description, with Open + Save-to-queue.
 *  Used by Discover's Links and Search views. Saving floats the tile in its group (issue #13);
 *  with `triage`, each row gets a set-aside control. The file keeps its old name for call sites. */
export default function TileGrid({
  tiles,
  cta = 'Open',
  triage = false,
  onRemove,
  label = 'Links',
}: {
  tiles: Tile[];
  cta?: string;
  triage?: boolean;
  onRemove?: (url: string) => void;
  label?: string;
}) {
  useJobs(); // re-render on save
  const { dismissed } = useTileTriage();
  const dismissedSet = new Set(dismissed);
  const { toast } = useToast();
  // Enriched save (issue #57): carry the tile name → label and its meta → note so the queue
  // card isn't a bare URL; confirm with a toast pointing at the Queue.
  const save = (t: Tile) => {
    if (addJob(t.url, t.name, t.meta)) {
      toast({ title: 'Added to Queue', description: t.name, tone: 'success' });
    }
  };
  return (
    <Box as="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        const isAside = dismissedSet.has(t.url);
        const kind = kindOf(t.url);
        return (
          <Box
            as="li"
            key={t.url + t.name}
            sx={{
              display: 'flex',
              flexDirection: 'row',
              gap: 'xs',
              alignItems: 'center',
              py: 'xs',
              borderBottom: 'thin solid',
              borderColor: 'border.subtle',
              opacity: isAside ? 0.6 : 1,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs', alignItems: 'center' }}>
                <Text variant="ui" as="span" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {t.name}
                </Text>
                <Badge tone={kind.tone}>{kind.label}</Badge>
              </Box>
              {t.meta ? (
                <Text
                  variant="caption"
                  as="span"
                  style={{
                    color: 'var(--semantic-color-content-secondary)',
                    display: 'block',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {metaWithTel(t.meta)}
                </Text>
              ) : null}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0, alignItems: 'center' }}>
              <Button size="sm" variant="tertiary" asChild>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${cta} ${t.name}`}
                >
                  {cta}
                </a>
              </Button>
              <Button
                size="sm"
                variant={saved ? 'tertiary' : 'secondary'}
                disabled={saved}
                onClick={() => save(t)}
                aria-label={saved ? `${t.name} saved` : `Save ${t.name}`}
              >
                {saved ? 'Saved' : 'Save'}
              </Button>
              {triage && (
                <HdsTooltip>
                  <HdsTooltip.Trigger asChild>
                    <Button
                      size="sm"
                      variant="tertiary"
                      iconOnly
                      iconLeft={<Icon icon={isAside ? ArchiveRestore : Archive} />}
                      onClick={() => toggleDismiss(t.url)}
                      label={isAside ? 'Restore link' : 'Set link aside'}
                    />
                  </HdsTooltip.Trigger>
                  <HdsTooltip.Content>{isAside ? 'Restore' : 'Set aside'}</HdsTooltip.Content>
                </HdsTooltip>
              )}
              {onRemove && (
                <HdsTooltip>
                  <HdsTooltip.Trigger asChild>
                    <Button
                      size="sm"
                      variant="tertiary"
                      tone="danger"
                      iconOnly
                      iconLeft={<Icon icon={Trash2} />}
                      onClick={() => onRemove(t.url)}
                      label="Remove link"
                    />
                  </HdsTooltip.Trigger>
                  <HdsTooltip.Content>Remove</HdsTooltip.Content>
                </HdsTooltip>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

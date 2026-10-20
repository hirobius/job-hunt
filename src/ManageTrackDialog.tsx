import { useState } from 'react';
import {
  Button,
  Dialog,
  Input as HdsInput,
  SegmentedControl,
  Tag,
  Icon,
  Box,
  Text,
  Switcher,
  Stack,
  Disclosure,
  useToast,
} from '@hirobius/design-system';
import { DestructiveSection } from '@hirobius/design-system/patterns';
import { Trash2, X } from 'lucide-react';
import {
  updateCategory,
  removeCategory,
  addGroup,
  updateGroup,
  removeGroup,
  addTile,
  removeTile,
  useCategories,
  useGroups,
  useTiles,
} from './curation/curationStore';
import type { Seniority } from './curation/types';
import { STARTER_PACKS, topUpFromPack } from './curation/starterPacks';

// In-app curation controls (issue #37 / B4): edit a track's search terms + seniority + location,
// and add/remove its sections (groups) and links (tiles) — all through the curation store, which
// persists locally and syncs. Replaces the old read-only hardcoded-pillar "Manage trades" dialog.

// A comma/enter-separated chip editor for a string[] field on the category.
function ChipEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
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
        {label}
      </Text>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        {values.map((v) => (
          <Tag key={v} onClick={() => onChange(values.filter((x) => x !== v))}>
            {v} ✕
          </Tag>
        ))}
        {values.length === 0 && (
          <Text variant="caption" as="span" tone="secondary">
            none yet
          </Text>
        )}
      </Box>
      <HdsInput
        size="sm"
        aria-label={`Add ${label}`}
        placeholder={`Add ${label.toLowerCase()}…`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        style={{ maxWidth: 260 }}
      />
    </Box>
  );
}

function GroupEditor({ groupId }: { groupId: string }) {
  const tiles = useTiles().filter((t) => t.groupId === groupId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const addLink = () => {
    if (!name.trim() || !url.trim()) return;
    addTile(groupId, { name: name.trim(), url: url.trim(), meta: '' });
    setName('');
    setUrl('');
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 'xs' }}>
      {tiles.map((t) => (
        <Box
          sx={{ display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center' }}
          key={t.id}
        >
          <Text
            variant="caption"
            as="span"
            style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
          >
            {t.name}
          </Text>
          <Button
            size="sm"
            variant="tertiary"
            tone="danger"
            iconOnly
            iconLeft={<Icon icon={X} />}
            label={`Remove ${t.name}`}
            onClick={() => removeTile(t.id)}
          />
        </Box>
      ))}
      {/* Mobile-first: a column that becomes a row from sm. HDS sx has no base breakpoint (hds#652), so the base value sits on the key and the override nests under '&'. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          mt: 0.5,
          '&': { flexDirection: { sm: 'row' } },
        }}
      >
        <HdsInput
          size="sm"
          aria-label="Link name"
          placeholder="Link name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <HdsInput
          size="sm"
          aria-label="Link URL"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLink();
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={addLink}
          disabled={!name.trim() || !url.trim()}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}

export default function ManageTrackDialog({
  categoryId,
  open,
  onClose,
  onDeleted,
}: {
  categoryId: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const cat = useCategories().find((c) => c.id === categoryId);
  const groups = useGroups()
    .filter((g) => g.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!cat) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content
        style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'hidden' }}
      >
        <Stack gap="px8" style={{ maxHeight: '85vh' }}>
          <Dialog.Header>
            <Dialog.Title>Manage track</Dialog.Title>
          </Dialog.Header>
          <div
            style={{
              overflowY: 'auto',
              padding: '16px 4px',
              borderTop: '1px solid var(--semantic-color-border-default)',
              borderBottom: '1px solid var(--semantic-color-border-default)',
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
              <Box sx={{ '& > *': { width: '100%' } }}>
                <HdsInput
                  size="sm"
                  label="Track name"
                  value={cat.label}
                  onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
                  style={{ width: '100%' }}
                />
              </Box>
              <Switcher gap="tight">
                <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                  <HdsInput
                    size="sm"
                    label="Location"
                    value={cat.location}
                    onChange={(e) => updateCategory(cat.id, { location: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </Box>
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
                    Seniority
                  </Text>
                  <SegmentedControl
                    aria-label="Seniority"
                    size="sm"
                    value={cat.seniority}
                    onChange={(v) => updateCategory(cat.id, { seniority: v as Seniority })}
                    options={[
                      { value: 'any', label: 'Any' },
                      { value: 'entry', label: 'Entry' },
                      { value: 'experienced', label: 'Exp.' },
                    ]}
                  />
                </Box>
              </Switcher>
              <ChipEditor
                label="Title-search terms"
                values={cat.titles}
                onChange={(next) => updateCategory(cat.id, { titles: next })}
              />
              <ChipEditor
                label="ATS role terms"
                values={cat.atsRoles}
                onChange={(next) => updateCategory(cat.id, { atsRoles: next })}
              />

              <Box sx={{ borderTop: 'thin solid', borderColor: 'border.default', pt: 3 }}>
                <Text variant="body" className="rjb-semibold">
                  Sections & links
                </Text>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {groups.map((g) => (
                    <Box key={g.id}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'row',
                          gap: 1,
                          alignItems: 'center',
                          mb: 1,
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                          <HdsInput
                            size="sm"
                            aria-label="Section name"
                            value={g.label}
                            onChange={(e) => updateGroup(g.id, { label: e.target.value })}
                            style={{ width: '100%' }}
                          />
                        </Box>
                        <Button
                          size="sm"
                          variant="tertiary"
                          tone="danger"
                          iconOnly
                          iconLeft={<Icon icon={Trash2} />}
                          label={`Delete ${g.label} section`}
                          onClick={() => removeGroup(g.id)}
                        />
                      </Box>
                      <GroupEditor groupId={g.id} />
                    </Box>
                  ))}
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => addGroup(cat.id, { label: 'New section' })}
                  >
                    ＋ Add section
                  </Button>
                </Box>
              </Box>
              {/* Pull in what a starter pack gained since this track was made (e.g. the 2026-10
                  design-systems round). Additive only: nothing the user added or edited is removed
                  (curation/starterPacks.ts topUpFromPack). */}
              <Disclosure variant="nav" label="Update from a starter pack">
                <Stack gap="tight">
                  <Text variant="caption" as="p" tone="secondary">
                    Adds the pack's newer titles, search terms, links and outreach targets that this
                    track doesn't have yet. Nothing is removed.
                  </Text>
                  <Stack direction="row" wrap="wrap" gap="tight">
                    {STARTER_PACKS.filter((p) => p.id !== 'blank').map((p) => (
                      <Button
                        key={p.id}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const r = topUpFromPack(cat.id, p.id);
                          const n = r.titles + r.atsRoles + r.tiles + r.targets;
                          toast({
                            tone: n ? 'success' : 'info',
                            title: n
                              ? `Added ${r.titles + r.atsRoles} terms, ${r.tiles} links and ${r.targets} outreach targets from ${p.label}`
                              : `Already up to date with ${p.label}`,
                          });
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              </Disclosure>
              {/* Delete sits at the end of the body, not beside Done, so the two can't overlap on a phone. */}
              <DestructiveSection
                level={3}
                title="Delete this track"
                description="Deletes the track, all its sections and links, and its outreach targets and saved searches. Jobs you saved stay in your Pipeline."
                actionLabel="Delete track"
                confirmLabel="Delete track"
                confirmBody={`“${cat.label}”, all its content, and its outreach targets and saved searches will be gone for good.`}
                onConfirm={() => {
                  removeCategory(cat.id);
                  onDeleted();
                }}
              />
            </Box>
          </div>
          <Dialog.Footer>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </Dialog.Footer>
        </Stack>
      </Dialog.Content>
    </Dialog>
  );
}

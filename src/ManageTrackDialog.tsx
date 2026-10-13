import { useState } from 'react';
import {
  Button,
  Disclosure,
  Input as HdsInput,
  SegmentedControl,
  Tag,
  Icon,
  Box,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { Sheet } from './Sheet';
import { STARTER_PACKS, topUpFromPack } from './curation/starterPacks';
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

// In-app curation controls (issue #37 / B4): edit a track's search terms + seniority + location,
// and add/remove its sections (groups) and links (tiles) — all through the curation store, which
// persists locally and syncs. Replaces the old read-only hardcoded-pillar "Manage trades" dialog.

// A chip editor for a string[] field on the category: removable chips + an add-term input.
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
    <Stack gap="tight">
      <Text
        variant="caption"
        as="span"
        style={{ color: 'var(--semantic-color-content-secondary)' }}
      >
        {label}
      </Text>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
        {values.map((v) => (
          <Tag
            key={v}
            active
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            {v} ✕
          </Tag>
        ))}
        {values.length === 0 && (
          <Text
            variant="caption"
            as="span"
            style={{ color: 'var(--semantic-color-content-secondary)' }}
          >
            none yet
          </Text>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 'xs', alignItems: 'flex-end' }}>
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            aria-label={`Add ${label.toLowerCase()}`}
            placeholder="Add a term…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            style={{ width: '100%' }}
          />
        </Box>
        <Button variant="secondary" size="sm" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </Box>
    </Stack>
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
  const cat = useCategories().find((c) => c.id === categoryId);
  const { toast } = useToast();
  const groups = useGroups()
    .filter((g) => g.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!cat) return null;

  const del = () => {
    if (
      window.confirm(`Delete the “${cat.label}” track and all its content? This can't be undone.`)
    ) {
      removeCategory(cat.id);
      onDeleted();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Manage track">
      <Stack gap="normal">
        <HdsInput
          size="sm"
          label="Track name"
          value={cat.label}
          onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
          style={{ width: '100%' }}
        />
        <HdsInput
          size="sm"
          label="Location"
          placeholder="City or State — leave blank for anywhere"
          value={cat.location}
          onChange={(e) => updateCategory(cat.id, { location: e.target.value })}
          style={{ width: '100%' }}
        />
        <Stack gap="tight">
          <Text
            variant="caption"
            as="span"
            style={{ color: 'var(--semantic-color-content-secondary)' }}
          >
            Seniority
          </Text>
          <SegmentedControl
            aria-label="Seniority"
            size="sm"
            fullWidth
            value={cat.seniority}
            onChange={(v) => updateCategory(cat.id, { seniority: v as Seniority })}
            options={[
              { value: 'any', label: 'Any' },
              { value: 'entry', label: 'Entry' },
              { value: 'experienced', label: 'Experienced' },
            ]}
          />
        </Stack>
        <ChipEditor
          label="Title search terms"
          values={cat.titles}
          onChange={(next) => updateCategory(cat.id, { titles: next })}
        />
        <Disclosure label="Company-board role terms">
          <ChipEditor
            label="Company-board role terms"
            values={cat.atsRoles}
            onChange={(next) => updateCategory(cat.id, { atsRoles: next })}
          />
        </Disclosure>
        <Disclosure label={`Sections & links (${groups.length})`}>
          <Stack gap="normal">
            {groups.map((g) => (
              <Stack gap="tight" key={g.id}>
                <Box
                  sx={{ display: 'flex', flexDirection: 'row', gap: 'xs', alignItems: 'center' }}
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
              </Stack>
            ))}
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => addGroup(cat.id, { label: 'New section' })}
            >
              ＋ Add section
            </Button>
          </Stack>
        </Disclosure>
        {/* Pull the latest starter-pack terms and links into this track. Additive only:
            nothing the user added or edited is removed (curation/starterPacks.ts topUpFromPack). */}
        <Disclosure label="Update from a starter pack">
          <Stack gap="tight">
            <Text
              variant="caption"
              as="p"
              style={{ margin: 0, color: 'var(--semantic-color-content-secondary)' }}
            >
              Adds any search terms, sections and links from the pack that this track doesn’t have
              yet. Your own edits stay.
            </Text>
            <Stack direction="row" gap="tight" wrap="wrap">
              {STARTER_PACKS.filter((p) => p.id !== 'blank').map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const r = topUpFromPack(cat.id, p.id);
                    const n = r.titles + r.atsRoles + r.tiles;
                    toast({
                      tone: n ? 'success' : 'info',
                      title: n
                        ? `Added ${r.titles + r.atsRoles} terms and ${r.tiles} links from ${p.label}`
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
        {/* Pinned to the sheet's bottom edge so Done / Delete stay reachable while it scrolls. */}
        <div className="app-sheet-foot">
          <Button variant="tertiary" tone="danger" onClick={del}>
            Delete track
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Stack>
    </Sheet>
  );
}

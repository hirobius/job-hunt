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
} from '@hirobius/design-system';
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
      <Box sx={{ mb: 1 }}>
        <Text variant="caption" style={{ color: 'var(--semantic-color-content-secondary)' }}>
          {label}
        </Text>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        {values.map((v) => (
          <Tag key={v} active onClick={() => onChange(values.filter((x) => x !== v))}>
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
      <Box sx={{ maxWidth: 260, '& > *': { width: '100%' } }}>
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
        />
      </Box>
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
          <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            <Text variant="caption">{t.name}</Text>
          </Box>
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
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            aria-label="Link name"
            placeholder="Link name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
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
          />
        </Box>
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Manage track</Dialog.Title>
        </Dialog.Header>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          <Box sx={{ '& > *': { width: '100%' } }}>
            <HdsInput
              size="sm"
              label="Track name"
              value={cat.label}
              onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
            />
          </Box>
          <Switcher gap="tight">
            <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
              <HdsInput
                size="sm"
                label="Location"
                value={cat.location}
                onChange={(e) => updateCategory(cat.id, { location: e.target.value })}
              />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Text variant="caption" style={{ color: 'var(--semantic-color-content-secondary)' }}>
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

          <Box sx={{ borderTop: '1px solid', borderColor: 'border.default', pt: 3 }}>
            <Box sx={{ mb: 'xs' }}>
              <Text variant="body" as="h3" style={{ fontWeight: 600 }}>
                Sections & links
              </Text>
            </Box>
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
        </Box>
        <Dialog.Footer>
          <Button variant="tertiary" tone="danger" onClick={del}>
            Delete track
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

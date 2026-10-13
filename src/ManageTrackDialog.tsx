import { useState } from 'react';
import { Box, Stack, Typography } from './ui/box';
import {
  Button,
  Dialog,
  IconButton as HdsIconButton,
  Input as HdsInput,
  SegmentedControl,
  Tag,
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
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
        {values.map((v) => (
          <Tag key={v} active onClick={() => onChange(values.filter((x) => x !== v))}>
            {v} ✕
          </Tag>
        ))}
        {values.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            none yet
          </Typography>
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
    <Stack spacing={0.75} sx={{ pl: 1 }}>
      {tiles.map((t) => (
        <Stack key={t.id} direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {t.name}
          </Typography>
          <HdsIconButton
            size="sm"
            variant="tertiary"
            tone="danger"
            icon={X}
            label={`Remove ${t.name}`}
            onClick={() => removeTile(t.id)}
          />
        </Stack>
      ))}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} sx={{ mt: 0.25 }}>
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
      </Stack>
    </Stack>
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
      <Dialog.Content
        style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
          <Dialog.Header>
            <Dialog.Title>Manage track</Dialog.Title>
          </Dialog.Header>
          <div
            style={{
              overflowY: 'auto',
              padding: '16px 4px',
              borderTop: '1px solid var(--semantic-color-border-default)',
              borderBottom: '1px solid var(--semantic-color-border-default)',
              margin: '8px 0',
            }}
          >
            <Stack spacing={1.75}>
              <Box sx={{ '& > *': { width: '100%' } }}>
                <HdsInput
                  size="sm"
                  label="Track name"
                  value={cat.label}
                  onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
                  style={{ width: '100%' }}
                />
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
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
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 0.5 }}
                  >
                    Seniority
                  </Typography>
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
              </Stack>
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

              <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Sections & links</Typography>
                <Stack spacing={1.25}>
                  {groups.map((g) => (
                    <Box key={g.id}>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                          <HdsInput
                            size="sm"
                            aria-label="Section name"
                            value={g.label}
                            onChange={(e) => updateGroup(g.id, { label: e.target.value })}
                            style={{ width: '100%' }}
                          />
                        </Box>
                        <HdsIconButton
                          size="sm"
                          variant="tertiary"
                          tone="danger"
                          icon={Trash2}
                          label={`Delete ${g.label} section`}
                          onClick={() => removeGroup(g.id)}
                        />
                      </Stack>
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
                </Stack>
              </Box>
            </Stack>
          </div>
          <Dialog.Footer>
            <Button variant="tertiary" tone="danger" onClick={del}>
              Delete track
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}

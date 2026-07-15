import { useState } from 'react';
import { Box, Stack, Typography } from './ui/box';
import { Button, Dialog, Input as HdsInput, SegmentedControl, Tag } from '@hirobius/design-system';
import { Reveal } from './ui/Reveal';
import {
  usePillars,
  useActivePillarId,
  createPillar,
  duplicatePillar,
  updatePillar,
  removePillar,
  setActivePillar,
} from './pillarStore';
import type { Pillar, Seniority } from './pillars';
import type { Group, Tile } from './jobsData';

function ChipListEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {values.map((v) => (
          <Tag key={v} onClick={() => onChange(values.filter((x) => x !== v))}>
            {v} ✕
          </Tag>
        ))}
        {values.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            None yet.
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            placeholder={`Add ${label.toLowerCase()}…`}
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
        <Button variant="tertiary" onClick={add} disabled={!draft.trim()} style={{ flex: 'none' }}>
          Add
        </Button>
      </Stack>
    </Box>
  );
}

function GroupsEditor({ groups, onChange }: { groups: Group[]; onChange: (g: Group[]) => void }) {
  const setGroup = (gi: number, patch: Partial<Group>) =>
    onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const setTile = (gi: number, ti: number, patch: Partial<Tile>) =>
    setGroup(gi, { tiles: groups[gi].tiles.map((t, i) => (i === ti ? { ...t, ...patch } : t)) });
  const addGroup = () =>
    onChange([
      ...groups,
      {
        id: 'g-' + (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
        label: 'New group',
        tiles: [],
      },
    ]);
  return (
    <Stack spacing={1.5}>
      {groups.map((g, gi) => (
        <Box key={g.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
              <HdsInput
                size="sm"
                label="Group label"
                value={g.label}
                onChange={(e) => setGroup(gi, { label: e.target.value })}
                style={{ width: '100%' }}
              />
            </Box>
            <Button
              variant="tertiary"
              size="sm"
              tone="danger"
              onClick={() => onChange(groups.filter((_, i) => i !== gi))}
              style={{ flex: 'none' }}
            >
              Remove
            </Button>
          </Stack>
          <Stack spacing={1}>
            {g.tiles.map((t, ti) => (
              <Stack
                key={ti}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems="center"
              >
                <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                  <HdsInput
                    size="sm"
                    label="Name"
                    value={t.name}
                    onChange={(e) => setTile(gi, ti, { name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </Box>
                <Box sx={{ flex: 1.3, minWidth: 0, '& > *': { width: '100%' } }}>
                  <HdsInput
                    size="sm"
                    label="URL"
                    value={t.url}
                    onChange={(e) => setTile(gi, ti, { url: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                  <HdsInput
                    size="sm"
                    label="Note"
                    value={t.meta}
                    onChange={(e) => setTile(gi, ti, { meta: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </Box>
                <Button
                  variant="tertiary"
                  size="sm"
                  tone="danger"
                  onClick={() => setGroup(gi, { tiles: g.tiles.filter((_, i) => i !== ti) })}
                  style={{ flex: 'none' }}
                >
                  ✕
                </Button>
              </Stack>
            ))}
            <Button
              variant="tertiary"
              size="sm"
              onClick={() =>
                setGroup(gi, { tiles: [...g.tiles, { name: 'New tile', meta: '', url: '' }] })
              }
            >
              + Add tile
            </Button>
          </Stack>
        </Box>
      ))}
      <Button variant="secondary" size="sm" onClick={addGroup}>
        + Add group
      </Button>
    </Stack>
  );
}

export default function PillarsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pillars = usePillars();
  const activeId = useActivePillarId();
  const [sel, setSel] = useState(activeId);
  const [showGroups, setShowGroups] = useState(false);
  const pillar = pillars.find((p) => p.id === sel) ?? pillars[0];
  const set = (patch: Partial<Pillar>) => updatePillar(pillar.id, patch);

  const remove = () => {
    if (window.confirm(`Delete “${pillar.label}”? This can't be undone.`)) {
      removePillar(pillar.id);
      setSel(pillars[0].id);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Content
        style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
          <Dialog.Header>
            <Dialog.Title>Trades</Dialog.Title>
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
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                {pillars.map((p) => (
                  <Tag key={p.id} active={p.id === sel} onClick={() => setSel(p.id)}>
                    {p.builtIn ? `${p.label} · built-in` : p.label}
                  </Tag>
                ))}
                <Button
                  variant="tertiary"
                  size="sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setSel(createPillar())}
                >
                  New
                </Button>
              </Box>

              {pillar.builtIn ? (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    “{pillar.label}” is a built-in trade (read-only). Duplicate it to customize the
                    titles, roles, seniority, and AI-tailor target.
                  </Typography>
                  <Button
                    variant="secondary"
                    style={{ marginTop: 12 }}
                    onClick={() => setSel(duplicatePillar(pillar.id))}
                  >
                    Duplicate to customize
                  </Button>
                </Box>
              ) : (
                <>
                  <HdsInput
                    label="Label"
                    size="sm"
                    value={pillar.label}
                    onChange={(e) => set({ label: e.target.value })}
                    style={{ width: '100%' }}
                  />
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems="flex-start"
                  >
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
                        value={pillar.seniority}
                        onChange={(v) => set({ seniority: v as Seniority })}
                        options={[
                          { value: 'entry', label: 'Entry-level' },
                          { value: 'experienced', label: 'Experienced' },
                          { value: 'any', label: 'Any' },
                        ]}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        Entry-level adds entry filters to searches
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                      <HdsInput
                        size="sm"
                        label="Default location"
                        value={pillar.location}
                        onChange={(e) => set({ location: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </Box>
                  </Stack>
                  <HdsInput
                    size="sm"
                    label="AI-tailor target role"
                    value={pillar.tailorRole ?? ''}
                    onChange={(e) => set({ tailorRole: e.target.value })}
                    style={{ width: '100%' }}
                  />
                  <ChipListEditor
                    label="Titles"
                    values={pillar.titles}
                    onChange={(v) => set({ titles: v })}
                  />
                  <ChipListEditor
                    label="ATS roles"
                    values={pillar.atsRoles}
                    onChange={(v) => set({ atsRoles: v })}
                  />
                  <Box>
                    <Button variant="tertiary" size="sm" onClick={() => setShowGroups((v) => !v)}>
                      {showGroups ? 'Hide' : 'Edit'} Discover groups ({pillar.groups.length})
                    </Button>
                    <Reveal open={showGroups}>
                      <Box sx={{ mt: 1 }}>
                        <GroupsEditor groups={pillar.groups} onChange={(g) => set({ groups: g })} />
                      </Box>
                    </Reveal>
                  </Box>
                  <Button
                    variant="tertiary"
                    tone="danger"
                    onClick={remove}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Delete pillar
                  </Button>
                </>
              )}
            </Stack>
          </div>
          <Dialog.Footer>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button
                variant="tertiary"
                onClick={() => {
                  setActivePillar(pillar.id);
                  onClose();
                }}
              >
                Use “{pillar.label}”
              </Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}

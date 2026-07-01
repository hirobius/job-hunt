import { useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Button } from './ui/Button';
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
          <Chip
            key={v}
            label={v}
            size="small"
            onDelete={() => onChange(values.filter((x) => x !== v))}
          />
        ))}
        {values.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            None yet.
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
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
        <Button onClick={add} disabled={!draft.trim()}>
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
            <TextField
              size="small"
              fullWidth
              label="Group label"
              value={g.label}
              onChange={(e) => setGroup(gi, { label: e.target.value })}
            />
            <Button
              size="small"
              color="error"
              onClick={() => onChange(groups.filter((_, i) => i !== gi))}
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
                <TextField
                  size="small"
                  label="Name"
                  value={t.name}
                  onChange={(e) => setTile(gi, ti, { name: e.target.value })}
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <TextField
                  size="small"
                  label="URL"
                  value={t.url}
                  onChange={(e) => setTile(gi, ti, { url: e.target.value })}
                  sx={{ flex: 1.3, minWidth: 0 }}
                />
                <TextField
                  size="small"
                  label="Note"
                  value={t.meta}
                  onChange={(e) => setTile(gi, ti, { meta: e.target.value })}
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  size="small"
                  color="error"
                  onClick={() => setGroup(gi, { tiles: g.tiles.filter((_, i) => i !== ti) })}
                >
                  ✕
                </Button>
              </Stack>
            ))}
            <Button
              size="small"
              onClick={() =>
                setGroup(gi, { tiles: [...g.tiles, { name: 'New tile', meta: '', url: '' }] })
              }
            >
              + Add tile
            </Button>
          </Stack>
        </Box>
      ))}
      <Button variant="outlined" size="small" onClick={addGroup}>
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Career pillars</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {pillars.map((p) => (
              <Chip
                key={p.id}
                label={p.builtIn ? `${p.label} · built-in` : p.label}
                size="small"
                color={p.id === sel ? 'primary' : 'default'}
                variant={p.id === sel ? 'filled' : 'outlined'}
                onClick={() => setSel(p.id)}
              />
            ))}
            <Button size="small" style={{ marginLeft: 'auto' }} onClick={() => setSel(createPillar())}>
              New
            </Button>
          </Box>

          {pillar.builtIn ? (
            <Box>
              <Typography variant="body2" color="text.secondary">
                “{pillar.label}” is a built-in pillar (read-only). Duplicate it to customize the
                titles, roles, seniority, and AI-tailor target.
              </Typography>
              <Button
                variant="outlined"
                style={{ marginTop: 12 }}
                onClick={() => setSel(duplicatePillar(pillar.id))}
              >
                Duplicate to customize
              </Button>
            </Box>
          ) : (
            <>
              <TextField
                label="Label"
                size="small"
                fullWidth
                value={pillar.label}
                onChange={(e) => set({ label: e.target.value })}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  select
                  size="small"
                  label="Seniority"
                  value={pillar.seniority}
                  onChange={(e) => set({ seniority: e.target.value as Seniority })}
                  sx={{ minWidth: 160 }}
                  helperText="Entry-level adds entry filters to searches"
                >
                  <MenuItem value="entry">Entry-level</MenuItem>
                  <MenuItem value="experienced">Experienced</MenuItem>
                  <MenuItem value="any">Any</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  label="Default location"
                  fullWidth
                  value={pillar.location}
                  onChange={(e) => set({ location: e.target.value })}
                />
              </Stack>
              <TextField
                size="small"
                label="AI-tailor target role"
                fullWidth
                value={pillar.tailorRole ?? ''}
                onChange={(e) => set({ tailorRole: e.target.value })}
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
                <Button size="small" onClick={() => setShowGroups((v) => !v)}>
                  {showGroups ? 'Hide' : 'Edit'} Discover groups ({pillar.groups.length})
                </Button>
                <Collapse in={showGroups}>
                  <Box sx={{ mt: 1 }}>
                    <GroupsEditor groups={pillar.groups} onChange={(g) => set({ groups: g })} />
                  </Box>
                </Collapse>
              </Box>
              <Button color="error" onClick={remove} style={{ alignSelf: 'flex-start' }}>
                Delete pillar
              </Button>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            setActivePillar(pillar.id);
            onClose();
          }}
        >
          Use “{pillar.label}”
        </Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

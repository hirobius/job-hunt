import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
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
          <Chip key={v} label={v} size="small" onDelete={() => onChange(values.filter((x) => x !== v))} />
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

export default function PillarsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pillars = usePillars();
  const activeId = useActivePillarId();
  const [sel, setSel] = useState(activeId);
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
            <Button size="small" sx={{ ml: 'auto' }} onClick={() => setSel(createPillar())}>
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
                sx={{ mt: 1.5 }}
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
              <Typography variant="caption" color="text.secondary">
                Discover groups are inherited from the pillar you duplicated. Editing groups and
                tiles is coming next.
              </Typography>
              <Button color="error" onClick={remove} sx={{ alignSelf: 'flex-start' }}>
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

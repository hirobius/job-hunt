import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  InputBase,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useActivePillar, usePillars } from './pillarStore';
import {
  useSnippets,
  addSnippet,
  updateSnippet,
  removeSnippet,
  duplicateSnippet,
  toggleSnippetPin,
  toggleSnippetTag,
  type Snippet,
} from './copyDeckStore';

export default function CopyDeckView() {
  const items = useSnippets();
  const [copied, setCopied] = useState<string | null>(null);
  const [scope, setScope] = useState<'pillar' | 'all'>('pillar');
  const pillar = useActivePillar();
  const pillars = usePillars();

  const del = (id: string) => {
    const s = items.find((x) => x.id === id);
    if (window.confirm(`Delete “${s?.label || 'this snippet'}”? This can't be undone.`))
      removeSnippet(id);
  };
  const copy = (id: string) => {
    const s = items.find((x) => x.id === id);
    if (!s) return;
    const done = () => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(s.body).then(done, () => updateSnippet(id, { open: true }));
    else updateSnippet(id, { open: true });
  };

  const isGlobal = (s: Snippet) => !s.pillars || s.pillars.length === 0;
  const visible = items
    .filter((s) => scope === 'all' || isGlobal(s) || s.pillars!.includes(pillar.id))
    .sort((a, b) => (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1));

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}
      >
        <Button variant="outlined" onClick={() => addSnippet(pillar.id)}>
          New snippet
        </Button>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scope}
          onChange={(_, v) => v && setScope(v)}
          sx={{ ml: 'auto' }}
        >
          <ToggleButton value="pillar">{pillar.label}</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {visible.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4 }}>
          No snippets tagged for “{pillar.label}”. Add one, or switch to All.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {visible.map((s) => (
            <Card key={s.id} variant="outlined">
              <CardContent>
                <InputBase
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => updateSnippet(s.id, { label: e.target.value })}
                  sx={{
                    width: '100%',
                    fontFamily: '"Clash Display", sans-serif',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    mb: 0.5,
                  }}
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {pillars.map((p) => {
                    const on = (s.pillars ?? []).includes(p.id);
                    return (
                      <Chip
                        key={p.id}
                        label={p.label}
                        size="small"
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() => toggleSnippetTag(s.id, p.id)}
                      />
                    );
                  })}
                  {isGlobal(s) && <Chip label="Global" size="small" variant="outlined" />}
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  <Button size="small" onClick={() => updateSnippet(s.id, { open: !s.open })}>
                    {s.open ? 'Hide' : 'Show'}
                  </Button>
                  <Button size="small" color="success" onClick={() => copy(s.id)}>
                    {copied === s.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="small" onClick={() => toggleSnippetPin(s.id)}>
                    {s.pinned ? 'Pinned ★' : 'Pin'}
                  </Button>
                  <Button size="small" onClick={() => duplicateSnippet(s.id)}>
                    Duplicate
                  </Button>
                  <Button size="small" color="error" onClick={() => del(s.id)}>
                    Delete
                  </Button>
                </Stack>
                <Collapse in={!!s.open}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    value={s.body}
                    placeholder="Paste or write your snippet…"
                    onChange={(e) => updateSnippet(s.id, { body: e.target.value })}
                    sx={{ mt: 1 }}
                  />
                </Collapse>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}

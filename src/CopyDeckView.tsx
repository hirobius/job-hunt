import { useState } from 'react';
import {
  Box,
  Collapse,
  InputBase,
  Stack,
  TextField,
} from '@mui/material';
import { Badge, Card as HdsCard, SegmentedControl, Tag } from '@hirobius/design-system';
import { Button } from './ui/Button';
import EmptyState from './EmptyState';
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
        <Box sx={{ ml: 'auto' }}>
          <SegmentedControl
            aria-label="Snippet scope"
            size="sm"
            value={scope}
            onChange={(v) => setScope(v as 'pillar' | 'all')}
            options={[
              { value: 'pillar', label: pillar.label },
              { value: 'all', label: 'All' },
            ]}
          />
        </Box>
      </Stack>
      {visible.length === 0 ? (
        <EmptyState
          message={`No snippets tagged for “${pillar.label}”. Add one, or switch to All.`}
          action={
            <Button variant="outlined" onClick={() => addSnippet(pillar.id)}>
              New snippet
            </Button>
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {visible.map((s) => (
            <HdsCard key={s.id} bordered padding="none">
              <Box sx={{ p: 2 }}>
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
                      <Tag key={p.id} active={on} onClick={() => toggleSnippetTag(s.id, p.id)}>
                        {p.label}
                      </Tag>
                    );
                  })}
                  {isGlobal(s) && <Badge tone="neutral">Global</Badge>}
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  <Button size="small" onClick={() => updateSnippet(s.id, { open: !s.open })}>
                    {s.open ? 'Hide' : 'Show'}
                  </Button>
                  <Button size="small" variant="text" tone="success" onClick={() => copy(s.id)}>
                    {copied === s.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="small" onClick={() => toggleSnippetPin(s.id)}>
                    {s.pinned ? 'Pinned ★' : 'Pin'}
                  </Button>
                  <Button size="small" onClick={() => duplicateSnippet(s.id)}>
                    Duplicate
                  </Button>
                  <Button size="small" variant="text" tone="danger" onClick={() => del(s.id)}>
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
              </Box>
            </HdsCard>
          ))}
        </Stack>
      )}
    </Box>
  );
}

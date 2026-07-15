import { useState } from 'react';
import { Box, Stack } from './ui/box';
import { Button, Card as HdsCard, Textarea } from '@hirobius/design-system';
import { Reveal } from './ui/Reveal';
import EmptyState from './EmptyState';
import {
  useSnippets,
  addSnippet,
  updateSnippet,
  removeSnippet,
  duplicateSnippet,
  toggleSnippetPin,
} from './copyDeckStore';

export default function CopyDeckView() {
  const items = useSnippets();
  const [copied, setCopied] = useState<string | null>(null);

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

  const visible = [...items].sort((a, b) => (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1));

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}
      >
        <Button variant="secondary" onClick={() => addSnippet()}>
          New snippet
        </Button>
      </Stack>
      {visible.length === 0 ? (
        <EmptyState
          message="No snippets yet — cover letters, outreach notes and call scripts live here."
          action={
            <Button variant="secondary" onClick={() => addSnippet()}>
              New snippet
            </Button>
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {visible.map((s) => (
            <HdsCard key={s.id} bordered padding="none">
              <Box sx={{ p: 2 }}>
                <Box
                  as="input"
                  value={s.label}
                  placeholder="Label"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateSnippet(s.id, { label: e.target.value })
                  }
                  sx={{
                    width: '100%',
                    border: 0,
                    background: 'transparent',
                    color: 'text.primary',
                    outline: 'none',
                    fontFamily: '"Clash Display", sans-serif',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    mb: 0.5,
                  }}
                />
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => updateSnippet(s.id, { open: !s.open })}
                  >
                    {s.open ? 'Hide' : 'Show'}
                  </Button>
                  <Button variant="tertiary" size="sm" tone="success" onClick={() => copy(s.id)}>
                    {copied === s.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="tertiary" size="sm" onClick={() => toggleSnippetPin(s.id)}>
                    {s.pinned ? 'Pinned ★' : 'Pin'}
                  </Button>
                  <Button variant="tertiary" size="sm" onClick={() => duplicateSnippet(s.id)}>
                    Duplicate
                  </Button>
                  <Button variant="tertiary" size="sm" tone="danger" onClick={() => del(s.id)}>
                    Delete
                  </Button>
                </Stack>
                <Reveal open={!!s.open}>
                  <Textarea
                    rows={4}
                    value={s.body}
                    placeholder="Paste or write your snippet…"
                    onChange={(e) => updateSnippet(s.id, { body: e.target.value })}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                </Reveal>
              </Box>
            </HdsCard>
          ))}
        </Stack>
      )}
    </Box>
  );
}

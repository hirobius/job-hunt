import { useState } from 'react';
import {
  Button,
  Card as HdsCard,
  Textarea,
  Box,
  Disclosure,
  Input as HdsInput,
} from '@hirobius/design-system';
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          mb: 'sm',
          flexWrap: 'wrap',
          gap: 'xs',
        }}
      >
        <Button variant="secondary" onClick={() => addSnippet()}>
          New snippet
        </Button>
      </Box>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {visible.map((s) => (
            <HdsCard key={s.id} bordered padding="none">
              <Box sx={{ p: 'sm' }}>
                <HdsInput
                  size="sm"
                  aria-label="Snippet label"
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => updateSnippet(s.id, { label: e.target.value })}
                />
                <Box
                  sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 1, mt: 'xs' }}
                >
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
                </Box>
                <Disclosure
                  label="Snippet text"
                  open={!!s.open}
                  onOpenChange={(open) => updateSnippet(s.id, { open })}
                >
                  <Textarea
                    rows={4}
                    aria-label="Snippet text"
                    value={s.body}
                    placeholder="Paste or write your snippet…"
                    onChange={(e) => updateSnippet(s.id, { body: e.target.value })}
                  />
                </Disclosure>
              </Box>
            </HdsCard>
          ))}
        </Box>
      )}
    </Box>
  );
}

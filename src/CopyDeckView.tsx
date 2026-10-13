import { useState } from 'react';
import { EllipsisVertical, Pin } from 'lucide-react';
import {
  Box,
  Button,
  Card as HdsCard,
  Icon,
  Input as HdsInput,
  Menu,
  Text,
  Textarea,
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

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const preview = (body: string) => body.replace(/\s+/g, ' ').trim();

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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'sm',
          mb: 'sm',
        }}
      >
        <Text variant="title" as="h2" style={{ margin: 0 }}>
          Templates
        </Text>
        <Button variant="primary" onClick={() => addSnippet()}>
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
        <Box
          as="ul"
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {visible.map((s) => {
            const title = s.label.trim() || 'Untitled snippet';
            return (
              <Box as="li" key={s.id} aria-label={title}>
                <HdsCard bordered padding="none">
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'center',
                      columnGap: 2,
                      px: 4,
                      py: 3,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        {s.pinned && (
                          <Pin
                            size={14}
                            aria-label="Pinned"
                            fill="currentColor"
                            style={{ color: 'var(--semantic-accent-rest)', flex: 'none' }}
                          />
                        )}
                        <Text
                          variant="ui"
                          as="span"
                          style={{ fontWeight: 600, minWidth: 0, ...oneLine }}
                        >
                          {title}
                        </Text>
                      </Box>
                      <Text
                        variant="caption"
                        as="p"
                        style={{ ...muted, margin: '2px 0 0', ...oneLine }}
                      >
                        {preview(s.body) || 'Empty'}
                      </Text>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button variant="secondary" size="sm" onClick={() => copy(s.id)}>
                        {copied === s.id ? 'Copied' : 'Copy'}
                      </Button>
                      <Menu>
                        <Menu.Trigger asChild>
                          <Button
                            size="sm"
                            variant="tertiary"
                            iconOnly
                            iconLeft={<Icon icon={EllipsisVertical} />}
                            label="More actions"
                          />
                        </Menu.Trigger>
                        <Menu.Content align="end">
                          <Menu.Item onSelect={() => updateSnippet(s.id, { open: !s.open })}>
                            {s.open ? 'Hide' : 'Edit'}
                          </Menu.Item>
                          <Menu.Item onSelect={() => toggleSnippetPin(s.id)}>
                            {s.pinned ? 'Unpin' : 'Pin'}
                          </Menu.Item>
                          <Menu.Item onSelect={() => duplicateSnippet(s.id)}>Duplicate</Menu.Item>
                          <Menu.Separator />
                          <Menu.Item
                            onSelect={() => del(s.id)}
                            style={{ color: 'var(--semantic-color-feedback-error)' }}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Content>
                      </Menu>
                    </Box>
                  </Box>
                  {s.open && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        px: 4,
                        pb: 4,
                      }}
                    >
                      <HdsInput
                        size="sm"
                        aria-label="Snippet label"
                        value={s.label}
                        placeholder="Label"
                        onChange={(e) => updateSnippet(s.id, { label: e.target.value })}
                      />
                      <Textarea
                        rows={6}
                        aria-label="Snippet text"
                        value={s.body}
                        placeholder="Paste or write your snippet…"
                        onChange={(e) => updateSnippet(s.id, { body: e.target.value })}
                      />
                    </Box>
                  )}
                </HdsCard>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

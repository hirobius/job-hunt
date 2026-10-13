import { useEffect, useRef, useState } from 'react';
import { EllipsisVertical, Star } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
  Card as HdsCard,
  Icon,
  Input as HdsInput,
  Stack,
  Tag,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import EmptyState from './EmptyState';
import { Sheet, SheetMenu } from './Sheet';
import { navigate } from './route';
import {
  useSnippets,
  addSnippet,
  getSnippets,
  updateSnippet,
  removeSnippet,
  duplicateSnippet,
  toggleSnippetPin,
} from './copyDeckStore';

const INSERTABLE = ['Contact', 'Role', 'Company', 'Angle', 'Your name'] as const;
const muted = { color: 'var(--semantic-color-content-secondary)' } as const;
const clamp2 = {
  margin: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
} as const;

/** Distinct `[Token]` names in a template body, in order of first appearance. */
const bodyTokens = (body: string): string[] => {
  const seen: string[] = [];
  for (const m of body.matchAll(/\[([A-Za-z][A-Za-z ]{0,30})\]/g))
    if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
};
const preview = (body: string) => body.replace(/\s+/g, ' ').trim();

interface Draft {
  id: string;
  name: string;
  body: string;
}

export default function CopyDeckView() {
  const items = useSnippets();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  useEffect(() => {
    if (caret.current !== null && bodyRef.current) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [draft?.body]);

  const find = (id: string | null) => items.find((x) => x.id === id);
  const titleOf = (s: { label: string }) => s.label.trim() || 'Untitled template';

  const copy = (id: string) => {
    const s = find(id);
    if (!s || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(s.body).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied(null), 1500);
      },
      () => undefined,
    );
  };
  const del = (id: string) => {
    const s = find(id);
    if (window.confirm(`Delete “${s ? titleOf(s) : 'this template'}”? This can't be undone.`))
      removeSnippet(id);
  };
  const startEdit = (id: string) => {
    const s = find(id);
    if (s) setDraft({ id, name: s.label, body: s.body });
  };
  const create = () => {
    addSnippet();
    const all = getSnippets();
    const s = all[all.length - 1];
    setDraft({ id: s.id, name: s.label, body: s.body });
  };
  const insertToken = (tok: string) => {
    const el = bodyRef.current;
    setDraft((d) => {
      if (!d) return d;
      const at = el?.selectionStart ?? d.body.length;
      const end = el?.selectionEnd ?? at;
      const text = `[${tok}]`;
      caret.current = at + text.length;
      return { ...d, body: d.body.slice(0, at) + text + d.body.slice(end) };
    });
  };
  const save = () => {
    if (draft)
      updateSnippet(draft.id, {
        label: draft.name.trim() || 'Untitled template',
        body: draft.body,
      });
    setDraft(null);
  };

  const pinned = items.filter((s) => s.pinned);
  const rest = items.filter((s) => !s.pinned);
  const menuItem = find(menuId);
  const previewItem = find(previewId);

  const renderRow = (s: (typeof items)[number]) => {
    const title = titleOf(s);
    const tokens = bodyTokens(s.body);
    return (
      <Box as="li" key={s.id} aria-label={title}>
        <HdsCard bordered padding="none">
          <Stack gap="xs" style={{ padding: 'var(--primitive-space-4)' }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                columnGap: 'xs',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 'xs', minWidth: 0 }}>
                <Text
                  variant="ui"
                  as="span"
                  style={{
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </Text>
                {s.pinned && (
                  <Star
                    size={14}
                    aria-label="Pinned"
                    fill="currentColor"
                    style={{ color: 'var(--semantic-accent-rest)', flex: 'none' }}
                  />
                )}
              </Box>
              <Button
                size="sm"
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={EllipsisVertical} />}
                label={`Actions for ${title}`}
                onClick={() => setMenuId(s.id)}
              />
            </Box>
            <Text variant="caption" as="p" style={{ ...muted, ...clamp2 }}>
              {preview(s.body) || 'Empty'}
            </Text>
            {tokens.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
                {tokens.map((t) => (
                  <Badge key={t} tone="neutral" data-testid="token-chip">
                    {`[${t}]`}
                  </Badge>
                ))}
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 'xs' }}>
              <Button variant="tertiary" size="sm" onClick={() => setPreviewId(s.id)}>
                Preview
              </Button>
              <Button variant="primary" size="sm" onClick={() => copy(s.id)}>
                {copied === s.id ? 'Copied' : 'Copy'}
              </Button>
            </Box>
          </Stack>
        </HdsCard>
      </Box>
    );
  };
  const list = (rows: typeof items) => (
    <Stack as="ul" gap="xs" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map(renderRow)}
    </Stack>
  );

  return (
    <Stack gap="normal">
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'sm' }}
      >
        <Text variant="title" as="h2" style={{ margin: 0 }}>
          Templates
        </Text>
        <Button variant="primary" onClick={create}>
          New template
        </Button>
      </Box>

      {items.length === 0 ? (
        <EmptyState
          message="No templates yet — cover letters, outreach notes and call scripts live here."
          action={
            <Button variant="secondary" onClick={create}>
              New template
            </Button>
          }
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <Text variant="caption" as="h3" style={{ ...muted, margin: 0, fontWeight: 600 }}>
                Pinned
              </Text>
              {list(pinned)}
              {rest.length > 0 && (
                <Text variant="caption" as="h3" style={{ ...muted, margin: 0, fontWeight: 600 }}>
                  All templates
                </Text>
              )}
            </>
          )}
          {list(rest)}
        </>
      )}

      <Text variant="caption" as="p" style={muted}>
        Copy here pastes the raw template, tokens included. Use a template from a job page and the
        tokens are filled for you.
      </Text>

      <Sheet
        open={!!menuItem}
        onOpenChange={(o) => !o && setMenuId(null)}
        title={menuItem ? titleOf(menuItem) : ''}
      >
        {menuItem && (
          <SheetMenu
            label="Template actions"
            items={[
              {
                label: 'Copy',
                onSelect: () => {
                  copy(menuItem.id);
                  setMenuId(null);
                },
              },
              {
                label: 'Use with a job…',
                onSelect: () => {
                  setMenuId(null);
                  navigate({ tab: 'queue', sub: null });
                  toast({ title: 'Open a job, then tap Use a template', tone: 'info' });
                },
              },
              {
                label: 'Edit',
                onSelect: () => {
                  setMenuId(null);
                  startEdit(menuItem.id);
                },
              },
              {
                label: menuItem.pinned ? 'Unpin' : 'Pin',
                onSelect: () => {
                  toggleSnippetPin(menuItem.id);
                  setMenuId(null);
                },
              },
              {
                label: 'Duplicate',
                onSelect: () => {
                  duplicateSnippet(menuItem.id);
                  setMenuId(null);
                },
              },
              {
                label: 'Delete',
                tone: 'danger',
                onSelect: () => {
                  setMenuId(null);
                  del(menuItem.id);
                },
              },
            ]}
          />
        )}
      </Sheet>

      <Sheet
        open={!!previewItem}
        onOpenChange={(o) => !o && setPreviewId(null)}
        title={previewItem ? titleOf(previewItem) : ''}
        footer={
          previewItem ? (
            <Button variant="primary" onClick={() => copy(previewItem.id)}>
              {copied === previewItem.id ? 'Copied' : 'Copy'}
            </Button>
          ) : undefined
        }
      >
        <Text variant="body" as="p" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {previewItem?.body}
        </Text>
      </Sheet>

      <Sheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title="Edit template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <Stack gap="normal">
            <HdsInput
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Stack gap="xs">
              <Text variant="caption" as="span" style={muted}>
                Insert a token
              </Text>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
                {INSERTABLE.map((t) => (
                  <Tag key={t} onClick={() => insertToken(t)}>{`[${t}]`}</Tag>
                ))}
              </Box>
            </Stack>
            <Textarea
              ref={bodyRef}
              label="Body"
              rows={9}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </Stack>
        )}
      </Sheet>
    </Stack>
  );
}

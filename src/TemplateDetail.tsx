// One template (#132): its name and text, Copy as the one primary action, and Pin / Duplicate /
// Delete in a menu. Delete asks first (AlertDialog, not window.confirm).
import { useState } from 'react';
import { ChevronLeft, EllipsisVertical } from 'lucide-react';
import {
  AlertDialog,
  Button,
  Icon,
  InlineLink,
  Input as HdsInput,
  Menu,
  Stack,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { removeSnippet, toggleSnippetPin, updateSnippet } from './copyDeckStore';
import type { Snippet } from './copyDeckStore';
import { copyFilled } from './templateCopy';

export default function TemplateDetail({
  snippet,
  backHref,
  onDuplicate,
  onDeleted,
}: {
  snippet: Snippet;
  /** A phone shows one pane, so the detail carries a way back to the list. */
  backHref?: string;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const name = snippet.label.trim() || 'this template';

  const copy = async () => {
    const r = await copyFilled(snippet.body);
    if (r.ok) toast({ title: 'Copied', description: name, tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };

  return (
    <Stack gap="normal">
      {backHref && (
        <InlineLink href={backHref}>
          <Icon icon={ChevronLeft} /> Templates
        </InlineLink>
      )}
      <HdsInput
        aria-label="Snippet label"
        placeholder="Label"
        value={snippet.label}
        onChange={(e) => updateSnippet(snippet.id, { label: e.target.value })}
      />
      <Textarea
        rows={14}
        aria-label="Snippet text"
        value={snippet.body}
        placeholder="Paste or write your snippet…"
        onChange={(e) => updateSnippet(snippet.id, { body: e.target.value })}
      />
      <Stack direction="row" gap="tight" align="center">
        <Button variant="primary" onClick={copy}>
          Copy
        </Button>
        {/* Not modal: a modal menu and the confirm dialog both lock body pointer events, and the
            menu's cleanup can leave the page unclickable after Delete. */}
        <Menu modal={false}>
          <Menu.Trigger asChild>
            <Button
              variant="tertiary"
              iconOnly
              iconLeft={<Icon icon={EllipsisVertical} />}
              label="More actions"
            />
          </Menu.Trigger>
          <Menu.Content align="start">
            <Menu.Item onSelect={() => toggleSnippetPin(snippet.id)}>
              {snippet.pinned ? 'Unpin' : 'Pin'}
            </Menu.Item>
            <Menu.Item onSelect={onDuplicate}>Duplicate</Menu.Item>
            <Menu.Separator />
            {/* HDS Menu.Item has no danger tone; the feedback token marks the destructive item. */}
            <Menu.Item
              onSelect={() => setConfirming(true)}
              style={{ color: 'var(--semantic-color-feedback-error)' }}
            >
              Delete
            </Menu.Item>
          </Menu.Content>
        </Menu>
      </Stack>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Delete “{snippet.label.trim() || 'Untitled'}”?</AlertDialog.Title>
            <AlertDialog.Description>This can't be undone.</AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                tone="danger"
                onClick={() => {
                  removeSnippet(snippet.id);
                  onDeleted();
                }}
              >
                Delete
              </Button>
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </Stack>
  );
}

// One template (#132): its name, a row of token chips, the text, and a preview filled for a job.
// Copy (the filled text) is the one primary action; Pin / Duplicate / Delete sit in a menu and
// Delete asks first (AlertDialog, not window.confirm). From the HDS `lg` breakpoint the editor and
// the preview sit side by side; below it they are Write and Preview tabs.
import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, EllipsisVertical } from 'lucide-react';
import {
  AlertDialog,
  Button,
  Icon,
  InlineLink,
  Input as HdsInput,
  Menu,
  Select,
  Stack,
  Surface,
  Switcher,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Text,
  Textarea,
  Tooltip as HdsTooltip,
  useToast,
} from '@hirobius/design-system';
import { removeSnippet, toggleSnippetPin, updateSnippet } from './copyDeckStore';
import type { Snippet } from './copyDeckStore';
import { useJobs } from './store';
import { fillTemplate, unfilledTokens, valuesFromJob } from './templateFill';
import { insertAt, TOKEN_CHIPS } from './templateEditor';
import { copyFilled } from './templateCopy';
import { useAtLeast } from './hds-gaps/useBreakpoint';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;
const NO_JOB = 'none';
// HDS TabsContent is a tinted, padded card; inside an editor pane it should be bare (as in App.tsx).
const BARE_PANEL = {
  background: 'transparent',
  padding: 0,
  marginTop: 0,
  borderRadius: 0,
} as const;

export default function TemplateDetail({
  snippet,
  fillFor,
  onFillFor,
  backHref,
  onDuplicate,
  onDeleted,
}: {
  snippet: Snippet;
  /** The saved job's url the preview is filled for, or null to show the [Token] text. */
  fillFor: string | null;
  onFillFor: (url: string | null) => void;
  /** A phone shows one pane, so the detail carries a way back to the list. */
  backHref?: string;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const wide = useAtLeast('lg');
  const jobs = useJobs();
  const [confirming, setConfirming] = useState(false);
  const [pane, setPane] = useState('write');
  const name = snippet.label.trim() || 'this template';

  const job = jobs.find((j) => j.url === fillFor);
  const filled = job ? fillTemplate(snippet.body, valuesFromJob(job)) : snippet.body;
  const missing = unfilledTokens(filled).map((t) => `[${t}]`);

  // HDS Textarea has no insert-at-cursor API: read the element's selection, write the new body,
  // then put the caret after the token once React has re-rendered the value.
  const area = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (caret.current == null || !el) return;
    el.focus();
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [snippet.body]);
  const insert = (token: string) => {
    const el = area.current;
    const r = insertAt(snippet.body, el?.selectionStart ?? null, el?.selectionEnd ?? null, token);
    caret.current = r.caret;
    updateSnippet(snippet.id, { body: r.value });
  };

  const copy = async () => {
    const r = await copyFilled(filled);
    if (r.ok) toast({ title: 'Copied', description: name, tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };

  const editor = (
    <Stack gap="tight">
      <Stack direction="row" wrap="wrap" gap="tight" align="center">
        {TOKEN_CHIPS.map((c) => (
          <HdsTooltip key={c.token}>
            <HdsTooltip.Trigger asChild>
              <Tag onClick={() => insert(c.token)}>{c.token}</Tag>
            </HdsTooltip.Trigger>
            <HdsTooltip.Content>{c.hint}</HdsTooltip.Content>
          </HdsTooltip>
        ))}
      </Stack>
      <Textarea
        ref={area}
        rows={14}
        aria-label="Snippet text"
        value={snippet.body}
        placeholder="Paste or write your snippet…"
        onChange={(e) => updateSnippet(snippet.id, { body: e.target.value })}
      />
    </Stack>
  );

  const options = [
    { value: NO_JOB, label: 'No job (show [Tokens])' },
    ...jobs.map((j) => ({
      value: j.url,
      label: [j.label, j.company].filter(Boolean).join(' · ') || j.url,
    })),
  ];
  const preview = (
    <Stack gap="tight">
      <Select
        label="Fill for"
        options={options}
        value={job ? job.url : NO_JOB}
        onChange={(v) => onFillFor(v === NO_JOB ? null : v)}
      />
      <Surface padding="px16" role="region" aria-label="Preview">
        <Text variant="body" as="p" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {filled || 'Nothing to preview yet.'}
        </Text>
      </Surface>
      {missing.length > 0 && (
        <Text variant="caption" as="p" style={{ ...SECONDARY, margin: 0 }}>
          {job
            ? `Still unfilled for this job: ${missing.join(', ')}. Add them on the job, or edit after pasting.`
            : 'Pick a job to fill the [Tokens] in.'}
        </Text>
      )}
    </Stack>
  );

  return (
    <Stack gap="normal">
      {backHref && (
        // The icon sits beside the link, not in it: an icon inside an inline link breaks onto its own line.
        <Stack direction="row" gap="tight" align="center">
          <Icon icon={ChevronLeft} />
          <InlineLink href={backHref}>Templates</InlineLink>
        </Stack>
      )}
      <HdsInput
        aria-label="Snippet label"
        placeholder="Label"
        value={snippet.label}
        onChange={(e) => updateSnippet(snippet.id, { label: e.target.value })}
      />
      {wide ? (
        <Switcher gap="normal">
          {editor}
          {preview}
        </Switcher>
      ) : (
        <Tabs value={pane} onValueChange={setPane}>
          <Stack gap="tight">
            <TabsList aria-label="Template view">
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write" style={BARE_PANEL}>
              {editor}
            </TabsContent>
            <TabsContent value="preview" style={BARE_PANEL}>
              {preview}
            </TabsContent>
          </Stack>
        </Tabs>
      )}
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

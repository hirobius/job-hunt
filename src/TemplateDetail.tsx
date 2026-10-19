// One template (#132): its name, a row of token chips, the text, and a preview filled for a job.
// Variables (#221) are atomic chips in the text (hds-gaps/TokenTextarea), put in from the chip row
// or the Insert variable menu, and given values in the Variables panel: a picked job's four fields
// are saved on the job, everything else on the template (`Snippet.values`). The body stays plain
// text with `[Token]`s.
// Copy (the filled text) is the one primary action; Pin / Duplicate / Delete sit in a menu and
// Delete asks first (AlertDialog, not window.confirm). From the HDS `lg` breakpoint the editor and
// the preview sit side by side; below it they are Write and Preview tabs.
import { useRef, useState } from 'react';
import { ChevronLeft, EllipsisVertical, Plus } from 'lucide-react';
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
  Tooltip as HdsTooltip,
  useToast,
} from '@hirobius/design-system';
import { removeSnippet, toggleSnippetPin, updateSnippet } from './copyDeckStore';
import type { Snippet } from './copyDeckStore';
import { updateJob, useJobs } from './store';
import type { Job } from './types';
import { fillSnippet, ownValue, resolveVariables } from './templateFill';
import { insertToken, templateVariables, TOKEN_CHIPS } from './templateEditor';
import { useApplyKit } from './applyKit';
import TokenTextarea from './hds-gaps/TokenTextarea';
import type { TokenTextareaHandle } from './hds-gaps/TokenTextarea';
import { copyFilled } from './templateCopy';
import { useAtLeast } from './hds-gaps/useBreakpoint';
import { SECONDARY } from './hds-gaps/tone';

const NO_JOB = 'none';
// The variables a picked job fills, and the job field each one is saved to.
const JOB_FIELD: Record<string, 'company' | 'label' | 'contact' | 'angle'> = {
  company: 'company',
  role: 'label',
  contact: 'contact',
  angle: 'angle',
};
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

  const kitName = useApplyKit().fields.name;
  const job = jobs.find((j) => j.url === fillFor);
  const names = templateVariables(snippet.body);
  const resolved = resolveVariables(names, snippet.values, job, kitName);
  const filled = fillSnippet(snippet, job, kitName);
  const missing = names.filter((n) => !resolved[n.toLowerCase()]).map((n) => `[${n}]`);

  // Chips and the Insert variable menu both go through insertToken at the field's last caret.
  const area = useRef<TokenTextareaHandle>(null);
  const insert = (token: string) => {
    const sel = area.current?.selection();
    const r = insertToken(snippet.body, sel?.start ?? null, sel?.end ?? null, token);
    updateSnippet(snippet.id, { body: r.value });
    area.current?.setCaret(r.caret);
  };
  // fromEntries makes own keys, so even a variable named `__proto__` is stored as a plain value.
  const setTemplateValue = (key: string, v: string) => {
    const rest = Object.entries(snippet.values ?? {}).filter(([k]) => k !== key);
    updateSnippet(snippet.id, { values: Object.fromEntries(v ? [...rest, [key, v]] : rest) });
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
        <Menu>
          <Menu.Trigger asChild>
            <Button variant="secondary" size="sm" iconLeft={<Icon icon={Plus} />}>
              Insert variable
            </Button>
          </Menu.Trigger>
          {/* Focus goes back to the text with the caret after the chip, not to this button. */}
          <Menu.Content align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
            {TOKEN_CHIPS.map((c) => (
              <Menu.Item key={c.token} onSelect={() => insert(c.token)}>
                {c.token.slice(1, -1)}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu>
      </Stack>
      <TokenTextarea
        ref={area}
        aria-label="Snippet text"
        value={snippet.body}
        placeholder="Paste or write your snippet…"
        onChange={(body) => updateSnippet(snippet.id, { body })}
      />
      <Text variant="caption" as="p" style={SECONDARY}>
        Type a name in square brackets, like [Hiring manager], to make your own variable.
      </Text>
    </Stack>
  );

  const variableField = (n: string) => {
    const key = n.toLowerCase();
    const field = job && (ownValue(JOB_FIELD, key) as (typeof JOB_FIELD)[string] | undefined);
    if (job && field)
      return (
        <HdsInput
          key={key}
          label={n}
          value={job[field] ?? ''}
          placeholder={ownValue(snippet.values, key) || 'Not set'}
          onChange={(e) => updateJob(job.url, { [field]: e.target.value } as Partial<Job>)}
        />
      );
    const kit = key === 'your name' && kitName ? kitName : '';
    return (
      <HdsInput
        key={key}
        label={n}
        value={ownValue(snippet.values, key) ?? ''}
        placeholder={kit || 'Not set'}
        helperText={kit ? 'Empty uses your Application kit name' : undefined}
        onChange={(e) => setTemplateValue(key, e.target.value)}
      />
    );
  };

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
      {names.length > 0 && (
        <section aria-labelledby={`vars-${snippet.id}`}>
          <Stack gap="tight">
            <Text variant="body" as="h3" id={`vars-${snippet.id}`} className="rjb-semibold">
              Variables
            </Text>
            <Text variant="caption" as="p" style={SECONDARY}>
              {job
                ? 'Company, Role, Contact and Angle are saved on this job; the rest on this template.'
                : 'Saved on this template. Pick a job to fill its company, role, contact and angle.'}
            </Text>
            {names.map(variableField)}
          </Stack>
        </section>
      )}
      <Surface padding="px16" role="region" aria-label="Preview">
        <Text variant="body" as="p" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {filled || 'Nothing to preview yet.'}
        </Text>
      </Surface>
      {missing.length > 0 && (
        <Text variant="caption" as="p" style={SECONDARY}>
          {job
            ? `Still unfilled for this job: ${missing.join(', ')}. Set them under Variables, or edit after pasting.`
            : `Not set yet: ${missing.join(', ')}. Set them under Variables, or pick a job.`}
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

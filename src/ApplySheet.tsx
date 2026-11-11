// The Apply sheet (#239) and the Application kit (blob v6): the job's filled templates and the
// profile fields as copy rows. Shown in the job's Apply view (#471) and in Apply mode.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Box,
  Button,
  Dialog,
  Disclosure,
  Icon,
  Input as HdsInput,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { ItemList, ItemRow, Panel, PanelBody } from './PipelinePanel';
import { ExitButton } from './hds-gaps/ExitButton';
import BlankText, { BlanksLeft } from './BlankText';
import { useBackCloses } from './useBackCloses';
import { readTemplatesOpen, writeTemplatesOpen } from './templatesOpen';
import { documentsHash, useRoute } from './route';
import { useRemembered } from './viewMemory';
import {
  KIT_FIELDS,
  addAnswer,
  clearStaleKitTemplates,
  filledTemplates,
  getApplyKit,
  removeAnswer,
  restoreAnswer,
  setKitField,
  setKitTemplate,
  updateAnswer,
  useApplyKit,
  type KitAnswer,
} from './applyKit';
import { useOutreachTemplates } from './outreachTemplates';
import { useSnippets } from './copyDeckStore';
import { AddStarterMessages } from './StarterMessages';
import { fillSnippet, previewText } from './templateFill';
import { copyFilled } from './templateCopy';
import { notifyRemoved } from './saveNotice';
import { canWrite, useCloudSync } from './account/accountContext';
import type { Job } from './types';
import { useFocusAfter } from './useFocusAfter';
import { collapseRow } from './feedback';

const previewOf = (text: string) => previewText(text);

/** Copy with a short "Copied" confirmation; a refused copy says why in a toast. */
function CopyButton({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const r = await copyFilled(value);
    if (!r.ok) return toast({ title: r.reason, tone: 'warning' });
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button
      size="md"
      variant="secondary"
      disabled={!value}
      iconLeft={<Icon icon={copied ? Check : Copy} />}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      onClick={copy}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** One label + value with one-tap Copy and inline edit. Empty: a prompt to add it. */
function CopyRow({
  label,
  value,
  onSave,
  remember,
  multiline = false,
  as = 'li',
}: {
  as?: 'li' | 'div';
  label: string;
  value: string;
  onSave: (v: string) => void;
  /** Keeps the open field and its text for this page load, so a trip to Edit documents and Back
   *  finds it as it was left (return paths). */
  remember: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useRemembered(`kit-edit:${remember}`, false);
  const [draft, setDraft] = useRemembered(`kit-draft:${remember}`, value);
  // Closing the field hands focus back to its Edit / Add button (#312).
  const { ref, focus } = useFocusAfter();
  const done = () => {
    onSave(draft.trim());
    setEditing(false);
    focus('edit');
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
    focus('edit');
  };
  const Field = multiline ? Textarea : HdsInput;
  const body = (
    <>
      {editing ? (
        <Stack gap="tight">
          <Field
            label={label}
            value={draft}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
              setDraft(e.target.value)
            }
            onKeyDown={(e: React.KeyboardEvent) => {
              // Handled here, so Enter never reaches the button focus moves to.
              if (!multiline && e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                done();
              }
              if (e.key === 'Escape') cancel();
            }}
          />
          <Stack direction="row" gap="tight">
            <Button size="md" variant="secondary" onClick={done}>
              Done
            </Button>
            <ExitButton onClick={cancel}>Cancel</ExitButton>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>
            <Text variant="ui" as="p" className="rjb-semibold">
              {label}
            </Text>
            <Text variant="caption" as="p" tone="secondary" className="rjb-prewrap">
              {value || `Add your ${label.toLowerCase()}`}
            </Text>
          </Box>
          <Stack direction="row" gap="tight" align="center">
            {/* A labelled secondary (rev-3 mock: "Add"), named for its field. */}
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${value ? 'Edit' : 'Add'} ${label}`}
              ref={ref('edit')}
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
            >
              {value ? 'Edit' : 'Add'}
            </Button>
            {value && <CopyButton label={label} value={value} />}
          </Stack>
        </Stack>
      )}
    </>
  );
  // A kit field is one row of its list (#449); an answer's own row stays in its panel.
  return as === 'li' ? (
    <ItemRow label={label}>{body}</ItemRow>
  ) : (
    <Box sx={{ py: 'xs' }} aria-label={label}>
      {body}
    </Box>
  );
}

/** A list inside a panel: plain rows, a hairline between them (#449: no cards within cards). */
function Rows({ label, children }: { label?: string; children: ReactNode }) {
  return <ItemList label={label}>{children}</ItemList>;
}

/** An expandable row (HDS Disclosure variant="row") as one list item. */
function DisclosureItem({
  label,
  preview,
  actions,
  children,
  remember,
}: {
  label: string;
  preview: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Keeps the row open or closed across a trip to Documents and back (return paths). */
  remember: string;
}) {
  const [open, setOpen] = useRemembered(`apply:${remember}`, false);
  return (
    <ItemRow label={label} dense>
      <Disclosure
        variant="row"
        label={label}
        preview={preview}
        actions={actions}
        open={open}
        onOpenChange={setOpen}
      >
        {children}
      </Disclosure>
    </ItemRow>
  );
}

/** A job template uses at least one blank ([Contact], [Role]): a message with none is a personal
 *  note filed as an Outreach message (an old Copy Deck snippet such as "Study plan — 80/20"), not a
 *  template for this job. It stays in Documents. */
const isJobTemplate = (body: string) => /\[[^\]\n]{1,60}\]/.test(body);

/** The Apply view's templates (#239; Adrian 2026-11-08): one "Templates (N)" disclosure under the
 *  job's actions, closed by default and remembered on this device. A row is the template's name,
 *  its first line, the blanks still open and Copy; tapping it opens the whole filled text in a
 *  dialog, where a blank fills in place (saved for this job) and Edit template opens Documents at
 *  that message. */
export function ApplyTemplates({ job }: { job: Job }) {
  const kit = useApplyKit();
  const snippets = useOutreachTemplates();
  const route = useRoute();
  const rows = useMemo(
    () =>
      filledTemplates(
        snippets.filter((s) => isJobTemplate(s.body)),
        job,
        kit.fields.name,
      ),
    [snippets, job, kit.fields.name],
  );
  const [open, setOpenState] = useState(readTemplatesOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    writeTemplatesOpen(v);
  };
  const [shown, setShown] = useState<string | null>(null);
  useBackCloses(!!shown, () => setShown(null), 'template-view');
  const current = rows.find((r) => r.id === shown) ?? null;
  const docOf = (id: string) => snippets.find((s) => s.id === id)?.documentId;
  // Documents opens as a dialog over this job (#471 slice 4): closing it, or saving a message,
  // comes straight back here with the row refilled. With no message yet, the link opens a new one.
  const editHref = documentsHash(rows.length ? '' : 'new/outreach', route);
  return (
    <Box as="section" aria-label="Templates">
      <Disclosure label={`Templates (${rows.length})`} open={open} onOpenChange={setOpen}>
        {open &&
          (rows.length ? (
            <Stack gap="tight">
              <ItemList label="Your templates">
                {rows.map((r) => (
                  <ItemRow key={r.id} label={r.label}>
                    <Stack direction="row" gap="tight" align="center">
                      <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>
                        <Button
                          variant="tertiary"
                          size="md"
                          className="rjb-template-row"
                          aria-label={`Open ${r.label}`}
                          onClick={() => setShown(r.id)}
                        >
                          <Stack gap="px4" align="start">
                            <Text variant="ui" as="span" className="rjb-semibold">
                              {r.label}
                            </Text>
                            <Text
                              variant="caption"
                              as="span"
                              tone="secondary"
                              className="rjb-truncate"
                            >
                              {previewText(r.text, 80)}
                            </Text>
                            <BlanksLeft text={r.text} />
                          </Stack>
                        </Button>
                      </Box>
                      <CopyIconButton label={r.label} value={r.text} />
                    </Stack>
                  </ItemRow>
                ))}
              </ItemList>
              <Box>
                <Button asChild variant="secondary" size="md">
                  <a href={editHref}>
                    <Icon icon={Pencil} />
                    Edit documents
                  </a>
                </Button>
              </Box>
            </Stack>
          ) : (
            // A clean first run has no messages: one tap adds the starters (Adrian 2026-10-22).
            <Stack gap="tight">
              <Text variant="caption" as="p" tone="secondary">
                No messages yet. Add the starters or write your own; each shows here filled for this
                job.
              </Text>
              <Stack direction="row" gap="tight" wrap="wrap">
                <AddStarterMessages />
                <Button asChild variant="secondary" size="md">
                  <a href={editHref}>
                    <Icon icon={Pencil} />
                    Write a message
                  </a>
                </Button>
              </Stack>
            </Stack>
          ))}
      </Disclosure>
      <Dialog open={!!current} onOpenChange={(o) => !o && setShown(null)}>
        {current && (
          <Dialog.Content className="rjb-dialog">
            <Dialog.Header>
              <Dialog.Title>{current.label}</Dialog.Title>
              <Dialog.Description>
                <Text variant="caption" as="span" tone="secondary">
                  Filled for this job. Tap a blank to fill it.
                </Text>
              </Dialog.Description>
            </Dialog.Header>
            <Box className="rjb-dialog-body">
              <BlankText text={current.text} job={job} documentId={docOf(current.id)} />
            </Box>
            <Dialog.Footer>
              <Stack direction="row" gap="tight" wrap="wrap">
                <CopyButton label={current.label} value={current.text} />
                {docOf(current.id) && (
                  <Button asChild variant="secondary" size="md">
                    <a href={documentsHash(docOf(current.id)!, route)}>
                      <Icon icon={Pencil} />
                      Edit template
                    </a>
                  </Button>
                )}
              </Stack>
            </Dialog.Footer>
          </Dialog.Content>
        )}
      </Dialog>
    </Box>
  );
}

/** Copy as an icon button (a template row): "Copied" shows in its tooltip-free label for a beat. */
function CopyIconButton({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const r = await copyFilled(value);
    if (!r.ok) return toast({ title: r.reason, tone: 'warning' });
    setCopied(true);
    toast({ title: `Copied ${label}`, tone: 'success' });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button
      size="md"
      variant="secondary"
      iconOnly
      disabled={!value}
      iconLeft={<Icon icon={copied ? Check : Copy} />}
      label={copied ? `Copied ${label}` : `Copy ${label}`}
      onClick={copy}
    />
  );
}

export function ApplicationKit({ job }: { job: Job }) {
  const kit = useApplyKit();
  const snippets = useOutreachTemplates();
  const options = [
    { value: '', label: 'No template' },
    ...snippets.map((s) => ({ value: s.id, label: s.label || 'Untitled' })),
  ];
  const template = (id?: string) => snippets.find((x) => x.id === id);
  const filled = (id?: string) => {
    const s = template(id);
    return s ? fillSnippet(s, job, kit.fields.name) : '';
  };
  const have = KIT_FIELDS.filter((f) => kit.fields[f.key]);
  const missing = KIT_FIELDS.filter((f) => !kit.fields[f.key]);
  const fieldRow = (f: (typeof KIT_FIELDS)[number]) => (
    <CopyRow
      key={f.key}
      label={f.label}
      value={kit.fields[f.key] ?? ''}
      onSave={(v) => setKitField(f.key, v)}
      remember={`field:${f.key}`}
    />
  );
  const answered = kit.answers.length;
  const sync = useCloudSync(); // signed out, the kit stays on this device
  const { user } = sync;
  const settled = canWrite(sync);
  // #314: a pick whose message was deleted reads as "No template" (the Select value below only
  // ever names a live message), and once sync has settled the stale id is cleared from the kit
  // itself, so it stops syncing and re-adding the starters cannot silently re-link it. Not while
  // legacy snippets wait for their move into the library (App's SnippetMigration, whose effect runs
  // after this child's on the commit sync settles): a picked snippet is not stale, only not moved.
  const moving = useSnippets().some((s) => !s.migrated);
  useEffect(() => {
    if (settled && !moving) clearStaleKitTemplates(snippets.map((s) => s.id));
  }, [settled, moving, snippets]);
  return (
    <Panel
      label="Application kit"
      title="Application kit"
      badge={`${have.length} of ${KIT_FIELDS.length}`}
    >
      <PanelBody>
        <Text variant="caption" as="p" tone="secondary">
          {user
            ? 'Enter these once. They follow your account.'
            : 'Enter these once. Saved on this device only.'}
        </Text>
      </PanelBody>
      <Rows label="Profile">
        {have.map((f) => fieldRow(f))}
        {/* Empty fields fold into one row, so the filled ones stay in reach (rev-3 mock). */}
        {missing.length > 0 && (
          <DisclosureItem
            remember="more"
            label={`Fill in ${missing.length} more`}
            preview={missing.map((f) => f.label).join(', ')}
          >
            {/* Rows, like the panel's own. */}
            <ItemList label="More fields" inset="none">
              {missing.map((f) => fieldRow(f))}
            </ItemList>
          </DisclosureItem>
        )}
        {(
          [
            ['whyTemplate', 'Why this company'],
            ['coverTemplate', 'Cover note'],
          ] as const
        ).map(([slot, label]) => {
          const text = filled(kit[slot]);
          return (
            <DisclosureItem
              key={slot}
              remember={slot}
              label={label}
              preview={
                text
                  ? previewOf(text)
                  : snippets.length
                    ? 'Pick a template to fill'
                    : 'No messages yet'
              }
              actions={text ? <CopyButton label={label} value={text} /> : undefined}
            >
              <Stack gap="tight">
                {/* With no messages, a picker would offer only "No template": add them instead. */}
                {snippets.length ? (
                  <Select
                    label={`${label} template`}
                    options={options}
                    value={template(kit[slot]) ? (kit[slot] ?? '') : ''}
                    onChange={(v) => setKitTemplate(slot, v)}
                  />
                ) : (
                  <Box>
                    <AddStarterMessages />
                  </Box>
                )}
                {text && (
                  <BlankText text={text} job={job} documentId={template(kit[slot])?.documentId} />
                )}
              </Stack>
            </DisclosureItem>
          );
        })}
        <DisclosureItem
          remember="answers"
          label="Custom answers"
          preview={
            answered
              ? kit.answers
                  .map((a) => a.q.trim())
                  .filter(Boolean)
                  .join(', ') || `${answered} saved`
              : 'Questions forms keep asking (visa, relocation, how you heard)'
          }
        >
          <Stack gap="tight">
            <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Your answers">
              {kit.answers.map((a) => (
                <AnswerRow key={a.id} a={a} />
              ))}
            </Box>
            <Box>
              <Button
                variant="tertiary"
                size="md"
                iconLeft={<Icon icon={Plus} />}
                onClick={() => addAnswer()}
              >
                Add a question
              </Button>
            </Box>
          </Stack>
        </DisclosureItem>
      </Rows>
    </Panel>
  );
}

/** Remove is soft (#212): the row collapses, then the answer goes, and Undo puts it back in its
 *  place. Its place is read when the remove lands, so two removes inside one collapse both stick. */
function removeWithUndo(a: KitAnswer, from: Element) {
  collapseRow(from, () => {
    const at = getApplyKit().answers.findIndex((x) => x.id === a.id);
    if (at < 0) return;
    removeAnswer(a.id);
    notifyRemoved(`Removed “${a.q.trim() || 'Untitled question'}”`, () => restoreAnswer(a, at));
  });
}

function AnswerRow({ a }: { a: KitAnswer }) {
  return (
    <Box as="li" sx={{ pb: 'xs' }}>
      <Stack gap="tight">
        <Stack direction="row" gap="tight" align="end">
          <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
            <HdsInput
              label="Question"
              value={a.q}
              placeholder="Question"
              onChange={(e) => updateAnswer(a.id, { q: e.target.value })}
            />
          </Box>
          <Button
            size="md"
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={Trash2} />}
            label={a.q.trim() ? `Remove question ${a.q}` : 'Remove this question'}
            onClick={(e) => removeWithUndo(a, e.currentTarget)}
          />
        </Stack>
        <CopyRow
          label={a.q || 'Answer'}
          value={a.a}
          multiline
          onSave={(v) => updateAnswer(a.id, { a: v })}
          remember={`answer:${a.id}`}
          as="div"
        />
      </Stack>
    </Box>
  );
}

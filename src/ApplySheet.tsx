// The Application kit (blob v6) on the job's Apply view (#471): "Copy into the form" (#539), the
// profile fields as copy chips, the letter picks filled from the Documents library and the custom
// answers. The job's messages live in Documents (#540: the Templates disclosure is gone).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Box,
  Button,
  Disclosure,
  Icon,
  Input as HdsInput,
  Select,
  Stack,
  Tag,
  Text,
  Textarea,
  VisuallyHidden,
  useToast,
} from '@hirobius/design-system';
import { ItemList, ItemRow, Panel, PanelBody } from './PipelinePanel';
import { ExitButton } from './hds-gaps/ExitButton';
import BlankText from './BlankText';
import { documentsHash, useRoute } from './route';
import { useRemembered } from './viewMemory';
import {
  KIT_FIELDS,
  addAnswer,
  clearStaleKitTemplates,
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
import { copyFailed, copyFilled } from './templateCopy';
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
    if (!r.ok) return toast(copyFailed(label, value));
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

/** One kit field as a flat chip with a copy icon (#539, redesign §5.5): a press copies the value
 *  and shows "Copied" for a moment. Its name stays "Copy <label>"; the status region alone says
 *  "Copied <label>", so a screen reader hears it once (#593). It copies; it commits nothing. */
// hds-gap: hirobius/hds#1435 (G4: Tag with a leading icon and a short "Copied" state)
function CopyChip({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const r = await copyFilled(value);
    if (!r.ok) return toast(copyFailed(label, value));
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Box as="li">
      {/* HDS Tag is a toggle: it sets aria-pressed itself, then spreads our props over it, so
          this undefined removes the attribute. A copy chip is a plain button, never "not
          pressed" (#593; copy-chips e2e and rapidApply pin it). Part of the G4 ask. */}
      <Tag aria-pressed={undefined} aria-label={`Copy ${label}`} onClick={copy}>
        <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Icon icon={copied ? Check : Copy} size="small" aria-hidden="true" />
          {copied ? 'Copied' : label}
        </Box>
      </Tag>
      <VisuallyHidden role="status">{copied ? `Copied ${label}` : ''}</VisuallyHidden>
    </Box>
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
  copy = true,
}: {
  as?: 'li' | 'div';
  /** The kit's fields copy from their chips (#539), so their edit rows carry no Copy. */
  copy?: boolean;
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
            {copy && value && <CopyButton label={label} value={value} />}
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

/** "Copy into the form" (#539): the kit's filled fields as copy chips, Edit for every field's row,
 *  the Why this company / Cover note picks (only when there is a message to pick, #540) and the
 *  custom answers. */
export function ApplicationKit({ job }: { job: Job }) {
  const kit = useApplyKit();
  const snippets = useOutreachTemplates();
  const route = useRoute();
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
      copy={false}
    />
  );
  const answered = kit.answers.length;
  // Edit opens every field's row (#539); the chips copy. Remembered per job for the page load
  // (#593): opened on one job, it is not open on every other job.
  const [editing, setEditing] = useRemembered(`kit-fields-editing:${job.url}`, false);
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
    <Panel label="Copy into the form" title="Copy into the form">
      <PanelBody>
        <Stack gap="tight">
          <Stack direction="row" gap="tight" align="center" justify="space-between">
            <Text variant="caption" as="p" tone="secondary">
              {user
                ? 'Enter these once. They follow your account.'
                : 'Enter these once. Saved on this device only.'}
            </Text>
            <Button
              size="md"
              variant="tertiary"
              iconLeft={<Icon icon={Pencil} />}
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              Edit
            </Button>
          </Stack>
          {/* Flat chips with a copy icon, not keycaps (#539): copying commits nothing. */}
          {have.length > 0 && (
            <Box
              as="ul"
              aria-label="Fields to copy"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 'xs' }}
            >
              {have.map((f) => (
                <CopyChip key={f.key} label={f.label} value={kit.fields[f.key] ?? ''} />
              ))}
            </Box>
          )}
          {/* The messages live in Documents (#540: the Templates disclosure is gone). With none
              yet, one tap adds the starters; then the message rows show. */}
          <Stack direction="row" gap="tight" wrap="wrap" align="center">
            {snippets.length === 0 && <AddStarterMessages />}
            <Button asChild variant="tertiary" size="md">
              <a href={documentsHash(snippets.length ? '' : 'new/outreach', route)}>
                <Icon icon={Pencil} />
                {snippets.length ? 'Edit documents' : 'Write a message'}
              </a>
            </Button>
          </Stack>
          {/* Empty fields fold into one line (#539). */}
          {missing.length > 0 && !editing && (
            <Text variant="caption" as="p" tone="secondary">
              {`${missing.length} more ${missing.length === 1 ? 'field is' : 'fields are'} empty. `}
              <Button
                variant="link"
                size="sm"
                className="hds-touch-target"
                onClick={() => setEditing(true)}
              >
                Add them
              </Button>
            </Text>
          )}
        </Stack>
      </PanelBody>
      <Rows label="Profile">
        {editing && KIT_FIELDS.map((f) => fieldRow(f))}
        {/* #540: no messages, no message rows. They come back once there is a message to pick. */}
        {(snippets.length > 0
          ? ([
              ['whyTemplate', 'Why this company'],
              ['coverTemplate', 'Cover note'],
            ] as const)
          : []
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

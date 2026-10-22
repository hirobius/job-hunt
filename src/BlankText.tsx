// A filled template's text with its blanks ([Contact]) as chips, the template editor's look
// (rev-3 A, N). Read-only by default; given a job and the message's document, each chip is a
// button that opens one small field under the text, and Fill saves the value where the editor's
// Variables panel would (fillBlank: the job's four fields on the job, the rest on the message), so
// the text refills at once. "N blanks left" says what is still open; Copy still works. After a
// fill the field goes, so focus moves on: to the next open blank, else to the copy action (QA: it
// fell to the dialog, which drew a heavy outline round the whole sheet).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  Box,
  Button,
  Card,
  Icon,
  Input as HdsInput,
  Stack,
  Tag,
  Text,
} from '@hirobius/design-system';
import { splitVariables } from './templateEditor';
import { previewText } from './templateFill';
import { fillBlank, savesOnJob } from './fillBlank';
import type { Job } from './types';

/** Text with its blanks as chips. With `onPick`, a chip is a button (a Tag) that names its blank. */
export function WithChips({
  text,
  onPick,
  picked,
}: {
  text: string;
  onPick?: (name: string) => void;
  picked?: string | null;
}) {
  return (
    <>
      {splitVariables(text).map((p, i) =>
        p.kind === 'text' ? (
          p.text
        ) : onPick ? (
          <Tag
            key={i}
            className="rjb-blank"
            active={picked === p.name}
            aria-label={`Fill ${p.name}`}
            onClick={() => onPick(p.name)}
          >
            {p.name}
          </Tag>
        ) : (
          <span key={i} className="rjb-chip">
            {p.name}
          </span>
        ),
      )}
    </>
  );
}

const blanksLeft = (n: number) => (n === 1 ? '1 blank left' : `${n} blanks left`);

/** "N blanks left", in the warning tone, or nothing. */
export function BlanksLeft({ text }: { text: string }) {
  const n = splitVariables(text).filter((p) => p.kind === 'var').length;
  if (!n) return null;
  return (
    // The icon sits inside the toned text, so currentColor gives it the warning colour too.
    <Text variant="caption" as="span" tone="warning" className="rjb-blanks-left">
      <Icon icon={TriangleAlert} size="small" />
      {blanksLeft(n)}
    </Text>
  );
}

/** A filled text whose blanks fill in place (when `job` and `documentId` are given). */
export default function BlankText({
  text,
  job,
  documentId,
  preview = false,
  head,
  action,
  nextFocus,
}: {
  text: string;
  job?: Job;
  /** The message the text was filled from: a blank that isn't a job field saves on it. */
  documentId?: string;
  /** A row's preview (rev-3 review): the start of the text, three lines at most. Its blanks
   *  still fill in place, and "N blanks left" counts the whole text. */
  preview?: boolean;
  /** A row's name, above the text. */
  head?: ReactNode;
  /** A row's action (Copy), kept on the first line beside the text. The fill field and
   *  "N blanks left" come after the row at full width (rev-3 A), not squeezed beside it. */
  action?: ReactNode;
  /** Where focus goes once the last open blank is filled (the dialog's Copy message). Left out,
   *  the row's own action takes it. */
  nextFocus?: RefObject<HTMLElement | null>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fillable = !!job && !!documentId;
  const root = useRef<HTMLDivElement>(null);
  const actionBox = useRef<HTMLDivElement>(null);
  // A frame after the field closes (the text has refilled by then): focus the blank named
  // `back` (Escape), else the first open blank, else the copy action.
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const moveFocus = (back?: string) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const blanks = [...(root.current?.querySelectorAll<HTMLElement>('.rjb-blank') ?? [])];
      const target =
        (back && blanks.find((b) => b.getAttribute('aria-label') === `Fill ${back}`)) ||
        blanks[0] ||
        nextFocus?.current ||
        actionBox.current?.querySelector<HTMLElement>('button:not(:disabled), a[href]');
      target?.focus();
    });
  };
  const pick = (name: string) => {
    setPicked(picked === name ? null : name);
    setDraft('');
  };
  const fill = () => {
    // Fill stays enabled (rev-3 A: a quiet secondary) and ignores an empty value.
    if (!job || !documentId || !picked || !draft.trim()) return;
    fillBlank(picked, draft, job, documentId);
    setPicked(null);
    setDraft('');
    moveFocus();
  };
  const cancel = () => {
    const name = picked ?? undefined;
    setPicked(null);
    moveFocus(name);
  };
  const body = (
    <Text variant="ui" as="p" className={preview ? 'rjb-clamp-3' : 'rjb-prewrap'}>
      <WithChips
        text={preview ? previewText(text) : text}
        onPick={fillable ? pick : undefined}
        picked={picked}
      />
    </Text>
  );
  return (
    <Stack gap="tight" ref={root}>
      {head || action ? (
        <Stack direction="row" gap="tight" align="start" justify="space-between">
          <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>
            <Stack gap="px4">
              {head}
              {body}
            </Stack>
          </Box>
          {action && <Box ref={actionBox}>{action}</Box>}
        </Stack>
      ) : (
        body
      )}
      {fillable && picked && (
        <Card
          bordered
          padding="px16"
          className="rjb-fillbox"
          role="group"
          aria-label={`Fill ${picked}`}
        >
          <Stack gap="px8">
            <Stack direction="row" gap="px8" align="end">
              <Box
                sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%', maxWidth: 'none' } }}
              >
                <HdsInput
                  label={picked}
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fill();
                    if (e.key === 'Escape') cancel();
                  }}
                />
              </Box>
              <Button variant="secondary" size="md" onClick={fill}>
                Fill
              </Button>
            </Stack>
            <Text variant="caption" as="p" tone="secondary">
              {savesOnJob(picked)
                ? 'Saves to this job, so the next message fills too.'
                : 'Saves on this message, for every job.'}
            </Text>
          </Stack>
        </Card>
      )}
      <BlanksLeft text={text} />
    </Stack>
  );
}

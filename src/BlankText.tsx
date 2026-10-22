// A filled template's text with its blanks ([Contact]) as chips, the template editor's look
// (rev-3 A, N). Read-only by default; given a job and the message's document, each chip is a
// button that opens one small field under the text, and Fill saves the value where the editor's
// Variables panel would (fillBlank: the job's four fields on the job, the rest on the message), so
// the text refills at once. "N blanks left" says what is still open; Copy still works.
import { useState, type ReactNode } from 'react';
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
  trailing,
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
  /** The text's last row, right of "N blanks left" (the dialogs' Edit message). */
  trailing?: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fillable = !!job && !!documentId;
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
    <Stack gap="tight">
      {head || action ? (
        <Stack direction="row" gap="tight" align="start" justify="space-between">
          <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>
            <Stack gap="px4">
              {head}
              {body}
            </Stack>
          </Box>
          {action}
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
                    if (e.key === 'Escape') setPicked(null);
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
      {trailing ? (
        // "N blanks left" left, the action right; the empty span keeps the action right-aligned
        // once every blank is filled.
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <BlanksLeft text={text} />
          <span />
          {trailing}
        </Stack>
      ) : (
        <BlanksLeft text={text} />
      )}
    </Stack>
  );
}

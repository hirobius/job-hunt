// A filled template's text with its blanks ([Contact]) as chips, the template editor's look
// (rev-3 A, N). Read-only by default; given a job and the message's document, each chip is a
// button that opens one small field under the text, and Fill saves the value where the editor's
// Variables panel would (fillBlank: the job's four fields on the job, the rest on the message), so
// the text refills at once. "N blanks left" says what is still open; Copy still works.
import { useState } from 'react';
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
    <Stack direction="row" gap="px4" align="center">
      <Icon icon={TriangleAlert} size="small" />
      <Text variant="caption" as="span" tone="warning">
        {blanksLeft(n)}
      </Text>
    </Stack>
  );
}

/** A filled text whose blanks fill in place (when `job` and `documentId` are given). */
export default function BlankText({
  text,
  job,
  documentId,
  preview = false,
}: {
  text: string;
  job?: Job;
  /** The message the text was filled from: a blank that isn't a job field saves on it. */
  documentId?: string;
  /** A row's preview (rev-3 review): the start of the text, three lines at most. Its blanks
   *  still fill in place, and "N blanks left" counts the whole text. */
  preview?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fillable = !!job && !!documentId;
  const pick = (name: string) => {
    setPicked(picked === name ? null : name);
    setDraft('');
  };
  const fill = () => {
    if (!job || !documentId || !picked || !draft.trim()) return;
    fillBlank(picked, draft, job, documentId);
    setPicked(null);
    setDraft('');
  };
  return (
    <Stack gap="tight">
      <Text variant="ui" as="p" className={preview ? 'rjb-clamp-3' : 'rjb-prewrap'}>
        <WithChips
          text={preview ? previewText(text) : text}
          onPick={fillable ? pick : undefined}
          picked={picked}
        />
      </Text>
      {fillable && picked && (
        <Card bordered padding="px16" role="group" aria-label={`Fill ${picked}`}>
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
              <Button variant="secondary" size="md" disabled={!draft.trim()} onClick={fill}>
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

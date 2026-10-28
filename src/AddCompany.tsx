// "Add a company" (#237): the one way onto the Companies list. A pasted job-board link is watched at
// once (feed/watchlist.ts); a name goes through the board probe (feed/discoverBoards.ts, the same
// politeness and cache as "Check a list of companies") and a board found is one Watch away. With no
// board on the systems we check, the company can be starred as a dream company instead. "Couldn't
// check" is never read as "no board". Rev-3 mock (s-add-company): the Add job dialog's pattern, one
// field with a one-line helper, Add the one primary.
import { useBackCloses } from './useBackCloses';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Dialog, Icon, Input, Stack, Text, useToast } from '@hirobius/design-system';
import { Form } from '@hirobius/design-system/patterns';
import { Plus } from 'lucide-react';
import type { DiscoverResult } from './feed/discoverBoards';
import { parseCompanyLine } from './feed/probe';
import { canonicalBoardUrl, parseBoardUrl, type Board } from './feed/sources/ats';
import { watchBoard } from './feed/watchlist';
import { starDream } from './feed/dreams';
import { CompanyLookupResults } from './CompanyLookupResults';
import { lookUpCompany } from './companyLookup';

export default function AddCompany({
  categoryId,
  boardUrls,
}: {
  categoryId: string;
  boardUrls: string[];
}) {
  const [open, setOpen] = useState(false);
  // The browser's Back closes the sheet and stays on the companies list (return paths).
  useBackCloses(open, () => setOpen(false), `add-company:${categoryId}`);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A Trigger, so closing the dialog returns focus here (a11y pass). */}
      <Dialog.Trigger asChild>
        <Button size="sm" iconLeft={<Icon icon={Plus} />}>
          Add a company
        </Button>
      </Dialog.Trigger>
      {open && (
        <AddCompanyContent
          categoryId={categoryId}
          boardUrls={boardUrls}
          onDone={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}

function AddCompanyContent({
  categoryId,
  boardUrls,
  onDone,
}: {
  categoryId: string;
  boardUrls: string[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const watchOne = (b: Board): boolean => {
    const r = watchBoard(categoryId, canonicalBoardUrl(b));
    if (r.ok) toast({ title: `Watching ${r.label}`, tone: 'success' });
    else toast({ title: r.error, tone: 'warning' });
    return r.ok;
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (running) return;
    const line = text.trim();
    if (!parseCompanyLine(line)) {
      setError('Type a company name or paste its job-board link.');
      return;
    }
    setError(null);
    // A board link needs no lookup: watch it now.
    const board = parseBoardUrl(line);
    if (board) {
      if (watchOne(board)) onDone();
      return;
    }
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    setAsked(line);
    setResult(null);
    try {
      setResult(await lookUpCompany(line, categoryId, ac.signal, boardUrls));
    } finally {
      setRunning(false);
    }
  };

  const star = () => {
    starDream(categoryId, { company: asked });
    // Where it landed, in the same words as Find boards'.
    toast({ title: `Added ${asked} to Dream companies`, tone: 'success' });
    onDone();
  };

  return (
    // Presented like Add job (TrackerView): the same width, header and footer.
    <Dialog.Content className="rjb-form-sheet" aria-describedby={undefined}>
      <Dialog.Header>
        <Dialog.Title>Add a company</Dialog.Title>
      </Dialog.Header>
      <Form noValidate onSubmit={(e) => void submit(e)}>
        <Stack gap="inset">
          <Input
            label="Company name or job-board link"
            value={text}
            placeholder="Company or board link"
            helperText="We look for its board on Greenhouse, Lever, Ashby and 10 more, or paste the board link."
            onChange={(e) => setText(e.target.value)}
            error={!!error}
            errorMessage={error ?? undefined}
            disabled={running}
            enterKeyHint="go"
          />
          {running && (
            <Text variant="ui" as="p" role="status">
              {`Looking for ${asked}'s board…`}
            </Text>
          )}
          {result && (
            <CompanyLookupResults asked={asked} result={result} watchOne={watchOne} onStar={star} />
          )}
        </Stack>
      </Form>
      {/* Add job's footer (rev-3 mock): Add the one primary; on a phone both stack full width. */}
      <Dialog.Footer>
        <Dialog.Close asChild>
          <Button variant="secondary">{result ? 'Done' : 'Cancel'}</Button>
        </Dialog.Close>
        <Button variant="primary" disabled={running} onClick={() => void submit()}>
          Add
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  );
}

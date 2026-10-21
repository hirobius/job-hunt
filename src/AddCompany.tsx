// "Add a company" (#237): the one way onto the Companies list. A pasted job-board link is watched at
// once (feed/watchlist.ts); a name goes through the board probe (feed/discoverBoards.ts, the same
// politeness and cache as "Check a list of companies") and a board found is one Watch away. With no
// board on the five systems, the company can be starred as a dream company instead. "Couldn't
// check" is never read as "no board".
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Icon,
  Input,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { Form, FormActions } from '@hirobius/design-system/patterns';
import { Plus, Star } from 'lucide-react';
import { discoverBoards, type DiscoverResult } from './feed/discoverBoards';
import { probeFetchJson } from './feed/probeFetch';
import { parseCompanyLine } from './feed/probe';
import { boardsFromUrls, canonicalBoardUrl, parseBoardUrl, type Board } from './feed/sources/ats';
import { SOURCE_LABEL } from './feed/types';
import { watchBoard } from './feed/watchlist';
import { starDream } from './feed/dreams';
import { listStyle } from './outreachShared';

export default function AddCompany({
  categoryId,
  boardUrls,
}: {
  categoryId: string;
  boardUrls: string[];
}) {
  const [open, setOpen] = useState(false);
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
  const [watchedNow, setWatchedNow] = useState<string[]>([]);
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
      setResult(
        await discoverBoards([line], {
          fetchJson: probeFetchJson,
          signal: ac.signal,
          watched: boardsFromUrls(boardUrls, Infinity),
        }),
      );
    } finally {
      setRunning(false);
    }
  };

  const key = (b: Board) => `${b.kind}:${b.slug}`;
  const star = () => {
    starDream(categoryId, { company: asked });
    toast({ title: `Starred ${asked}`, tone: 'success' });
    onDone();
  };

  return (
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Add a company</Dialog.Title>
        <Dialog.Description>
          Type a company name and we look for its board on Greenhouse, Lever, Ashby, Workable,
          Recruitee, SmartRecruiters, Teamtailor and Personio, or paste the board link.
        </Dialog.Description>
      </Dialog.Header>
      <Form noValidate onSubmit={(e) => void submit(e)}>
        <Stack gap="inset">
          <Input
            label="Company name or job-board link"
            value={text}
            placeholder="Acme Labs or https://jobs.lever.co/acme"
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
          {result && result.found.length > 0 && (
            <ul aria-label="Boards found" style={listStyle}>
              {result.found.map((f) => {
                const done = watchedNow.includes(key(f.board));
                return (
                  <li key={key(f.board)}>
                    <Stack direction="row" gap="xs" align="center" justify="space-between">
                      <Stack direction="row" gap="xs" align="center" wrap="wrap">
                        <Text variant="ui" as="span">
                          {f.company}
                        </Text>
                        <Badge>{SOURCE_LABEL[f.board.kind]}</Badge>
                      </Stack>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={done}
                        aria-label={`${done ? 'Watching' : 'Watch'} ${f.company}`}
                        onClick={() => {
                          if (watchOne(f.board)) setWatchedNow((w) => [...w, key(f.board)]);
                        }}
                      >
                        {done ? 'Watching' : 'Watch'}
                      </Button>
                    </Stack>
                  </li>
                );
              })}
            </ul>
          )}
          {result && result.alreadyWatched.length > 0 && (
            <Text
              variant="ui"
              as="p"
            >{`Already watching ${result.alreadyWatched.join(', ')}.`}</Text>
          )}
          {result && result.missed.length > 0 && (
            <Stack gap="xs">
              <Text variant="ui" as="p">
                {`No public board found for ${asked} on the five systems we check. It may hire elsewhere; keep it as a target to stay on your list.`}
              </Text>
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<Icon icon={Star} />}
                  aria-label={`Keep ${asked} as a target`}
                  onClick={star}
                >
                  Keep as a target
                </Button>
              </div>
            </Stack>
          )}
          {result && result.unknown.length > 0 && (
            <Alert tone="warning">
              {`We couldn't check ${asked} right now (rate-limited, offline or blocked). Try again in a minute.`}
            </Alert>
          )}
          {!result && !running && (
            <Text variant="caption" as="p" tone="secondary">
              Watched companies show on Companies with their open roles.
            </Text>
          )}
        </Stack>
      </Form>
      {/* rev-3 mock: "Cancel | Add" on one row at every width, Add the one primary (HDS
          FormActions; Dialog.Footer stacks them full width on a phone). */}
      <FormActions
        secondary={
          <Dialog.Close asChild>
            <Button variant="secondary">{result ? 'Done' : 'Cancel'}</Button>
          </Dialog.Close>
        }
        primary={
          <Button variant="primary" disabled={running} onClick={() => void submit()}>
            Add
          </Button>
        }
      />
    </Dialog.Content>
  );
}

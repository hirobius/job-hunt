// One Find box (Simplify 3/9, #384; docs/specs/simplify.html §7): paste anything and it goes to
// the action that already exists for it. find/classifyFind.ts reads the line; the helper line says
// what Find will do before it is pressed, and a name read as a company can be searched as a title
// instead (and back).
//   job link → saveWithNotice (addJobOutcome + notifySaved: To apply, Open, Undo)
//   board    → followed: added to the Sources (sources.ts), which Review new and the scan read
//   company  → the board probe (CompanyLookup): Follow a board found, or keep it as a dream
//   words    → the Search profile's titles (profile.ts), with Undo
// Every source and probe path stays as it is; this is one more way in. Titles need a Search
// profile (set up on Today); a job link, a board or a company never does.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Box, Button, Input, Stack, Text, useToast } from '@hirobius/design-system';
import { Form } from '@hirobius/design-system/patterns';
import { classifyFind, type FindResult } from './find/classifyFind';
import { saveWithNotice, showNotice } from './saveNotice';
import { boardLabel, type Board } from './feed/sources/ats';
import { parseCompanyLine } from './feed/probe';
import { followBoard, getSources, starCompany } from './sources';
import { feedSourcesOf, boardUrlsOf } from './feed/profile';
import { getProfile, saveProfile, updateProfile, withTitles } from './profile';
import type { DiscoverResult } from './feed/discoverBoards';
import { CompanyLookupResults } from './CompanyLookupResults';
import { lookUpCompany } from './companyLookup';

const HELPER = 'Paste a job link, a job board or a company, or type a job title.';
const EMPTY_ERROR = 'Paste a job link, a job board or a company, or type a job title';
const NO_PROFILE = 'Set up your search on Today first, so there is a list to add this to.';

/** What Find will do with the line, said before it is pressed. */
function reading(r: FindResult): string {
  switch (r.kind) {
    case 'empty':
      return HELPER;
    case 'job':
      return 'Saves this job to To apply.';
    case 'board':
      return `Follows ${boardLabel(r.board)}’s board.`;
    case 'company':
      return `Looks up ${r.name}’s job board.`;
    case 'words':
      return `Adds “${r.words}” to your titles.`;
  }
}

/** A company read as words, or words read as a company. */
function flip(r: FindResult): FindResult {
  if (r.kind === 'company') return { kind: 'words', words: r.name };
  if (r.kind === 'words') return { kind: 'company', name: r.words };
  return r;
}

export default function FindBox({
  autoFocus,
  initial = '',
  onDone,
  footer,
}: {
  /** Text to start with (the Add job field's, when it turns into Find). */
  initial?: string;
  /** Focus the field on mount (it is shown in place of another field). */
  autoFocus?: boolean;
  /** A one-shot action finished (saved, watched, title added): the host may close. */
  onDone?: () => void;
  /** Extra buttons after Find (a dialog's Cancel). */
  footer?: ReactNode;
}) {
  const { toast } = useToast();
  const [text, setText] = useState(initial.trim());
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  const classified = classifyFind(text);
  const find = flipped ? flip(classified) : classified;
  const canFlip = classified.kind === 'company' || classified.kind === 'words';

  const finish = () => {
    setText('');
    setFlipped(false);
    setResult(null);
    onDone?.();
  };

  const watchOne = (b: Board, label = boardLabel(b)): boolean => {
    const { added } = followBoard(b, label);
    toast({ title: added ? `Following ${label}` : `Already following ${label}`, tone: 'success' });
    return true;
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (running) return;
    if (find.kind === 'empty') return setError(EMPTY_ERROR);
    if (find.kind === 'job') {
      if (saveWithNotice(find.url) === 'invalid')
        return setError('Paste the full link to the posting, like https://…');
      setError(null);
      return finish();
    }
    setError(null);
    if (find.kind === 'board') {
      watchOne(find.board);
      return finish();
    }
    if (find.kind === 'words') {
      const profile = getProfile();
      if (!profile) return setError(NO_PROFILE);
      const title = find.words;
      const next = withTitles(profile, [title]);
      const offAt = profile.titlesOff.findIndex((t) => t.toLowerCase() === title.toLowerCase());
      if (offAt >= 0) {
        // Listed but switched off (the v12 move keeps old titles off): turn it on.
        const was = profile.titlesOff;
        updateProfile({ titlesOff: was.filter((_, i) => i !== offAt) });
        showNotice({
          title: `Turned “${title}” on in your titles`,
          tone: 'success',
          actions: [{ label: 'Undo', run: () => void updateProfile({ titlesOff: was }) }],
        });
      } else if (next.titles.length === profile.titles.length)
        showNotice({ title: `“${title}” is already in your titles`, actions: [] });
      else {
        saveProfile({ titles: next.titles });
        showNotice({
          title: `Added “${title}” to your titles`,
          tone: 'success',
          actions: [
            {
              label: 'Undo',
              run: () => {
                const cur = getProfile();
                if (cur) saveProfile({ titles: cur.titles.filter((t) => t !== title) });
              },
            },
          ],
        });
      }
      return finish();
    }
    // A company: look for its board; the result stays here to act on. A name the probe can't
    // read (a slash, no letters it can slug) would come back empty, so say so here instead.
    if (!parseCompanyLine(find.name))
      return setError('Type a company name or paste its job-board link.');
    const ac = new AbortController();
    abort.current?.abort();
    abort.current = ac;
    setRunning(true);
    setAsked(find.name);
    setResult(null);
    try {
      setResult(
        await lookUpCompany(find.name, ac.signal, boardUrlsOf(feedSourcesOf(getSources()))),
      );
    } finally {
      setRunning(false);
    }
  };

  const star = () => {
    starCompany(asked);
    toast({ title: `Following ${asked} as a dream company`, tone: 'success' });
    finish();
  };

  return (
    <Form noValidate onSubmit={(e) => void submit(e)}>
      <Stack gap="normal">
        <Input
          ref={field}
          label="Find"
          value={text}
          placeholder="Job link, company, board or title"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          helperText={reading(find)}
          error={!!error}
          errorMessage={error ?? undefined}
          disabled={running}
          onChange={(e) => {
            setText(e.target.value);
            // A lookup's result is for the name it was asked about, not what the field says now.
            setResult(null);
            setFlipped(false);
            if (error) setError(null);
          }}
        />
        {canFlip && !running && (
          <div>
            <Button variant="tertiary" size="sm" onClick={() => setFlipped((f) => !f)}>
              {find.kind === 'company'
                ? 'Search as a title instead'
                : 'Look up as a company instead'}
            </Button>
          </div>
        )}
        {running && (
          <Text variant="ui" as="p" role="status">
            {`Looking for ${asked}'s board…`}
          </Text>
        )}
        {result && (
          <CompanyLookupResults asked={asked} result={result} watchOne={watchOne} onStar={star} />
        )}
        {/* Add job's layout: on a phone Find full width over the footer; from sm one row, Find
            right-most. Find comes first in the DOM either way. */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { base: 'column', sm: 'row-reverse' },
            gap: 'xs',
          }}
        >
          <Button type="submit" variant="primary" disabled={running}>
            Find
          </Button>
          {footer}
        </Box>
      </Stack>
    </Form>
  );
}

// Companies → "Check a list of companies" (once the Find boards tool; a secondary view since #237;
// docs/specs/discovery-methods.md, method 2): paste company names, slugs or
// board URLs and the app checks which applicant-tracking systems host a public board for each, then
// lets you watch the ones it found. Browser only: the checks go straight to each ATS's keyless board
// API (src/feed/probe.ts), politely, and can be cancelled. "Not found" and "couldn't check" are kept
// apart on purpose: only a 404 means a company has no board there.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Alert,
  Button,
  Checkbox,
  Disclosure,
  SegmentedControl,
  InlineLink,
  Progress,
  Stack,
  Badge,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { discoverBoards, MAX_LIST, parseList, type DiscoverResult } from './feed/discoverBoards';
import { DISCOVERY_SOURCE_ENABLED } from './feed/discoverySources';
import TabsOverflowFade from './hds-gaps/TabsOverflowFade';
import { liveFetchJson } from './feed/fetchFeed';
import { probeFetchJson } from './feed/probeFetch';
import { boardsFromUrls, canonicalBoardUrl, type Board } from './feed/sources/ats';
import { SOURCE_LABEL } from './feed/types';
import { addBoardTiles, watchBoard } from './feed/watchlist';
import { batchLabel, fetchBatch, recentBatches, ycLines, YC_CREDIT } from './feed/yc';

const EMPTY: DiscoverResult = {
  found: [],
  missed: [],
  unknown: [],
  alreadyWatched: [],
  done: 0,
  total: 0,
};

const roles = (n?: number) =>
  n === undefined ? '' : n === 0 ? 'No openings now' : `${n} open ${n === 1 ? 'role' : 'roles'}`;

export default function FindBoardsPanel({
  categoryId,
  boardUrls,
}: {
  categoryId: string;
  boardUrls: string[];
}) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [batch, setBatch] = useState(() => recentBatches(new Date())[0]);
  const [hiringOnly, setHiringOnly] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [batchError, setBatchError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef<DiscoverResult | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const watched = useMemo(() => boardsFromUrls(boardUrls, Infinity), [boardUrls]);
  const isWatched = (b: Board) =>
    watched.some((w) => w.kind === b.kind && w.slug.toLowerCase() === b.slug.toLowerCase());
  const parsed = useMemo(() => parseList(text), [text]);

  const start = async (lines: string[], retry: boolean) => {
    if (running || !lines.length) return;
    const ac = new AbortController();
    abort.current = ac;
    const prev = retry ? resultRef.current : null;
    // A retry keeps everything answered so far and re-asks only the unknown ones.
    const base: DiscoverResult = prev
      ? { ...prev, unknown: [], total: prev.total, done: prev.done - prev.unknown.length }
      : { ...EMPTY, total: lines.length };
    const merge = (s: DiscoverResult): DiscoverResult => ({
      found: [
        ...base.found,
        ...s.found.filter(
          (f) =>
            !base.found.some((b) => b.board.kind === f.board.kind && b.board.slug === f.board.slug),
        ),
      ],
      missed: [...base.missed, ...s.missed],
      unknown: s.unknown,
      alreadyWatched: [...base.alreadyWatched, ...s.alreadyWatched],
      done: base.done + s.done,
      total: base.total,
    });
    const publish = (r: DiscoverResult) => {
      resultRef.current = r;
      setResult(r);
    };
    setRunning(true);
    publish(merge({ ...EMPTY, total: lines.length }));
    try {
      const final = await discoverBoards(lines, {
        fetchJson: probeFetchJson,
        signal: ac.signal,
        watched,
        onProgress: (s) => publish(merge(s)),
      });
      publish(merge(final));
    } finally {
      setRunning(false);
    }
  };

  // A batch is loaded into the box, not probed blind: you see (and can trim) what will be checked.
  const loadBatch = async () => {
    setLoadingBatch(true);
    setBatchError('');
    setBatchNote('');
    try {
      const companies = await fetchBatch(batch, liveFetchJson, { hiringOnly });
      const lines = ycLines(companies);
      setText(lines.join('\n'));
      setBatchNote(
        lines.length
          ? `Loaded ${lines.length} active ${lines.length === 1 ? 'company' : 'companies'} from ${batchLabel(batch)}. Source: ${YC_CREDIT}.`
          : `No active companies came back for ${batchLabel(batch)}.`,
      );
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : 'The YC directory could not be loaded.');
    } finally {
      setLoadingBatch(false);
    }
  };

  const watchOne = (b: Board) => {
    const r = watchBoard(categoryId, canonicalBoardUrl(b));
    if (r.ok)
      toast({
        title: `Watching ${r.label}`,
        description: 'Its open roles now show on Companies and in Live postings.',
        tone: 'success',
      });
    else toast({ title: r.error, tone: 'warning' });
  };

  const unwatchedFound = (result?.found ?? []).filter((f) => !isWatched(f.board));
  const watchAll = () => {
    const n = addBoardTiles(
      categoryId,
      unwatchedFound.map((f) => canonicalBoardUrl(f.board)),
    );
    toast({
      title: `Watching ${n} more ${n === 1 ? 'company' : 'companies'}`,
      description: 'Their open roles now show on Companies and in Live postings.',
      tone: 'success',
    });
  };

  const checked = result?.done ?? 0;
  return (
    <Stack gap="inset">
      <Text variant="ui" tone="secondary">
        Paste company names, slugs or job-board links, one per line. We check Greenhouse, Lever,
        Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor and Personio for a public board, so
        you can watch the ones that exist.
      </Text>
      {DISCOVERY_SOURCE_ENABLED.yc && (
        <Stack gap="xs">
          <Text variant="body" as="h3" className="rjb-semibold">
            Start from a YC batch
          </Text>
          <TabsOverflowFade value={batch}>
            <SegmentedControl
              aria-label="YC batch"
              size="sm"
              value={batch}
              onChange={setBatch}
              options={recentBatches(new Date()).map((b) => ({ value: b, label: batchLabel(b) }))}
            />
          </TabsOverflowFade>
          <Stack direction="row" gap="inset" align="center" wrap="wrap">
            <Button
              size="sm"
              variant="secondary"
              disabled={loadingBatch || running}
              onClick={() => void loadBatch()}
            >
              {loadingBatch ? 'Loading…' : 'Load batch'}
            </Button>
            <Checkbox
              label="Only companies hiring"
              checked={hiringOnly}
              onChange={() => setHiringOnly((v) => !v)}
            />
          </Stack>
          {batchNote && (
            <Text variant="caption" as="p" tone="secondary">
              {batchNote}
            </Text>
          )}
          {batchError && <Alert tone="warning">{batchError}</Alert>}
        </Stack>
      )}
      <Textarea
        label="Companies"
        rows={6}
        value={text}
        placeholder={'Acme Labs\nstripe\nhttps://jobs.lever.co/plaid'}
        onChange={(e) => setText(e.target.value)}
        disabled={running}
      />
      {(parsed.trimmed > 0 || parsed.ignored.length > 0) && (
        <Text variant="caption" as="p" tone="secondary">
          {parsed.trimmed > 0 &&
            `Only the first ${MAX_LIST} are checked in one run; ${parsed.trimmed} left out. `}
          {parsed.ignored.length > 0 &&
            `${parsed.ignored.length} ${parsed.ignored.length === 1 ? 'line is' : 'lines are'} not a company name or board link and will be skipped.`}
        </Text>
      )}
      <Stack direction="row" gap="xs" wrap="wrap">
        {running ? (
          <Button variant="secondary" size="sm" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!parsed.lines.length}
            onClick={() => void start(parsed.lines, false)}
          >
            Find boards
          </Button>
        )}
      </Stack>

      {result && (
        <Stack gap="xs">
          <Progress
            size="sm"
            value={checked}
            max={Math.max(result.total, 1)}
            label={`${checked} of ${result.total} checked`}
          />
          <Text variant="ui" as="p" role="status">
            {`${checked} of ${result.total} checked, ${result.found.length} ${result.found.length === 1 ? 'board' : 'boards'} found`}
            {!running && checked < result.total - result.unknown.length ? ' (stopped)' : ''}
          </Text>
        </Stack>
      )}

      {result && result.found.length > 0 && (
        <Stack gap="xs">
          <Stack direction="row" justify="space-between" align="center">
            <Text variant="body" as="h3" className="rjb-semibold">
              Boards found
            </Text>
            {unwatchedFound.length > 1 && (
              <Button size="sm" variant="secondary" onClick={watchAll}>
                {`Watch all (${unwatchedFound.length})`}
              </Button>
            )}
          </Stack>
          <Box
            as="ul"
            aria-label="Boards found"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 'xs' }}
          >
            {result.found.map((f) => (
              <li key={`${f.board.kind}:${f.board.slug}`}>
                <Stack direction="row" gap="xs" align="center" justify="space-between" wrap="wrap">
                  <Stack gap="px4">
                    <Stack direction="row" gap="xs" align="center" wrap="wrap">
                      <Text variant="ui" as="span">
                        <InlineLink href={canonicalBoardUrl(f.board)} externalIcon={false}>
                          {f.company}
                        </InlineLink>
                      </Text>
                      <Badge>{SOURCE_LABEL[f.board.kind]}</Badge>
                    </Stack>
                    {f.jobs !== undefined && (
                      <Text variant="caption" tone="secondary">
                        {roles(f.jobs)}
                      </Text>
                    )}
                  </Stack>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isWatched(f.board)}
                    aria-label={`${isWatched(f.board) ? 'Watching' : 'Watch'} ${f.company}`}
                    onClick={() => watchOne(f.board)}
                  >
                    {isWatched(f.board) ? 'Watching' : 'Watch'}
                  </Button>
                </Stack>
              </li>
            ))}
          </Box>
        </Stack>
      )}

      {result && result.alreadyWatched.length > 0 && (
        <Text variant="caption" as="p" tone="secondary">
          {`Already watching: ${result.alreadyWatched.join(', ')}.`}
        </Text>
      )}

      {result && result.missed.length > 0 && (
        <Disclosure label={`Not found (${result.missed.length})`}>
          <Stack gap="xs">
            <Text variant="caption" as="p" tone="secondary">
              No public board on any of the five systems under the names we tried. They may use
              another system or a different spelling; paste the board link if you have it.
            </Text>
            <Text variant="ui" as="p">
              {result.missed.join(', ')}
            </Text>
          </Stack>
        </Disclosure>
      )}

      {result && result.unknown.length > 0 && (
        <Disclosure label={`Couldn't check (${result.unknown.length})`}>
          <Stack gap="xs">
            <Text variant="caption" as="p" tone="secondary">
              These didn't get an answer (rate-limited, offline or blocked), so we can't say whether
              a board exists.
            </Text>
            <Text variant="ui" as="p">
              {result.unknown.join(', ')}
            </Text>
            <div>
              <Button
                size="sm"
                variant="secondary"
                disabled={running}
                onClick={() => void start(result.unknown, true)}
              >
                Retry unknown
              </Button>
            </div>
          </Stack>
        </Disclosure>
      )}
    </Stack>
  );
}

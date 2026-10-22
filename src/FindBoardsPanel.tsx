// Companies → "Check a list of companies" (once the Find boards tool; a secondary view since #237;
// docs/specs/discovery-methods.md, method 2): paste company names, slugs or
// board URLs and the app checks which applicant-tracking systems host a public board for each, then
// lets you watch the ones it found. Browser only: the checks go straight to each ATS's keyless board
// API (src/feed/probe.ts), politely, and can be cancelled. "Not found" and "couldn't check" are kept
// apart on purpose: only a 404 means a company has no board there.
// rev-3 L: companies go in through a chip input with type-ahead (your own companies and the YC
// directory; src/feed/companySuggest.ts), debounced, each source on its own; Enter adds the typed
// name as it is, so the field works with every source down. "Paste a list" and "Load a YC batch" stay
// as secondary ways in. A company with no board can be kept as a target (a dream company).
// HDS gap: Combobox has no `onInputChange` or rich option (logo, two lines), so the typed text is read
// from the bubbling change event and an option is one line, "Name · detail · source".
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClipboardPaste, Star } from 'lucide-react';
import {
  Box,
  Alert,
  Button,
  Checkbox,
  Combobox,
  Disclosure,
  Icon,
  InlineLink,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { FormField } from '@hirobius/design-system/patterns';
import { discoverBoards, MAX_LIST, parseList, type DiscoverResult } from './feed/discoverBoards';
import {
  knownCompanies,
  localSuggestions,
  mergeSuggestions,
  MIN_QUERY,
  suggestCompanies,
  type CompanySuggestion,
} from './feed/companySuggest';
import { starDream, useAllDreams } from './feed/dreams';
import { useAllTargets } from './feed/targets';
import { useTiles } from './curation/curationStore';
import { useJobs } from './store';
import { DISCOVERY_SOURCE_ENABLED } from './feed/discoverySources';
import { liveFetchJson } from './feed/fetchFeed';
import { probeFetchJson } from './feed/probeFetch';
import { boardsFromUrls, canonicalBoardUrl, type Board } from './feed/sources/ats';
import { SOURCE_LABEL } from './feed/types';
import { addBoardTiles, watchBoard } from './feed/watchlist';
import { Panel, PanelBody, PanelRow } from './PipelinePanel';
import { batchLabel, fetchBatch, recentBatches, ycLines, YC_CREDIT } from './feed/yc';

const EMPTY: DiscoverResult = {
  found: [],
  missed: [],
  unknown: [],
  alreadyWatched: [],
  done: 0,
  total: 0,
};

// Suggestions wait for a pause in typing.
const SUGGEST_DEBOUNCE_MS = 250;

/** An option's one line, two meta items (#192), source first: "Quillstack · YC W23, quillstack.example". */
const optionLabel = (s: CompanySuggestion) =>
  s.source === 'tracks' && !s.detail.startsWith('In your')
    ? `${s.name} · In your tracks, ${s.detail}`
    : `${s.name} · ${s.detail}`;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
  const [names, setNames] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<CompanySuggestion[]>([]);
  const [pasting, setPasting] = useState(false);
  const [ycOpen, setYcOpen] = useState(false);
  const [kept, setKept] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [batch, setBatch] = useState(() => recentBatches(new Date())[0]);
  const [hiringOnly, setHiringOnly] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [batchError, setBatchError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<DiscoverResult | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const watched = useMemo(() => boardsFromUrls(boardUrls, Infinity), [boardUrls]);
  const isWatched = (b: Board) =>
    watched.some((w) => w.kind === b.kind && w.slug.toLowerCase() === b.slug.toLowerCase());
  const parsed = useMemo(() => parseList([...names, text].join('\n')), [names, text]);

  const tiles = useTiles();
  const jobs = useJobs();
  const dreams = useAllDreams();
  const targets = useAllTargets();
  const known = useMemo(
    () =>
      knownCompanies({
        tiles,
        jobs,
        dreams: Object.values(dreams).flat(),
        targets: Object.values(targets).flat(),
      }),
    [tiles, jobs, dreams, targets],
  );
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    let live = true;
    const t = setTimeout(
      () => void suggestCompanies(q).then((r) => live && setRemote(r)),
      SUGGEST_DEBOUNCE_MS,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);
  const suggestions = mergeSuggestions([
    localSuggestions(query, known, names),
    // The last answer stays up while the next is on its way; a short query shows none.
    (query.trim().length < MIN_QUERY ? [] : remote).filter(
      (r) => !names.some((n) => sameName(n, r.name)),
    ),
  ]);
  const addName = (name: string) => {
    const n = name.trim();
    if (n && !names.some((x) => sameName(x, n))) setNames((all) => [...all, n]);
    if (n) setFieldError('');
    setQuery('');
  };
  const keep = (company: string) => {
    starDream(categoryId, { company });
    setKept((k) => [...k, company]);
    // Where it landed, in the same words as Add a company's.
    toast({ title: `Added ${company} to Dream companies`, tone: 'success' });
  };

  // The primary is never greyed out (rev-3): with nothing entered, say what to add, on the field.
  const findBoards = () => {
    if (running) return;
    if (!parsed.lines.length) {
      setFieldError('Add at least one company');
      fieldRef.current?.querySelector<HTMLElement>('[role="combobox"], input')?.focus();
      return;
    }
    setFieldError('');
    void start(parsed.lines, false);
  };

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
      if (lines.length) setPasting(true);
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
    <Stack gap="normal">
      <Panel
        label="Check a list of companies"
        title="Check a list of companies"
        description="Add companies, then we check 8 job-board systems for each: Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor and Personio."
      >
        <PanelBody>
          <Stack gap="inset" className="rjb-form-full">
            {/* The typed text, for the suggestions: HDS Combobox has no onInputChange (see the top). */}
            <div ref={fieldRef} onChange={(e) => setQuery((e.target as HTMLInputElement).value)}>
              <FormField
                label="Companies"
                description="Suggestions come from your tracks and the YC directory."
                error={fieldError || undefined}
              >
                <Combobox
                  multiple
                  creatable
                  value={names}
                  options={suggestions.map((s) => ({ value: s.name, label: optionLabel(s) }))}
                  onChange={(v) => {
                    setNames(v);
                    if (v.length) setFieldError('');
                    setQuery('');
                  }}
                  onCreate={addName}
                  placeholder="Company"
                  emptyMessage="Keep typing a company name"
                  disabled={running}
                />
              </FormField>
            </div>
            {pasting && (
              <Textarea
                label="Paste a list"
                helperText="Company names, slugs or job-board links, one per line."
                rows={6}
                value={text}
                placeholder="Companies"
                onChange={(e) => {
                  setText(e.target.value);
                  setFieldError('');
                }}
                disabled={running}
              />
            )}
            {(parsed.trimmed > 0 || parsed.ignored.length > 0) && (
              <Text variant="caption" as="p" tone="secondary">
                {parsed.trimmed > 0 &&
                  `Only the first ${MAX_LIST} are checked in one run; ${parsed.trimmed} left out. `}
                {parsed.ignored.length > 0 &&
                  `${parsed.ignored.length} ${parsed.ignored.length === 1 ? 'line is' : 'lines are'} not a company name or board link and will be skipped.`}
              </Text>
            )}
            {/* 8 apart (rev-3 mock); compact density's "xs" is 2px. */}
            <Stack direction="row" gap="px8" wrap="wrap" align="center">
              {running ? (
                <Button variant="secondary" onClick={() => abort.current?.abort()}>
                  Cancel
                </Button>
              ) : (
                <Button variant="primary" onClick={findBoards}>
                  Find boards
                </Button>
              )}
              {!pasting && (
                <Button
                  variant="secondary"
                  iconLeft={<Icon icon={ClipboardPaste} />}
                  onClick={() => setPasting(true)}
                >
                  Paste a list
                </Button>
              )}
              {DISCOVERY_SOURCE_ENABLED.yc && !ycOpen && (
                <Button variant="tertiary" onClick={() => setYcOpen(true)}>
                  Load a YC batch
                </Button>
              )}
            </Stack>
            {DISCOVERY_SOURCE_ENABLED.yc && ycOpen && (
              <Stack gap="xs">
                <Text variant="body" as="h3" className="rjb-semibold">
                  Start from a YC batch
                </Text>
                {/* A Select, not a segmented row: four batch names ran past a 390 phone's content
                    box and clipped mid-word with no cue (rev-3 C). */}
                <Select
                  label="YC batch"
                  showLabel={false}
                  value={batch}
                  onChange={setBatch}
                  options={recentBatches(new Date()).map((b) => ({
                    value: b,
                    label: batchLabel(b),
                  }))}
                />
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
          </Stack>
        </PanelBody>
      </Panel>
      {result && (
        <Panel
          label="Found"
          title="Found"
          badge={`${result.found.length} of ${result.total}`}
          trailing={
            unwatchedFound.length > 1 && (
              <Button size="sm" variant="secondary" onClick={watchAll}>
                {`Watch all (${unwatchedFound.length})`}
              </Button>
            )
          }
        >
          <PanelBody>
            <Stack gap="xs">
              <Progress
                size="sm"
                value={checked}
                max={Math.max(result.total, 1)}
                label={`${checked} of ${result.total} checked`}
              />
              <Text variant="caption" as="p" tone="secondary" role="status">
                {`${checked} of ${result.total} checked, ${result.found.length} ${result.found.length === 1 ? 'board' : 'boards'} found`}
                {!running && checked < result.total - result.unknown.length ? ' (stopped)' : ''}
              </Text>
              {result.alreadyWatched.length > 0 && (
                <Text variant="caption" as="p" tone="secondary">
                  {`Already watching: ${result.alreadyWatched.join(', ')}.`}
                </Text>
              )}
            </Stack>
          </PanelBody>
          {/* One row per company (rev-3 L): a board found to watch, or none to keep as a target. */}
          {result.found.length > 0 && (
            <ResultRows label="Boards found">
              {result.found.map((f) => (
                <ResultRow
                  key={`${f.board.kind}:${f.board.slug}`}
                  title={f.company}
                  // The title is plain like every row's (rev-3 L); the board link is its source.
                  meta={
                    <>
                      <InlineLink href={canonicalBoardUrl(f.board)} externalIcon={false}>
                        {SOURCE_LABEL[f.board.kind]}
                      </InlineLink>
                      {roles(f.jobs) && ` · ${roles(f.jobs)}`}
                    </>
                  }
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isWatched(f.board)}
                    aria-label={`${isWatched(f.board) ? 'Watching' : 'Watch'} ${f.company}`}
                    onClick={() => watchOne(f.board)}
                  >
                    {isWatched(f.board) ? 'Watching' : 'Watch'}
                  </Button>
                </ResultRow>
              ))}
            </ResultRows>
          )}
          {result.missed.length > 0 && (
            <ResultRows label="No board found">
              {result.missed.map((company) => {
                const done = kept.includes(company);
                return (
                  <ResultRow key={company} title={company} meta="No board found">
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={<Icon icon={Star} />}
                      disabled={done}
                      aria-label={`${done ? 'Kept' : 'Keep'} ${company} as a target`}
                      onClick={() => keep(company)}
                    >
                      {done ? 'Kept' : 'Keep as a target'}
                    </Button>
                  </ResultRow>
                );
              })}
            </ResultRows>
          )}
          {(result.missed.length > 0 || result.unknown.length > 0) && (
            <PanelRow as="div">
              <Stack gap="xs">
                {result.missed.length > 0 && (
                  <Text variant="caption" as="p" tone="secondary">
                    No board means none on the systems we check under the names we tried. It may
                    hire elsewhere or under another spelling; paste its board link if you have it.
                  </Text>
                )}
                {result.unknown.length > 0 && (
                  <Disclosure label={`Couldn't check (${result.unknown.length})`}>
                    <Stack gap="xs">
                      <Text variant="caption" as="p" tone="secondary">
                        These didn't get an answer (rate-limited, offline or blocked), so we can't
                        say whether a board exists.
                      </Text>
                      <Text variant="ui" as="p">
                        {result.unknown.join(', ')}
                      </Text>
                      <Box>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={running}
                          onClick={() => void start(result.unknown, true)}
                        >
                          Retry unknown
                        </Button>
                      </Box>
                    </Stack>
                  </Disclosure>
                )}
              </Stack>
            </PanelRow>
          )}
        </Panel>
      )}
    </Stack>
  );
}

/** A list of result rows under the Found panel's header, split by hairlines. */
function ResultRows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box as="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {children}
    </Box>
  );
}

/** One company: its name over a one-line meta, its action on the right. */
function ResultRow({
  title,
  meta,
  children,
}: {
  title: string;
  meta: ReactNode;
  children: ReactNode;
}) {
  return (
    <PanelRow>
      <Stack direction="row" gap="px8" align="center" justify="space-between">
        <Stack gap="px4">
          <Text variant="ui" as="span" weight="medium">
            {title}
          </Text>
          <Text variant="caption" tone="secondary">
            {meta}
          </Text>
        </Stack>
        {children}
      </Stack>
    </PanelRow>
  );
}

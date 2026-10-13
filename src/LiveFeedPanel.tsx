// Discover → "Live postings": real openings pulled at view time from public, keyless APIs — Hacker
// News "Who is hiring?", Remotive, and the Greenhouse/Lever/Ashby boards this track watches — then
// phrase-matched and ranked by src/feed/match.ts. Nothing is stored until the user saves a posting,
// which turns it into a tracked Job. Watching a board files a tile on the track (src/feed/watchlist.ts).
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Tooltip as HdsTooltip,
  Input as HdsInput,
  SegmentedControl,
  Card,
  Icon,
  Spinner,
  Stack,
  Tag,
  useToast,
  Box,
  Text,
  InlineLink,
} from '@hirobius/design-system';
import { ChevronRight } from 'lucide-react';
import EmptyState from './EmptyState';
import { Sheet } from './Sheet';
import LocationControl from './LocationControl';
import type { WorkMode } from './jobsData';
import { addJobDetailed, dedupKey, useJobs } from './store';
import { fetchFeed, type FeedResult } from './feed/fetchFeed';
import { rankPostings } from './feed/match';
import { postedAgo } from './feed/format';
import { boardsFromUrls } from './feed/sources/ats';
import { watchBoard } from './feed/watchlist';
import { jobFieldsFor } from './feed/toJob';
import { modeLabel } from './screening';
import { SOURCE_LABEL, type RankedPosting, type SignalId } from './feed/types';

type Focus = 'all' | SignalId;
/** Rows rendered per page — the rest sit behind "Show more". */
const PAGE = 40;

interface Loaded {
  term: string;
  boardsKey: string;
  at: number;
  result?: FeedResult;
  error?: string;
}

export default function LiveFeedPanel({
  categoryId,
  terms,
  boardUrls,
  where,
  mode,
  onWhere,
  onMode,
}: {
  categoryId: string;
  /** The track's search terms — offered as chips; the first is searched on open. */
  terms: string[];
  /** Every tile URL on the track; the feed pulls the ones that are company boards. */
  boardUrls: string[];
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState(terms[0] ?? '');
  const [term, setTerm] = useState(terms[0] ?? '');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [focus, setFocus] = useState<Focus>('all');
  const [shown, setShown] = useState(PAGE);
  const [watchUrl, setWatchUrl] = useState('');
  const [watchError, setWatchError] = useState('');
  const [watchOpen, setWatchOpen] = useState(false);

  const boardsKey = boardUrls.join('\n');
  const watchedCount = useMemo(() => boardsFromUrls(boardUrls, Infinity).length, [boardUrls]);

  useEffect(() => {
    if (!term.trim()) return;
    let alive = true;
    fetchFeed({ term, boardUrls: boardsKey ? boardsKey.split('\n') : [] })
      .then((result) => alive && setLoaded({ term, boardsKey, at: Date.now(), result }))
      .catch(
        () =>
          alive &&
          setLoaded({
            term,
            boardsKey,
            at: Date.now(),
            error: 'The feed failed unexpectedly — try searching again.',
          }),
      );
    return () => {
      alive = false;
    };
  }, [term, boardsKey]);

  const current = loaded && loaded.term === term && loaded.boardsKey === boardsKey ? loaded : null;
  const loading = !!term.trim() && !current;

  const ranked = useMemo(
    () =>
      current?.result
        ? rankPostings(current.result.postings, { term, where, mode, now: current.at })
        : [],
    [current, term, where, mode],
  );
  const counts = useMemo(
    () => ({
      contract: ranked.filter((p) => p.signals.some((s) => s.id === 'contract')).length,
      founding: ranked.filter((p) => p.signals.some((s) => s.id === 'founding')).length,
    }),
    [ranked],
  );
  const visible =
    focus === 'all' ? ranked : ranked.filter((p) => p.signals.some((s) => s.id === focus));

  const jobs = useJobs();
  const savedKeys = useMemo(() => new Set(jobs.map((j) => dedupKey(j.url))), [jobs]);

  const search = (t: string) => {
    setInput(t);
    setTerm(t.trim());
    setShown(PAGE);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    search(input);
  };

  const onWatch = (e: FormEvent) => {
    e.preventDefault();
    const r = watchBoard(categoryId, watchUrl);
    if (!r.ok) {
      setWatchError(r.error);
      return;
    }
    setWatchUrl('');
    setWatchError('');
    toast({
      title: `Watching ${r.label}`,
      description: 'Its openings now show up here.',
      tone: 'success',
    });
  };

  const save = (p: RankedPosting) => {
    const fields = jobFieldsFor(p, term);
    if (addJobDetailed(p.url, fields))
      toast({ title: 'Added to Queue', description: fields.label, tone: 'success' });
  };

  const errors = current?.result?.sources.filter((s) => s.error) ?? [];
  const skipped = current?.result?.boardsSkipped ?? 0;
  const allFailed = !!current?.result?.sources.length && errors.length === current.result.sources.length;

  return (
    <Stack gap="normal">
      <Text variant="ui" style={{ color: 'var(--semantic-color-content-secondary)' }}>
        Real openings from Hacker News “Who is hiring”, Remotive, and the company boards you watch —
        ranked by fit. Nothing is kept until you save one.
      </Text>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />

      <Stack gap="tight">
        <Box
          as="form"
          onSubmit={onSearch}
          sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end' }}
        >
          <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
            <HdsInput
              size="sm"
              label="Search term"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: '100%' }}
            />
          </Box>
          <Button type="submit" size="sm" variant="primary">
            Search
          </Button>
        </Box>
        {terms.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
            {terms.map((t) => (
              <Tag key={t} active={t === term} onClick={() => search(t)}>
                {t}
              </Tag>
            ))}
          </Box>
        )}
      </Stack>

      {errors.length > 0 && (
        <Alert tone="warning" title="Some sources didn’t respond">
          {errors.map((s) => (
            <Box key={s.key}>{s.error}</Box>
          ))}
        </Alert>
      )}
      {skipped > 0 && (
        <Text
          variant="caption"
          as="span"
          style={{ color: 'var(--semantic-color-content-secondary)' }}
        >
          {skipped} watched {skipped === 1 ? 'board was' : 'boards were'} skipped — the feed reads
          at most 25 per search.
        </Text>
      )}

      {loading ? (
        <Box
          sx={{ display: 'flex', flexDirection: 'row', gap: 'xs', alignItems: 'center', py: 'md' }}
        >
          <Spinner size="sm" label="Loading live postings" />
          <Text variant="ui" style={{ color: 'var(--semantic-color-content-secondary)' }}>
            Pulling live openings for “{term}”…
          </Text>
        </Box>
      ) : current?.error ? (
        <Alert tone="danger">{current.error}</Alert>
      ) : !term.trim() ? (
        <EmptyState message="Type a search term or pick one of this track's terms." />
      ) : allFailed ? (
        <EmptyState
          title="Couldn't reach any source"
          message="Check your internet connection or try again later."
        />
      ) : ranked.length === 0 ? (
        <EmptyState
          title={`No live openings mention “${term}” right now`}
          message="Hacker News posts a fresh thread monthly and boards change daily — try a broader term, or watch more company boards."
        />
      ) : (
        <Stack gap="tight">
          <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
            <SegmentedControl
              aria-label="Show"
              size="sm"
              value={focus}
              onChange={(v) => {
                setFocus(v as Focus);
                setShown(PAGE);
              }}
              options={[
                { value: 'all', label: `All (${ranked.length})` },
                { value: 'contract', label: `Contract-friendly (${counts.contract})` },
                { value: 'founding', label: `First hire (${counts.founding})` },
              ]}
            />
          </Box>
          {visible.length === 0 ? (
            <EmptyState message="None of these openings carry that signal — switch back to All." />
          ) : (
            <Box
              as="ul"
              aria-label="Live postings"
              sx={{
                listStyle: 'none',
                m: 0,
                p: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'xs',
              }}
            >
              {visible.slice(0, shown).map((p) => (
                <PostingRow
                  key={p.id}
                  p={p}
                  now={current!.at}
                  saved={savedKeys.has(dedupKey(p.url))}
                  onSave={() => save(p)}
                />
              ))}
            </Box>
          )}
          {visible.length > shown && (
            <Button variant="tertiary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({visible.length - shown})
            </Button>
          )}
        </Stack>
      )}

      <Button
        variant="secondary"
        iconRight={<Icon icon={ChevronRight} />}
        onClick={() => setWatchOpen(true)}
        style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
      >
        <Box as="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Text variant="ui" as="span" style={{ color: 'inherit', fontWeight: 600 }}>
            {watchedCount === 0
              ? 'Watch a company'
              : `Watching ${watchedCount} ${watchedCount === 1 ? 'company' : 'companies'}`}
          </Text>
          <Text variant="caption" as="span" style={{ color: 'inherit', opacity: 0.8 }}>
            Add a company board and new postings land here
          </Text>
        </Box>
      </Button>

      <Sheet
        open={watchOpen}
        onOpenChange={setWatchOpen}
        title="Watch a company"
        description={
          watchedCount
            ? `Watching ${watchedCount} company ${watchedCount === 1 ? 'board' : 'boards'} — remove them under Manage this track → Sections & links.`
            : 'Paste a Greenhouse, Lever or Ashby job-board link to pull that company’s openings in.'
        }
        footer={
          <Button variant="primary" onClick={() => setWatchOpen(false)}>
            Done
          </Button>
        }
      >
        <Box
          as="form"
          onSubmit={onWatch}
          sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end' }}
        >
          <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
            <HdsInput
              size="sm"
              label="Company board link"
              placeholder="jobs.ashbyhq.com/company"
              value={watchUrl}
              onChange={(e) => setWatchUrl(e.target.value)}
              style={{ width: '100%' }}
            />
          </Box>
          <Button type="submit" size="sm" variant="secondary" disabled={!watchUrl.trim()}>
            Watch
          </Button>
        </Box>
        {watchError && (
          <Text
            variant="caption"
            as="span"
            role="alert"
            style={{ color: 'var(--semantic-color-feedback-error)' }}
          >
            {watchError}
          </Text>
        )}
      </Sheet>
    </Stack>
  );
}

function PostingRow({
  p,
  now,
  saved,
  onSave,
}: {
  p: RankedPosting;
  now: number;
  saved: boolean;
  onSave: () => void;
}) {
  const meta = [
    p.company,
    p.location,
    p.mode && modeLabel(p.mode),
    postedAgo(p.postedAt, now),
    SOURCE_LABEL[p.source],
  ].filter(Boolean);
  return (
    <li>
      <Card bordered padding="none">
        <Stack gap="tight" style={{ padding: 'var(--semantic-space-scale-xs)' }}>
          <Box sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-start' }}>
            <Text
              variant="ui"
              as="h3"
              style={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}
            >
              <InlineLink href={p.url} externalIcon={false}>
                {p.title}
              </InlineLink>
            </Text>
            <Button
              size="sm"
              variant={saved ? 'tertiary' : 'secondary'}
              disabled={saved}
              onClick={onSave}
              aria-label={saved ? 'Saved' : 'Save'}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
          </Box>
          <Text
            variant="caption"
            as="span"
            style={{ color: 'var(--semantic-color-content-secondary)', overflowWrap: 'anywhere' }}
          >
            {meta.join(' — ')}
          </Text>
          {p.snippet && (
            <Text
              variant="ui"
              style={{
                color: 'var(--semantic-color-content-secondary)',
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {p.snippet}
            </Text>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
            {p.signals.map((s) => (
              <HdsTooltip key={s.id}>
                <HdsTooltip.Trigger asChild>
                  <span tabIndex={0}>
                    <Badge tone={s.id === 'contract' ? 'success' : 'info'}>{s.label}</Badge>
                  </span>
                </HdsTooltip.Trigger>
                <HdsTooltip.Content>Says “{s.evidence}”</HdsTooltip.Content>
              </HdsTooltip>
            ))}
            <Badge tone="neutral">{p.hit === 'title' ? 'In title' : 'In description'}</Badge>
          </Box>
        </Stack>
      </Card>
    </li>
  );
}

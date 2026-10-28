// Review new (simplify 5/9, #386; docs/specs/simplify.md): every undecided design-system posting
// from every source, two ways. Browse (the default) is one list, newest first, to sort and filter;
// tapping a title opens a short preview (details, why it is listed, Save / Skip / Not this company,
// Open posting); "Load more" pages it. Deck is the same postings one card at a time. No fit tiers
// (Adrian 2026-10-28): nothing is held back in a review section. Skip hides that one posting; Not
// this company mutes the company; Save makes a Job and follows its company. Every one of them says
// so with an Undo.
import { useMemo, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Icon,
  InlineLink,
  Pagination,
  SegmentedControl,
  Skeleton,
  Stack,
  Tag,
  Text,
} from '@hirobius/design-system';
import { Banknote, ExternalLink, MapPin, SearchX, type LucideIcon } from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { metaLines } from './metaLines';
import { PostingTitle } from './PostingLink';
import { useBackCloses } from './useBackCloses';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { useRemembered } from './viewMemory';
import { useFeed } from './feed/useFeed';
import {
  FILTER_LABEL,
  SORT_LABEL,
  filterCounts,
  filterRows,
  newTodayLine,
  payLabel,
  sortRows,
  type FeedFilter,
  type FeedRow,
  type FeedSort,
} from './feed/feed';
import { decide, muteCompany, undecide, unmuteCompany } from './feed/decided';
import { followPosting } from './feed/follow';
import { jobFieldsFor } from './feed/toJob';
import { postedAgo } from './feed/format';
import { SOURCE_LABEL } from './feed/types';
import { addJobDetailed } from './store';
import { notifyRemoved, notifySaved, showNotice } from './saveNotice';
import { modeLabel } from './screening';
import { collapseRow } from './feedback';
import type { Source } from './feed/profile';

/** Rows per page of Browse and of Review; Load more adds this many. */
export const REVIEW_PAGE = 25;
const FILTERS: FeedFilter[] = ['new', 'contract', 'founding', 'remote'];
const SORTS: FeedSort[] = ['newest', 'score', 'company'];
type Mode = 'browse' | 'deck';

export default function ReviewView({
  categoryId,
  label = 'New postings',
}: {
  categoryId: string;
  /** The panel's name: "Review new" on Today. */
  label?: string;
}) {
  const feed = useFeed(categoryId);
  const { view } = feed;
  const kept = (k: string) => `review:${categoryId}:${k}`;
  const [mode, setMode] = useRemembered<Mode>(kept('mode'), 'browse');
  const [sort, setSort] = useRemembered<FeedSort>(kept('sort'), 'newest');
  const [on, setOn] = useRemembered<FeedFilter[]>(kept('filters'), []);
  const [shown, setShown] = useRemembered(kept('shown'), REVIEW_PAGE);
  const [card, setCard] = useRemembered(kept('card'), 0);

  const rows = useMemo(() => (view ? sortRows(view.rows, sort) : []), [view, sort]);
  const listed = useMemo(() => filterRows(rows, on), [rows, on]);
  const counts = useMemo(() => filterCounts(view?.rows ?? []), [view]);
  // The open preview, by posting (it closes once its posting leaves the list).
  const [previewFp, setPreviewFp] = useRemembered<string | null>(kept('preview'), null);
  const preview = previewFp ? (view?.rows.find((r) => r.fingerprint === previewFp) ?? null) : null;
  useBackCloses(!!preview, () => setPreviewFp(null), `review-preview:${categoryId}`);

  const toggle = (f: FeedFilter) => {
    setOn((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setShown(REVIEW_PAGE);
    setCard(0);
  };

  const actions = useRowActions(categoryId, feed.sources);
  const line = view ? newTodayLine(view.newToday, view.sourcesRead) : null;

  const caughtUp =
    'Every posting from your sources is saved or skipped. The next scan brings new ones.';
  return (
    <Panel
      label={view ? `${label} (${listed.length})` : label}
      title={label}
      count={view ? listed.length : undefined}
      countLabel={`${listed.length} postings`}
      description={view ? hiddenLine(view.hidden) : undefined}
    >
      <PanelBody>
        <Stack gap="normal">
          <Stack gap="px4">
            <Text variant="body" as="p" role="status" className="rjb-semibold">
              {line ?? (feed.loading ? 'Reading your sources…' : '')}
            </Text>
            {feed.progress && (
              <Text variant="caption" as="p" tone="secondary">
                {`Read ${feed.progress.done} of ${feed.progress.total} boards`}
              </Text>
            )}
            {view && view.failed.length > 0 && (
              <Text variant="caption" as="p" tone="secondary">
                {failedLine(view.failed)}
              </Text>
            )}
          </Stack>
          <Stack direction="row" gap="tight" align="center" wrap="wrap">
            <SegmentedControl
              aria-label="Review view"
              size="sm"
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { value: 'browse', label: 'Browse' },
                { value: 'deck', label: 'Deck' },
              ]}
            />
            {view && mode === 'browse' && (
              <SegmentedControl
                aria-label="Sort postings"
                size="sm"
                value={sort}
                onChange={(v) => {
                  setSort(v as FeedSort);
                  setShown(REVIEW_PAGE);
                }}
                options={SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
              />
            )}
          </Stack>
          {view && (
            <Stack direction="row" wrap="wrap" gap="px8" role="group" aria-label="Filter postings">
              {FILTERS.map((f) => (
                <Tag
                  key={f}
                  active={on.includes(f)}
                  aria-pressed={on.includes(f)}
                  aria-label={`${FILTER_LABEL[f]}, ${counts[f]}`}
                  onClick={() => toggle(f)}
                >
                  <Stack as="span" direction="row" gap="px8" align="center">
                    {FILTER_LABEL[f]}
                    <Badge count={counts[f]} />
                  </Stack>
                </Tag>
              ))}
            </Stack>
          )}
        </Stack>
      </PanelBody>
      {feed.error ? (
        <PanelBody>
          <EmptyState
            centered
            icon={SearchX}
            title="Couldn’t read your sources"
            description={feed.error}
            action={
              <Button variant="secondary" onClick={feed.refresh}>
                Try again
              </Button>
            }
          />
        </PanelBody>
      ) : !view ? (
        feed.loading ? (
          <LoadingRows />
        ) : (
          <PanelBody>
            <EmptyState
              centered
              icon={SearchX}
              title="Nothing to read yet"
              description="Add a design-system title to your profile, or follow a company, and its postings show here."
            />
          </PanelBody>
        )
      ) : mode === 'deck' ? (
        <PanelBody>
          <Deck
            rows={listed}
            at={Math.min(card, Math.max(0, listed.length - 1))}
            onAt={setCard}
            now={feed.at}
            actions={actions}
            empty={caughtUp}
          />
        </PanelBody>
      ) : listed.length ? (
        <RowList
          label="New postings"
          rows={listed}
          shown={shown}
          onMore={() => setShown((n) => n + REVIEW_PAGE)}
          now={feed.at}
          actions={actions}
          onOpen={(r) => setPreviewFp(r.fingerprint)}
        />
      ) : (
        <PanelBody>
          <EmptyState
            centered
            icon={SearchX}
            title={
              on.length
                ? 'Nothing matches these filters'
                : decidedAny(view.hidden)
                  ? 'You’re all caught up'
                  : 'No postings match yet'
            }
            description={
              on.length
                ? 'Turn a filter off to see more.'
                : decidedAny(view.hidden)
                  ? caughtUp
                  : 'No design-system posting from your sources right now. The next scan looks again.'
            }
            action={
              on.length ? (
                <Button variant="secondary" onClick={() => setOn([])}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </PanelBody>
      )}
      <PostingPreview
        r={preview}
        now={feed.at}
        actions={actions}
        onClose={() => setPreviewFp(null)}
      />
    </Panel>
  );
}

const decidedAny = (h: { decided: number; muted: number; saved: number }) =>
  h.decided + h.muted + h.saved > 0;

/** Which sources didn't answer, in one line; one failure in its own words. Remotive's spent daily
 *  budget is not a failure: it says when it comes back. */
function failedLine(failed: { label: string; error?: string }[]): string {
  const name = (s: { label: string }) => s.label.split(' · ')[0];
  const spent = failed.filter((s) => s.error?.includes('daily limit reached'));
  const down = failed.filter((s) => !spent.includes(s));
  return [
    spent.length > 0 &&
      `${spent.map(name).join(', ')}: today's free searches are used up, more tomorrow.`,
    down.length === 1 && down[0].error
      ? `${down[0].error.replace(/ — /g, ': ')} The rest are below.`
      : down.length > 1 &&
        `${down.length} sources didn’t answer: ${down.map(name).join(', ')}. The rest are below.`,
  ]
    .filter(Boolean)
    .join(' ');
}

function hiddenLine(h: {
  saved: number;
  decided: number;
  muted: number;
  include: number;
  exclude: number;
  seniority: number;
  salary: number;
  titles: number;
}): string | undefined {
  const parts = [
    h.saved > 0 && `${h.saved} saved`,
    h.decided > 0 && `${h.decided} skipped`,
    h.muted > 0 && `${h.muted} from muted companies`,
    h.include > 0 && `${h.include} not design-system roles`,
    h.seniority > 0 && `${h.seniority} by level`,
    h.exclude > 0 && `${h.exclude} by words left out`,
    h.salary > 0 && `${h.salary} by pay`,
  ].filter((x): x is string => !!x);
  return parts.length ? `Not shown: ${parts.join(', ')}` : undefined;
}

interface RowActions {
  save: (r: FeedRow, from: Element | null) => void;
  skip: (r: FeedRow, from: Element | null) => void;
  mute: (r: FeedRow, from: Element | null) => void;
}

function useRowActions(categoryId: string, sources: Source[]): RowActions {
  return {
    // The row collapses first, then the job is saved (a saved posting leaves the list).
    save: (r, from) =>
      collapseRow(from, () => {
        const url = addJobDetailed(r.url, jobFieldsFor(r, r.titles.join(', '), 'Review new'));
        if (!url) {
          showNotice({
            title: 'Couldn’t save that posting',
            description: 'Its link isn’t one a job can be saved under. Open it to apply.',
            actions: [],
          });
          return;
        }
        const unfollow = followPosting(r, categoryId, sources);
        notifySaved([url], r.title, [], unfollow);
      }),
    skip: (r, from) =>
      collapseRow(from, () => {
        decide(r, 'skipped');
        notifyRemoved(`Skipped “${r.title}”`, () => undecide(r), 'Only this posting is hidden.');
      }),
    mute: (r, from) =>
      collapseRow(from, () => {
        muteCompany(r.company);
        notifyRemoved(
          `Muted ${r.company}`,
          () => unmuteCompany(r.company),
          'Its postings no longer show in Review new.',
        );
      }),
  };
}

function RowList({
  label,
  rows,
  shown,
  onMore,
  now,
  actions,
  onOpen,
}: {
  label: string;
  rows: FeedRow[];
  shown: number;
  onMore: () => void;
  now: number;
  actions: RowActions;
  onOpen: (r: FeedRow) => void;
}) {
  const left = rows.length - shown;
  return (
    <>
      <CardList label={label}>
        {rows.slice(0, shown).map((r) => (
          <ListCard key={r.fingerprint}>
            <PostingSummary r={r} now={now} onOpen={onOpen} />
            <Box sx={{ pt: 'xs' }}>
              <RowButtons r={r} actions={actions} />
            </Box>
          </ListCard>
        ))}
      </CardList>
      {left > 0 && (
        <PanelBody>
          <Button variant="secondary" onClick={onMore}>
            {`Load more (${left})`}
          </Button>
        </PanelBody>
      )}
    </>
  );
}

function RowButtons({
  r,
  actions,
  big = false,
}: {
  r: FeedRow;
  actions: RowActions;
  big?: boolean;
}) {
  const name = `${r.title}${r.company ? ` at ${r.company}` : ''}`;
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center">
      <Button
        size={big ? 'md' : 'sm'}
        variant={big ? 'primary' : 'secondary'}
        aria-label={`Save ${name}`}
        onClick={(e) => actions.save(r, e.currentTarget)}
      >
        Save
      </Button>
      <Button
        size={big ? 'md' : 'sm'}
        variant={big ? 'secondary' : 'tertiary'}
        aria-label={`Skip ${name}`}
        onClick={(e) => actions.skip(r, e.currentTarget)}
      >
        Skip
      </Button>
      {r.company.trim() && (
        <Button
          size={big ? 'md' : 'sm'}
          variant="tertiary"
          aria-label={`Not this company: ${r.company}`}
          onClick={(e) => actions.mute(r, e.currentTarget)}
        >
          Not this company
        </Button>
      )}
    </Stack>
  );
}

function Fact({ icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <Stack direction="row" gap="px4" align="center">
      <Icon icon={icon} size="small" />
      <Text variant="caption" as="span" tone="secondary">
        {text}
      </Text>
    </Stack>
  );
}

/** One posting (Adrian 2026-10-28): the title as the link into the posting; company, place and
 *  pay; one short line of why it matched; then New, freshness and the source, small. */
function PostingSummary({
  r,
  now,
  onOpen,
  noTitle = false,
}: {
  r: FeedRow;
  now: number;
  /** In a list: the title opens the preview, with Open posting beside it. */
  onOpen?: (r: FeedRow) => void;
  /** The preview names the posting in its own header. */
  noTitle?: boolean;
}) {
  // Remote only (feed/autoScan.ts): a posting that states no work mode is kept, and says so.
  const place = r.remoteUnstated
    ? `${r.location ? `${r.location} · ` : ''}Remote not stated`
    : r.location || (r.mode ? modeLabel(r.mode) : 'Location not stated');
  const pay = payLabel(r);
  const posted = postedAgo(r.postedAt, now);
  const small = [
    posted && (posted === 'today' ? 'Posted today' : `Posted ${posted}`),
    SOURCE_LABEL[r.source],
  ].filter(Boolean);
  return (
    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack gap="px4">
        {noTitle ? null : onOpen ? (
          <PostingTitle url={r.url} title={r.title} company={r.company}>
            <Text variant="body" as="h4" weight="bold" className="rjb-card-title">
              <Button
                variant="tertiary"
                size="sm"
                className="rjb-preview-title"
                aria-haspopup="dialog"
                onClick={() => onOpen(r)}
              >
                {r.title}
              </Button>
            </Text>
          </PostingTitle>
        ) : (
          <Text variant="body" as="h4" weight="bold" className="rjb-card-title">
            <InlineLink href={r.url}>{r.title}</InlineLink>
          </Text>
        )}
        <Stack direction="row" wrap="wrap" gap="tight" align="center">
          {r.company && !noTitle && (
            <Text variant="ui" as="span">
              {r.company}
            </Text>
          )}
          {place && <Fact icon={MapPin} text={place} />}
          {pay && <Fact icon={Banknote} text={pay} />}
        </Stack>
        <Text variant="caption" as="p">
          {r.why}
        </Text>
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          {r.isNew && <Badge tone="info">New</Badge>}
          <Text variant="caption" as="span" tone="secondary">
            {metaLines(small).join(' ')}
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}

/** One card at a time: the posting, then Save, Skip and Not this company. A decided card leaves
 *  the deck, so the next one takes its place. */
function Deck({
  rows,
  at,
  onAt,
  now,
  actions,
  empty,
}: {
  rows: FeedRow[];
  at: number;
  onAt: (n: number) => void;
  now: number;
  actions: RowActions;
  empty: string;
}) {
  if (!rows.length)
    return <EmptyState centered icon={SearchX} title="You’re all caught up" description={empty} />;
  const r = rows[at];
  return (
    <Stack gap="tight">
      <Stack direction="row" gap="tight" align="center" justify="end">
        {rows.length > 1 && (
          <Pagination
            variant="compact"
            label="Postings"
            page={at + 1}
            count={rows.length}
            onPageChange={(p) => onAt(p - 1)}
          />
        )}
      </Stack>
      <Card
        as="article"
        aria-label={r.company ? `${r.title} at ${r.company}` : r.title}
        padding="none"
        className="rjb-card-inset"
      >
        <DeckBody>
          <PostingSummary r={r} now={now} />
          {r.snippet && (
            <Text variant="body" as="p" tone="secondary">
              {r.snippet}
            </Text>
          )}
          <RowButtons r={r} actions={actions} big />
        </DeckBody>
      </Card>
    </Stack>
  );
}

function DeckBody({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ p: 'md' }}>
      <Stack gap="normal">{children}</Stack>
    </Box>
  );
}

function LoadingRows() {
  return (
    <Box aria-busy>
      <CardList hidden>
        {[0, 1, 2].map((i) => (
          <ListCard key={i}>
            <Stack gap="px8">
              <Skeleton width="40%" />
              <Skeleton width="80%" />
              <Skeleton width="60%" />
            </Stack>
          </ListCard>
        ))}
      </CardList>
    </Box>
  );
}

/** The short in-app preview a row's title opens (Adrian 2026-10-28): the posting's details, why it
 *  is listed and a first look at its text, with Save, Skip and Not this company, and Open posting
 *  one tap away. A decision closes it. */
function PostingPreview({
  r,
  now,
  actions,
  onClose,
}: {
  r: FeedRow | null;
  now: number;
  actions: RowActions;
  onClose: () => void;
}) {
  const decided = (run: (row: FeedRow, from: Element | null) => void) => (row: FeedRow) => {
    onClose();
    run(row, null);
  };
  const close: RowActions = {
    save: decided(actions.save),
    skip: decided(actions.skip),
    mute: decided(actions.mute),
  };
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      {r && (
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>{r.title}</Dialog.Title>
            <Dialog.Description>{r.company || SOURCE_LABEL[r.source]}</Dialog.Description>
          </Dialog.Header>
          <Stack gap="normal">
            <PostingSummary r={r} now={now} noTitle />
            {r.text.trim() && (
              <Text variant="body" as="p" tone="secondary">
                {excerpt(r.text)}
              </Text>
            )}
            <Button variant="secondary" iconRight={<Icon icon={ExternalLink} />} asChild>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                Open posting
              </a>
            </Button>
            <RowButtons r={r} actions={close} big />
          </Stack>
        </Dialog.Content>
      )}
    </Dialog>
  );
}

/** The first ~500 characters of a posting's text, cut on a word. */
function excerpt(text: string, max = 500): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)}…`;
}

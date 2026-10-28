// Review new (simplify 5/9, #386; docs/specs/simplify.md): the Feed's undecided postings from every
// source, two ways. Browse (the default) is one list to sort and filter, with each title a link
// into the posting and Save / Skip / Not this company on the row; "Load more" pages it. Deck is
// the same postings one card at a time. The scorer's Review bucket is its own section under
// Browse, never dropped. Skip hides that one posting; Not this company mutes the company; Save
// makes a Job and follows its company. Every one of them says so with an Undo.
import { useMemo, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Icon,
  InlineLink,
  Pagination,
  SegmentedControl,
  Skeleton,
  Stack,
  Tag,
  Text,
} from '@hirobius/design-system';
import { Banknote, MapPin, SearchX, type LucideIcon } from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { metaLines } from './metaLines';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { useRemembered } from './viewMemory';
import { useFeed } from './feed/useFeed';
import { NewCompanies, ScanStatus } from './AutoScanViews';
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
import { decide, muteCompany, undecide, unmuteCompany, useDecided } from './feed/decided';
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
const SORTS: FeedSort[] = ['score', 'newest', 'company'];
type Mode = 'browse' | 'deck';

export default function ReviewView({ categoryId }: { categoryId: string }) {
  const feed = useFeed(categoryId);
  const { view } = feed;
  const kept = (k: string) => `review:${categoryId}:${k}`;
  const [mode, setMode] = useRemembered<Mode>(kept('mode'), 'browse');
  const [sort, setSort] = useRemembered<FeedSort>(kept('sort'), 'score');
  const [on, setOn] = useRemembered<FeedFilter[]>(kept('filters'), []);
  const [shown, setShown] = useRemembered(kept('shown'), REVIEW_PAGE);
  const [reviewShown, setReviewShown] = useRemembered(kept('reviewShown'), REVIEW_PAGE);
  const [card, setCard] = useRemembered(kept('card'), 0);

  const rows = useMemo(() => (view ? sortRows(view.rows, sort) : []), [view, sort]);
  const listed = useMemo(() => filterRows(rows, on), [rows, on]);
  const review = useMemo(
    () => (view ? filterRows(sortRows(view.review, sort), on) : []),
    [view, sort, on],
  );
  const counts = useMemo(
    () => filterCounts([...(view?.rows ?? []), ...(view?.review ?? [])]),
    [view],
  );
  const deck = useMemo(() => [...listed, ...review], [listed, review]);

  const toggle = (f: FeedFilter) => {
    setOn((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setShown(REVIEW_PAGE);
    setCard(0);
  };

  const actions = useRowActions(categoryId, feed.sources);
  const line = view ? newTodayLine(view.newToday, view.sourcesRead) : null;

  return (
    <Stack gap="inset">
      <Stack gap="px4">
        <Text variant="body" as="p" role="status" className="rjb-semibold">
          {line ?? (feed.loading ? 'Reading your sources…' : '')}
        </Text>
        <ScanStatus categoryId={categoryId} />
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
      <NewCompanies categoryId={categoryId} />
      <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
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
      {feed.error ? (
        <EmptyState
          framed
          icon={SearchX}
          title="Couldn’t read your sources"
          description={feed.error}
          action={
            <Button variant="secondary" onClick={feed.refresh}>
              Try again
            </Button>
          }
        />
      ) : !view ? (
        feed.loading ? (
          <LoadingRows />
        ) : (
          <EmptyState
            framed
            icon={SearchX}
            title="Nothing to read yet"
            description="Add a title to the track, or watch a company, and its postings show here."
          />
        )
      ) : mode === 'deck' ? (
        <Deck
          rows={deck}
          reviewFrom={listed.length}
          at={Math.min(card, Math.max(0, deck.length - 1))}
          onAt={setCard}
          now={feed.at}
          actions={actions}
        />
      ) : (
        <>
          <Panel
            label="New postings"
            title="New postings"
            count={listed.length}
            countLabel={`${listed.length} postings`}
            description={hiddenLine(view.hidden)}
          >
            <PanelBody>
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
            </PanelBody>
            {listed.length ? (
              <RowList
                label="New postings"
                rows={listed}
                shown={shown}
                onMore={() => setShown((n) => n + REVIEW_PAGE)}
                now={feed.at}
                actions={actions}
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
                        ? 'Every posting from your sources is saved or skipped. The next scan brings new ones.'
                        : 'Nothing from your sources matches your titles right now. The next scan looks again.'
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
          </Panel>
          {view.review.length > 0 && (
            <Panel
              label="Review"
              title="Review"
              count={review.length}
              countLabel={`${review.length} held for review`}
              description="Held by the scorer: close to what you want, one signal short. Each says why."
            >
              {review.length > 0 && (
                <RowList
                  label="Held for review"
                  rows={review}
                  shown={reviewShown}
                  onMore={() => setReviewShown((n) => n + REVIEW_PAGE)}
                  now={feed.at}
                  actions={actions}
                />
              )}
            </Panel>
          )}
        </>
      )}
      <MutedCompanies />
    </Stack>
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
    h.include > 0 && `${h.include} left out by the profile`,
    h.titles > 0 && `${h.titles} by titles switched off`,
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
}: {
  label: string;
  rows: FeedRow[];
  shown: number;
  onMore: () => void;
  now: number;
  actions: RowActions;
}) {
  const left = rows.length - shown;
  return (
    <>
      <CardList label={label}>
        {rows.slice(0, shown).map((r) => (
          <ListCard key={r.fingerprint}>
            <PostingSummary r={r} now={now} />
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
function PostingSummary({ r, now }: { r: FeedRow; now: number }) {
  // Remote only (feed/autoScan.ts): a posting that states no work mode is kept, and says so.
  const place = r.remoteUnstated
    ? `${r.location ? `${r.location} · ` : ''}Remote not stated`
    : r.location || (r.mode ? modeLabel(r.mode) : '');
  const pay = payLabel(r);
  const posted = postedAgo(r.postedAt, now);
  const small = [
    posted && (posted === 'today' ? 'Posted today' : `Posted ${posted}`),
    SOURCE_LABEL[r.source],
  ].filter(Boolean);
  return (
    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack gap="px4">
        <Text variant="body" as="h4" weight="bold" className="rjb-card-title">
          <InlineLink href={r.url}>{r.title}</InlineLink>
        </Text>
        <Stack direction="row" wrap="wrap" gap="tight" align="center">
          {r.company && (
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
  reviewFrom,
  at,
  onAt,
  now,
  actions,
}: {
  rows: FeedRow[];
  reviewFrom: number;
  at: number;
  onAt: (n: number) => void;
  now: number;
  actions: RowActions;
}) {
  if (!rows.length)
    return (
      <EmptyState
        framed
        icon={SearchX}
        title="You’re all caught up"
        description="Every posting from your sources is saved or skipped. The next scan brings new ones."
      />
    );
  const r = rows[at];
  return (
    <Stack gap="tight">
      <Stack direction="row" gap="tight" align="center" justify="space-between">
        {at >= reviewFrom ? <Badge tone="warning">Review</Badge> : <span />}
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
      >
        <DeckBody>
          <PostingSummary r={r} now={now} />
          {r.reasons && (
            <Text variant="caption" as="p" tone="secondary">
              {r.reasons}
            </Text>
          )}
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
    <Card padding="none" aria-busy>
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
    </Card>
  );
}

/** Companies muted with Not this company, each with Unmute. Only shown when there are some. */
function MutedCompanies() {
  const { muted } = useDecided();
  if (!muted.length) return null;
  return (
    <Panel
      label="Muted companies"
      title="Muted companies"
      count={muted.length}
      countLabel={`${muted.length} muted`}
    >
      <CardList label="Muted companies">
        {muted.map((k) => (
          <ListCard key={k} dense>
            <Stack direction="row" gap="tight" align="center" justify="space-between">
              <Text variant="ui" as="span">
                {k}
              </Text>
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => unmuteCompany(k)}
                aria-label={`Unmute ${k}`}
              >
                Unmute
              </Button>
            </Stack>
          </ListCard>
        ))}
      </CardList>
    </Panel>
  );
}

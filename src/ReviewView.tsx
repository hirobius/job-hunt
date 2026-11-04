// Review new (simplify 5/9, #386; docs/specs/simplify.md): every undecided design-system posting
// from every source, two ways. Browse (the default) is one list, newest first, to sort and filter;
// tapping a title opens a short preview (details, why it is listed, Save / Skip / Not this company,
// Open posting); "Load more" pages it. Deck is the same postings one card at a time. No fit tiers
// (Adrian 2026-10-28): nothing is held back in a review section. Skip hides that one posting; Not
// this company mutes the company; Save makes a Job and follows its company. Every one of them says
// so with an Undo.
import { cleanPlace } from './cleanPlace';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Disclosure,
  Icon,
  InlineLink,
  Menu,
  Pagination,
  SegmentedControl,
  Skeleton,
  Stack,
  Tag,
  Text,
} from '@hirobius/design-system';
import {
  Banknote,
  ChevronDown,
  ExternalLink,
  MapPin,
  SearchX,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { metaLines } from './metaLines';
import { PostingTitle } from './PostingLink';
import { useBackCloses, useBackSheet } from './useBackCloses';
import { ItemList, ItemRow, Panel, PanelBody } from './PipelinePanel';
import { useRemembered } from './viewMemory';
import { useFeed } from './feed/useFeed';
import { ScanStatus } from './AutoScanViews';
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
import { decide, muteCompany, undecide } from './feed/decided';
import { followPosting } from './feed/follow';
import { jobFieldsFor } from './feed/toJob';
import { postedAgo } from './feed/format';
import { SOURCE_LABEL } from './feed/types';
import { addJobDetailed } from './store';
import { notifyRemoved, notifySaved, showNotice } from './saveNotice';
import { modeLabel } from './screening';
import { collapseRow } from './feedback';

/** Rows per page of Browse and of Review; Load more adds this many. */
export const REVIEW_PAGE = 25;
// Two filters (Adrian 2026-10-28): contract and first-hire chips are gone with the fit tiers.
const FILTERS: FeedFilter[] = ['new', 'remote'];
const SORTS: FeedSort[] = ['newest', 'score', 'company'];
type Mode = 'browse' | 'deck';

export default function ReviewView({
  label = 'New postings',
  scanStatus = false,
}: {
  /** The panel's name: "Review new" on Today. */
  label?: string;
  /** Today: the auto-scan's status sits above the panel and says the new and source counts (this
   *  Feed's, so the page has one number); the panel doesn't repeat them. */
  scanStatus?: boolean;
}) {
  const feed = useFeed();
  const { view } = feed;
  const kept = (k: string) => `review:${k}`;
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
  useBackCloses(!!preview, () => setPreviewFp(null), 'review-preview');
  const sortSheet = useBackSheet('review-sort');

  const toggle = (f: FeedFilter) => {
    setOn((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setShown(REVIEW_PAGE);
    setCard(0);
  };

  const actions = rowActions;
  const line = view ? newTodayLine(view.newToday, view.sourcesRead) : null;

  const caughtUp =
    'Every posting from your sources is saved or skipped. The next scan brings new ones.';
  const status = scanStatus && (
    <ScanStatus
      counts={view ? { newToday: view.newToday, sources: view.sourcesRead } : undefined}
    />
  );
  const panel = (
    <Panel
      label={view ? `${label} (${listed.length})` : label}
      title={label}
      count={view ? listed.length : undefined}
      countLabel={`${listed.length} postings`}
      description={view ? hiddenLine(view.hidden) : undefined}
      flat
    >
      <PanelBody>
        <Stack gap="normal">
          <Stack gap="px4">
            <Text variant="body" as="p" role="status" className="rjb-semibold">
              {(scanStatus ? null : line) ?? (feed.loading ? 'Reading your sources…' : '')}
            </Text>
            {feed.progress && (
              <Text variant="caption" as="p" tone="secondary">
                {`Read ${feed.progress.done} of ${feed.progress.total} boards`}
              </Text>
            )}
            {view && view.failed.length > 0 && <Unavailable failed={view.failed} />}
          </Stack>
          {/* One row on a phone: the view toggle, and Sort as a menu (like the Pipeline's). */}
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
            {view && view.rows.length > 0 && mode === 'browse' && (
              <Menu {...sortSheet}>
                <Menu.Trigger asChild>
                  <Button size="sm" variant="secondary" iconRight={<Icon icon={ChevronDown} />}>
                    {`Sort: ${SORT_LABEL[sort]}`}
                  </Button>
                </Menu.Trigger>
                <Menu.Content align="end">
                  <Menu.RadioGroup
                    value={sort}
                    onValueChange={(v) => {
                      setSort(v as FeedSort);
                      setShown(REVIEW_PAGE);
                    }}
                  >
                    {SORTS.map((s) => (
                      <Menu.RadioItem key={s} value={s}>
                        {SORT_LABEL[s]}
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                </Menu.Content>
              </Menu>
            )}
          </Stack>
          {view && view.rows.length > 0 && (
            <Stack direction="row" wrap="wrap" gap="px8" role="group" aria-label="Filter postings">
              {FILTERS.map((f) => (
                <Tag
                  key={f}
                  active={on.includes(f)}
                  aria-pressed={on.includes(f)}
                  // The name says what is shown, label then count (axe label-content-name-mismatch).
                  aria-label={`${FILTER_LABEL[f]} ${counts[f]}`}
                  onClick={() => toggle(f)}
                >
                  <Stack as="span" direction="row" gap="px8" align="center">
                    {FILTER_LABEL[f]} <Badge count={counts[f]} />
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
              description="Follow a company under New companies, or save a job, and its postings show here."
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
  return status ? (
    <Stack gap="normal">
      {status}
      {panel}
    </Stack>
  ) : (
    panel
  );
}

const decidedAny = (h: { decided: number; muted: number; saved: number }) =>
  h.decided + h.muted + h.saved > 0;

/** Sources that didn't answer, as one quiet line ("2 sources unavailable · details") with each
 *  one's reason behind it. Remotive's spent daily budget says when it comes back. */
function Unavailable({ failed }: { failed: { label: string; error?: string }[] }) {
  const n = failed.length;
  // The list is built only while open: offline, every source fails (hundreds of boards), and the
  // panel repaints on each scan tick, so building it closed held the main thread past 300 ms (#212).
  const [open, setOpen] = useState(false);
  const why = (s: { label: string; error?: string }) =>
    s.error?.includes('daily limit reached')
      ? `${s.label.split(' · ')[0]}: today's free searches are used up, more tomorrow.`
      : (s.error?.replace(/ — /g, ': ') ?? `${s.label} didn’t answer.`);
  return (
    <Disclosure
      label={`${n} ${n === 1 ? 'source' : 'sources'} unavailable · details`}
      variant="nav"
      open={open}
      onOpenChange={setOpen}
    >
      <Stack gap="px4">
        {open &&
          failed.map((s) => (
            <Text key={s.label} variant="caption" as="p" tone="secondary">
              {why(s)}
            </Text>
          ))}
        <Text variant="caption" as="p" tone="secondary">
          The rest are listed.
        </Text>
      </Stack>
    </Disclosure>
  );
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

const rowActions: RowActions = {
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
      const unfollow = followPosting(r);
      notifySaved([url], r.title, [], unfollow);
    }),
  skip: (r, from) =>
    collapseRow(from, () => {
      decide(r, 'skipped');
      notifyRemoved(`Skipped “${r.title}”`, () => undecide(r), 'Only this posting is hidden.');
    }),
  mute: (r, from) =>
    collapseRow(from, () => {
      const undo = muteCompany(r.company);
      notifyRemoved(`Muted ${r.company}`, undo, 'Its postings no longer show in Review new.');
    }),
};

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
      <ItemList label={label}>
        {rows.slice(0, shown).map((r) => (
          <ItemRow key={r.fingerprint}>
            <PostingSummary r={r} now={now} onOpen={onOpen} />
            <Box sx={{ pt: 'xs' }}>
              <RowButtons r={r} actions={actions} />
            </Box>
          </ItemRow>
        ))}
      </ItemList>
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
    ? `${cleanPlace(r.location) ? `${cleanPlace(r.location)} · ` : ''}Remote not stated`
    : cleanPlace(r.location) || (r.mode ? modeLabel(r.mode) : 'Location not stated');
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
            <Text variant="body" as="h3" weight="bold" className="rjb-card-title">
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
          <Text variant="body" as="h3" weight="bold" className="rjb-card-title">
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
      <ItemList hidden>
        {[0, 1, 2].map((i) => (
          <ItemRow key={i}>
            <Stack gap="px8">
              <Skeleton width="40%" />
              <Skeleton width="80%" />
              <Skeleton width="60%" />
            </Stack>
          </ItemRow>
        ))}
      </ItemList>
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

// Review new (simplify 5/9, #386; docs/specs/simplify.md): every undecided design-system posting
// from every source, two ways. Browse (the default) is one list, newest first, to sort and filter;
// a title selects the posting (#471 slice 3: `#/find/<fingerprint>`), and the posting shows in the
// right column at lg (details, why it is listed, Save / Skip / Not this company, Open posting), or
// as its own view with Back and a pager below lg. "Load more" pages the list. Deck is the same postings one card at a time. No fit tiers
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
  Disclosure,
  Icon,
  InlineLink,
  Menu,
  Pagination,
  SegmentedControl,
  Sidebar,
  Skeleton,
  Stack,
  Tag,
  Text,
  useAtLeast,
} from '@hirobius/design-system';
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ExternalLink,
  MapPin,
  MousePointerClick,
  SearchX,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { PostingTitle } from './PostingLink';
import { useBackSheet } from './useBackCloses';
import { findHash, postingOf, selectPosting, useRoute, type Route } from './route';
import { inPlaceClick } from './back';
import { tooSoon } from './answerGuard';
import { focusNewHeading, pageHeadingNow } from './focusRescue';
import BackLink from './BackLink';
import { usePageTitle } from './pageTitle';
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
import { usePostingText } from './feed/postingText';

/** Rows per page of Browse and of Review; Load more adds this many. */
export const REVIEW_PAGE = 25;
// Two filters (Adrian 2026-10-28): contract and first-hire chips are gone with the fit tiers.
const FILTERS: FeedFilter[] = ['new', 'remote'];
const SORTS: FeedSort[] = ['newest', 'score', 'company'];
type Mode = 'browse' | 'deck';

const FIND: Route = { tab: 'find', sub: null, pillar: null, jobId: null };

export default function ReviewView({
  label = 'New postings',
  scanStatus = false,
  header,
  before,
  after,
}: {
  /** The panel's name: "Review new" on Find. */
  label?: string;
  /** Find: the auto-scan's status sits above the panel and says the new and source counts (this
   *  Feed's, so the page has one number); the panel doesn't repeat them. */
  scanStatus?: boolean;
  /** The page's head (its h1), shown while no posting is selected: a selected posting's title is
   *  the page's h1 then (#363, as a job's is on Apply). */
  header?: ReactNode;
  /** Find's list column, above and under the list: Daily picks, New companies. */
  before?: ReactNode;
  after?: ReactNode;
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
  // The selected posting is in the route (#/find/<fingerprint>), so a link to it is shareable and
  // survives a reload. Nothing is selected when the tab opens (Adrian 2026-11-05).
  const route = useRoute();
  const selectedFp = postingOf(route);
  const selected = selectedFp
    ? (view?.rows.find((r) => r.fingerprint === selectedFp) ?? null)
    : null;
  const wide = useAtLeast('lg');
  const sortSheet = useBackSheet('review-sort');

  const toggle = (f: FeedFilter) => {
    setOn((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setShown(REVIEW_PAGE);
    setCard(0);
  };

  // A decision on the selected posting moves on to the next one in the list as it shows (in place,
  // before the row leaves), else back to no selection.
  const next = (r: FeedRow) => {
    const at = listed.findIndex((x) => x.fingerprint === r.fingerprint);
    const to = at < 0 ? undefined : (listed[at + 1] ?? listed[at - 1]);
    selectPosting(to && to.fingerprint !== r.fingerprint ? to.fingerprint : null, true);
  };
  // A double tap's second tap lands on the card or posting that took the decided one's place: the
  // same 700 ms guard as Apply's answers (answerGuard.ts).
  const actions = guarded(rowActions);
  const onSelected = (run: (row: FeedRow, from: Element | null) => void) => (row: FeedRow) => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    if (row.fingerprint === selectedFp) next(row);
    run(row, null);
    // Focus goes to the next posting's title, or to Find's heading after the last one.
    focusNewHeading(from);
  };
  const detailActions: RowActions = {
    save: onSelected(rowActions.save),
    skip: onSelected(rowActions.skip),
    mute: onSelected(rowActions.mute),
  };
  // At lg a pick replaces the history entry; below lg the list opens the posting (Back returns).
  const open = (r: FeedRow) => selectPosting(r.fingerprint, wide || !!selectedFp);
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
          onOpen={open}
          selected={selectedFp}
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
    </Panel>
  );
  const list = (
    <Stack gap="px24">
      {!selectedFp && header}
      {before}
      {status ? (
        <Stack gap="normal">
          {status}
          {panel}
        </Stack>
      ) : (
        panel
      )}
      {after}
    </Stack>
  );
  if (!header) return list;
  const detail = (
    <PostingDetail
      key={selected?.fingerprint ?? selectedFp ?? 'none'}
      r={selected}
      waiting={!!selectedFp && !selected && (feed.loading || !view)}
      wide={wide}
      list={listed}
      now={feed.at}
      actions={detailActions}
    />
  );
  // At lg: the list column beside the selected posting ("Pick a posting" until one is picked).
  if (wide)
    return (
      <Sidebar side="start" sideWidth="26rem" contentMin="50%" gap="normal">
        {list}
        {/* Sticky, so a posting picked far down the list shows beside it, not at the page top. */}
        <Box className="rjb-find-detail">{detail}</Box>
      </Sidebar>
    );
  // Below lg: the list is the tab; a selected posting is its own view, with Back and the pager.
  return selectedFp ? detail : list;
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

/** Each action, ignored within the double-tap guard of the one before. */
const guarded = (a: RowActions): RowActions => ({
  save: (r, from) => !tooSoon() && a.save(r, from),
  skip: (r, from) => !tooSoon() && a.skip(r, from),
  mute: (r, from) => !tooSoon() && a.mute(r, from),
});

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

/** Browse (Adrian 2026-11-02, #458): one standalone card per posting, in the reference card
 *  anatomy — the Review panel is flat (no surface of its own), so a card per posting is not a
 *  card within a card (#449). The Pipeline's job rows keep the hairline-row anatomy. */
function RowList({
  label,
  rows,
  shown,
  onMore,
  now,
  actions,
  onOpen,
  selected,
}: {
  label: string;
  rows: FeedRow[];
  shown: number;
  onMore: () => void;
  now: number;
  actions: RowActions;
  onOpen: (r: FeedRow) => void;
  /** The selected posting's fingerprint: its card is marked current. */
  selected: string | null;
}) {
  const left = rows.length - shown;
  return (
    <>
      <Box
        as="ul"
        aria-label={label}
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'sm',
        }}
      >
        {rows.slice(0, shown).map((r) => (
          <Box as="li" key={r.fingerprint}>
            <Card
              as="article"
              padding="none"
              aria-current={r.fingerprint === selected ? 'true' : undefined}
              className={r.fingerprint === selected ? 'rjb-selected' : undefined}
            >
              <Box sx={{ p: 'md' }}>
                <PostingCard r={r} now={now} onOpen={onOpen} actions={actions} />
              </Box>
            </Card>
          </Box>
        ))}
      </Box>
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

function Fact({
  icon,
  text,
  truncate = false,
}: {
  icon: LucideIcon;
  text: string;
  truncate?: boolean;
}) {
  return (
    <Stack direction="row" gap="px4" align="center" className={truncate ? 'min-w-0' : undefined}>
      <Icon icon={icon} size="small" />
      <Text
        variant="caption"
        as="span"
        tone="secondary"
        className={truncate ? 'rjb-truncate min-w-0' : undefined}
      >
        {text}
      </Text>
    </Stack>
  );
}

// Remote only (feed/autoScan.ts): a posting that states no work mode is kept, and says so.
const placeOf = (r: FeedRow) => {
  const where = cleanPlace(r.location);
  return r.remoteUnstated
    ? `${where ? `${where} · ` : ''}Remote not stated`
    : where || (r.mode ? modeLabel(r.mode) : 'Location not stated');
};

/** A posting card's primary action (the reference footer's solid button): Save. */
function SaveAction({ r, actions }: { r: FeedRow; actions: RowActions }) {
  return (
    <Button
      size="md"
      variant="primary"
      aria-label={`Save ${rowName(r)}`}
      onClick={(e) => actions.save(r, e.currentTarget)}
    >
      Save
    </Button>
  );
}

const rowName = (r: FeedRow) => `${r.title}${r.company ? ` at ${r.company}` : ''}`;

/** The decisions that stay quiet under a card's footer: Skip hides this posting, Not this company
 *  mutes the company. Tertiary, so the footer's Save is the one loud action. */
function QuietActions({ r, actions }: { r: FeedRow; actions: RowActions }) {
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center">
      <Button
        size="md"
        variant="tertiary"
        aria-label={`Skip ${rowName(r)}`}
        onClick={(e) => actions.skip(r, e.currentTarget)}
      >
        Skip
      </Button>
      {r.company.trim() && (
        <Button
          size="md"
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

/** The Deck and preview card (#458, Adrian 2026-11-02): a badge row (the source; New only when
 *  the posting is new), the title on the ramp's title step, the company as a subline, the meta
 *  lines with their icons, and a footer with the pay at the left (empty when the source states
 *  none, never invented) and Save at the right. Skip and Not this company sit under it. */
function PostingCard({
  r,
  now,
  onOpen,
  noTitle = false,
  actions,
  children,
}: {
  r: FeedRow;
  now: number;
  /** Browse: the title selects the posting (#/find/<fingerprint>), with Open posting beside it. */
  onOpen?: (r: FeedRow) => void;
  /** The selected posting's view names it in its own header. */
  noTitle?: boolean;
  actions: RowActions;
  /** Extra content above the footer (the Deck's snippet). */
  children?: ReactNode;
}) {
  const place = placeOf(r);
  const pay = payLabel(r);
  const posted = postedAgo(r.postedAt, now);
  const postedLabel = posted && (posted === 'today' ? 'Posted today' : `Posted ${posted}`);
  // The mode is the place line's own fallback; it earns a slot of its own only when a stated
  // location doesn't already say it.
  const modeText = !r.remoteUnstated && r.mode && r.location ? modeLabel(r.mode) : '';
  const saysMode =
    !!modeText &&
    new RegExp(`(^|[^a-z])${modeText.replace(/[^a-z]/gi, '[^a-z]?')}($|[^a-z])`, 'i').test(place);
  const mode = saysMode ? '' : modeText;
  return (
    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack gap="px8">
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          <Badge>{SOURCE_LABEL[r.source]}</Badge>
          {r.isNew && <Badge tone="info">New</Badge>}
        </Stack>
        {noTitle ? null : onOpen ? (
          <PostingTitle url={r.url} title={r.title} company={r.company}>
            <Text variant="title" as="h3" weight="bold" className="rjb-card-title">
              <Button variant="tertiary" size="sm" className="rjb-preview-title" asChild>
                <a href={findHash(r.fingerprint)} onClick={inPlaceClick(() => onOpen(r))}>
                  {r.title}
                </a>
              </Button>
            </Text>
          </PostingTitle>
        ) : (
          <Text variant="title" as="h3" weight="bold" className="rjb-card-title">
            <InlineLink href={r.url}>{r.title}</InlineLink>
          </Text>
        )}
        {r.company && !noTitle && (
          <Text variant="ui" as="p">
            {r.company}
          </Text>
        )}
        <Stack gap="px4">
          {place && <Fact icon={MapPin} text={place} truncate />}
          {(mode || postedLabel) && (
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              {mode && <Fact icon={Briefcase} text={mode} />}
              {postedLabel && <Fact icon={Calendar} text={postedLabel} />}
            </Stack>
          )}
        </Stack>
        <Text variant="caption" as="p">
          {r.why}
        </Text>
        {children}
        <Box sx={{ pt: 'xs' }}>
          <Stack direction="row" gap="tight" align="center" justify="space-between">
            {pay ? (
              <Text variant="title" as="span" weight="bold">
                {pay}
              </Text>
            ) : (
              <span />
            )}
            <SaveAction r={r} actions={actions} />
          </Stack>
        </Box>
        <QuietActions r={r} actions={actions} />
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
          <PostingCard r={r} now={now} actions={actions}>
            {r.snippet && (
              <Text variant="body" as="p" tone="secondary">
                {r.snippet}
              </Text>
            )}
          </PostingCard>
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

/** The selected posting (#471 slice 3; was the preview dialog, Adrian 2026-10-28): its details,
 *  why it is listed and a first look at its text, with Save, Skip and Not this company, and Open
 *  posting one tap away. Its title is the page's h1. At lg it is the right column ("Pick a
 *  posting" until one is picked); below lg its own view, with Back to the list and "‹ 2 of N ›"
 *  over the list as it shows. A decision moves on to the next posting. */
function PostingDetail({
  r,
  waiting,
  wide,
  list,
  now,
  actions,
}: {
  r: FeedRow | null;
  /** A posting is named in the route but the Feed is still reading. */
  waiting: boolean;
  wide: boolean;
  list: FeedRow[];
  now: number;
  actions: RowActions;
}) {
  usePageTitle(r ? r.title : wide ? 'Find' : null);
  // Fetched on open when the list was read without it (a phone, or the server's rows).
  const { text, loading } = usePostingText(r);
  const at = r ? list.findIndex((x) => x.fingerprint === r.fingerprint) : -1;
  const top = !wide && (
    <Stack direction="row" gap="tight" align="center" justify="space-between">
      <BackLink as="button" className="rjb-back" fallback={FIND} fallbackLabel="Find" />
      {at >= 0 && list.length > 1 && (
        <Box sx={{ flex: '0 0 auto' }}>
          <Pagination
            variant="compact"
            label="Postings in the list"
            page={at + 1}
            count={list.length}
            onPageChange={(p) => selectPosting(list[p - 1].fingerprint, true)}
          />
        </Box>
      )}
    </Stack>
  );
  if (!r)
    return (
      <Stack gap="normal">
        {top}
        {waiting ? (
          <Box aria-busy="true">
            <Text variant="ui" as="p" role="status" tone="secondary">
              Reading your sources…
            </Text>
            <Stack gap="normal" aria-hidden="true">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="rectangular" height={120} />
            </Stack>
          </Box>
        ) : (
          <EmptyState
            framed
            icon={MousePointerClick}
            title={wide ? 'Pick a posting' : 'This posting is gone'}
            description={
              wide
                ? 'Its details, Save, Skip and Not this company show here.'
                : 'It was saved, skipped or left the list. Pick another one.'
            }
          />
        )}
      </Stack>
    );
  return (
    <Box as="section" aria-labelledby="rjb-posting-title" sx={{ minWidth: 0 }}>
      <Stack gap="normal">
        {top}
        <Stack gap="px4">
          <Text as="h1" variant="title" id="rjb-posting-title">
            {r.title}
          </Text>
          <Text variant="ui" as="p" tone="secondary">
            {r.company || SOURCE_LABEL[r.source]}
          </Text>
        </Stack>
        <Card as="article" padding="none" aria-label={rowName(r)}>
          <DeckBody>
            <PostingCard r={r} now={now} noTitle actions={actions}>
              {text.trim() ? (
                <Text variant="body" as="p" tone="secondary">
                  {excerpt(text)}
                </Text>
              ) : loading ? (
                <Skeleton variant="text" width="80%" />
              ) : null}
            </PostingCard>
          </DeckBody>
        </Card>
        <Box>
          <Button variant="secondary" iconRight={<Icon icon={ExternalLink} />} asChild>
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              Open posting
            </a>
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

/** The first ~500 characters of a posting's text, cut on a word. */
function excerpt(text: string, max = 500): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)}…`;
}

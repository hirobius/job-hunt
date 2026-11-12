// Review new (simplify 5/9, #386; docs/specs/simplify.md): every undecided design-system posting
// from every source, two ways. Browse (the default) is one list, newest first, to sort and filter;
// a title selects the posting (#471 slice 3: `#/find/<fingerprint>`), and the posting shows in the
// right column at lg (details, why it is listed, Save / Skip / Not this company, Open posting), or
// as its own view with Back and a pager below lg. "Load more" pages the list. Deck is the same postings one card at a time
// (#545): the same card, Skip and Save in the action dock, "1 of N" in Find's caption, a swipe steps; it
// walks the list in the Sort's order (#617). No fit tiers
// (Adrian 2026-10-28): nothing is held back in a review section. Skip hides that one posting; Not
// this company mutes the company; Save makes a Job and follows its company. Every one of them says
// so with an Undo.
import { cleanPlace } from './cleanPlace';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hiddenParts, setScanDetails } from './feed/scanDetails';
import {
  Badge,
  Box,
  Button,
  Card,
  Icon,
  InlineLink,
  Menu,
  Sidebar,
  Skeleton,
  Stack,
  Tag,
  Text,
  Tooltip as HdsTooltip,
  useAtLeast,
  VisuallyHidden,
} from '@hirobius/design-system';
import {
  Briefcase,
  Calendar,
  Ellipsis,
  ExternalLink,
  MapPin,
  MousePointerClick,
  Plus,
  SearchX,
  Layers,
  List,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { ActionDock } from './hds-gaps/ActionDock';
import { SwipeArea } from './SwipeArea';
import './FindDeck.css';
import { useBackSheet } from './useBackCloses';
import { findHash, postingOf, selectPosting, useRoute } from './route';
import { inPlaceClick } from './back';
import { tooSoon } from './answerGuard';
import { focusAsHeading, focusNewHeading, pageHeadingNow } from './focusRescue';
import { usePageTitle } from './pageTitle';
import { ItemList, ItemRow, Panel, PanelBody } from './PipelinePanel';
import { useRemembered } from './viewMemory';
import { useFeed } from './feed/useFeed';
import type { FindSort } from './FindHeader';
import {
  FILTER_LABEL,
  filterCounts,
  filterRows,
  newTodayLine,
  payLabel,
  sortRows,
  type FeedFilter,
  type FeedRow,
  type FeedSort,
} from './feed/feed';
import { companyKey, decide, muteCompany, undecide } from './feed/decided';
import { followPosting } from './feed/follow';
import { jobFieldsFor } from './feed/toJob';
import { postedAgo } from './feed/format';
import { SOURCE_LABEL } from './feed/types';
import { addJobDetailed } from './store';
import { alreadyInApply, notifyRemoved, notifySaved, showNotice } from './saveNotice';
import { modeLabel } from './screening';
import { collapseRow } from './feedback';
import { usePostingText } from './feed/postingText';
import { httpUrl } from './httpUrl';

/** Rows per page of Browse and of Review; Load more adds this many. */
export const REVIEW_PAGE = 25;
// Two filters (Adrian 2026-10-28): contract and first-hire chips are gone with the fit tiers.
const FILTERS: FeedFilter[] = ['new', 'remote'];
type Mode = 'browse' | 'deck';
const VIEW_TOGGLE: { value: Mode; label: string; icon: LucideIcon }[] = [
  { value: 'browse', label: 'Browse', icon: List },
  { value: 'deck', label: 'Deck', icon: Layers },
];

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
   *  the page's h1 then (#363, as a job's is on Apply). Find passes a function and gets what its
   *  short header shows (#544): the new count, the sort, whether a posting is selected and the
   *  Deck's place ("1 of 4", #545; null outside the Deck). */
  header?: ReactNode | ((tools: FindTools) => ReactNode);
  /** Find's list column, above and under the list: Daily picks, New companies. */
  before?: ReactNode;
  after?: ReactNode;
}) {
  const feed = useFeed();
  const { view } = feed;
  // The Account menu's Scan details read what this view last read (Adrian 2026-11-08).
  useEffect(() => {
    if (!view) return;
    setScanDetails({
      failed: view.failed,
      hidden: hiddenParts(view.hidden),
      newToday: view.newToday,
      sourcesRead: view.sourcesRead,
    });
  }, [view]);
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
  // Below lg there is no posting page (Adrian 2026-11-08): an old #/find/<fingerprint> link opens
  // Find with that card scrolled into view, and the route drops it.
  const [linked, setLinked] = useState<string | null>(null);
  if (!wide && selectedFp && linked !== selectedFp) setLinked(selectedFp);
  useEffect(() => {
    if (!wide && selectedFp) selectPosting(null, true);
  }, [wide, selectedFp]);

  // The Deck's card (#545), and where it sits in the list as it shows ("1 of 4" in Find's caption).
  const deckAt = Math.min(card, Math.max(0, listed.length - 1));
  const deckPlace =
    view && mode === 'deck' && listed.length ? `${deckAt + 1} of ${listed.length}` : null;
  // A new sort reorders the Deck too (#617), and keeps the card on screen where it moved to.
  const changeSort = (to: FeedSort) => {
    const current = listed[deckAt]?.fingerprint;
    setSort(to);
    setShown(REVIEW_PAGE);
    if (!view || !current) return;
    const at = filterRows(sortRows(view.rows, to), on).findIndex((x) => x.fingerprint === current);
    setCard(Math.max(0, at));
  };

  const toggle = (f: FeedFilter) => {
    setOn((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
    setShown(REVIEW_PAGE);
    setCard(0);
  };

  // A decision that takes the selected posting away (its own, from the detail or its list card, or
  // Not this company on another card of its company) moves on to the next one in the list as it
  // shows (in place, before the row leaves), else back to no selection.
  const moveOff = (gone: (x: FeedRow) => boolean) => {
    const at = listed.findIndex((x) => x.fingerprint === selectedFp);
    if (at < 0 || !gone(listed[at])) return;
    const to =
      listed.slice(at + 1).find((x) => !gone(x)) ??
      [...listed.slice(0, at)].reverse().find((x) => !gone(x));
    selectPosting(to?.fingerprint ?? null, true);
  };
  const goneWith = (r: FeedRow, mute: boolean) => (x: FeedRow) =>
    x.fingerprint === r.fingerprint ||
    (mute && !!companyKey(r.company) && companyKey(x.company) === companyKey(r.company));
  const next = (r: FeedRow, mute = false) => moveOff(goneWith(r, mute));
  // A double tap's second tap lands on the card or posting that took the decided one's place: the
  // same 700 ms guard as Apply's answers (answerGuard.ts).
  // A list card's decision (#471 slice 3 follow-up): at lg the selected posting's own card is in the
  // list, so a decision there must not leave the gone posting in the route ("Pick a posting").
  const onCard =
    (run: (row: FeedRow, from: Element | null) => void, mute = false) =>
    (row: FeedRow, from: Element | null) => {
      if (tooSoon()) return;
      if (selectedFp) next(row, mute);
      focusNextTitle(from);
      run(row, from);
    };
  const actions: RowActions = {
    save: onCard(rowActions.save),
    skip: onCard(rowActions.skip),
    mute: onCard(rowActions.mute, true),
  };
  const onSelected = (run: (row: FeedRow, from: Element | null) => void) => (row: FeedRow) => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    if (row.fingerprint === selectedFp) next(row, run === rowActions.mute);
    run(row, null);
    // Focus goes to the next posting's title, or to Find's heading after the last one.
    focusNewHeading(from);
  };
  const detailActions: RowActions = {
    save: onSelected(rowActions.save),
    skip: onSelected(rowActions.skip),
    mute: onSelected(rowActions.mute),
  };
  // At lg a pick in the list column replaces the history entry.
  const open = (r: FeedRow) => selectPosting(r.fingerprint, true);
  const line = view ? newTodayLine(view.newToday, view.sourcesRead) : null;

  const caughtUp =
    'Every posting from your sources is saved or skipped. The next scan brings new ones.';
  // Sort, Scan now and Search profile are the header's one More menu (#544).
  const sortTool: FindSort | null =
    view && view.rows.length > 0 ? { value: sort, onChange: changeSort } : null;
  const panel = (
    <Panel
      label={view ? `${label} (${listed.length})` : label}
      title={label}
      count={view ? listed.length : undefined}
      countLabel={`${listed.length} postings`}
      flat
    >
      <PanelBody>
        <Stack gap="normal">
          {/* No status text above Browse / Deck (Adrian 2026-11-08): the source health and the "not
              shown" counts are the Account menu's Scan details. Screen readers still hear progress. */}
          <VisuallyHidden as="p" role="status">
            {(scanStatus ? null : line) ?? (feed.loading ? 'Reading your sources…' : '')}
          </VisuallyHidden>
          {/* The view toggle. Sort is the header's More menu (#544); it orders the Deck too (#617). */}
          <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
            {/* Browse | Deck as two icon-only toggle buttons (Adrian 2026-11-09): HDS SegmentedControl
                takes text labels only, so an HDS icon Button pair with aria-pressed, each named and
                with a tooltip; the pressed one is the secondary (filled) button. */}
            <Stack direction="row" gap="hairline" role="group" aria-label="Review view">
              {VIEW_TOGGLE.map(({ value, label: name, icon }) => (
                <HdsTooltip key={value}>
                  <HdsTooltip.Trigger asChild>
                    <Button
                      size="sm"
                      variant={mode === value ? 'secondary' : 'tertiary'}
                      iconOnly
                      label={name}
                      aria-label={name}
                      aria-pressed={mode === value}
                      onClick={() => setMode(value)}
                      iconLeft={<Icon icon={icon} />}
                    />
                  </HdsTooltip.Trigger>
                  <HdsTooltip.Content>{name}</HdsTooltip.Content>
                </HdsTooltip>
              ))}
            </Stack>
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
            at={deckAt}
            onAt={setCard}
            docked={!wide}
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
          onOpen={wide ? open : undefined}
          linked={wide ? null : linked}
          selected={selectedFp}
        />
      ) : (
        <EmptySection>
          <EmptyState
            framed
            icon={SearchX}
            titleId={EMPTY_TITLE_ID}
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
        </EmptySection>
      )}
    </Panel>
  );
  const head =
    typeof header === 'function'
      ? header({
          newCount: view ? counts.new : null,
          sort: sortTool,
          selected: !!selectedFp,
          deckPlace,
        })
      : !selectedFp && header;
  const list = (
    <Stack gap="px24">
      {head}
      {before}
      {panel}
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
  // Below lg: the list is the tab; a card's title is the link out (no posting page).
  return list;
}

const EMPTY_TITLE_ID = 'rjb-review-empty-title';

/** What Find's short header shows (#544). */
export interface FindTools {
  newCount: number | null;
  sort: FindSort | null;
  /** A posting is selected (at lg its title is the page's h1). */
  selected: boolean;
  /** The Deck's place, "1 of 4" (#545); null outside the Deck. */
  deckPlace: string | null;
}

/** After a decision on a Browse card, focus goes to the title of the card that takes its place
 *  (the next one, else the one before), else the empty state's title, once the decided card has
 *  left the list. */
function focusNextTitle(from: Element | null) {
  const li = from?.closest('li');
  const target = (li?.nextElementSibling ?? li?.previousElementSibling)?.querySelector<HTMLElement>(
    'h3',
  );
  if (!li) return;
  let frames = 120;
  const tick = () => {
    if (!li.isConnected) {
      // The last card left: the empty state's title takes focus (#508 review).
      const to = target?.isConnected ? target : document.getElementById(EMPTY_TITLE_ID);
      if (to) focusAsHeading(to);
      return;
    }
    if (frames-- > 0) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Review new's empty states (Adrian 2026-11-08): their own section under the toolbar, a hairline
 *  above and room around it, like the Apply list's (TrackerView), with the framed teaching empty
 *  (icon tile, centred text) of Apply's "Track your first job". */
function EmptySection({ children }: { children: ReactNode }) {
  return (
    <Box
      as="section"
      aria-label="No postings"
      data-empty-section=""
      sx={{ borderTop: 'thin solid', borderColor: 'border.default', py: 'lg' }}
    >
      <PanelBody>{children}</PanelBody>
    </Box>
  );
}

const decidedAny = (h: { decided: number; muted: number; saved: number }) =>
  h.decided + h.muted + h.saved > 0;

interface RowActions {
  save: (r: FeedRow, from: Element | null) => void;
  skip: (r: FeedRow, from: Element | null) => void;
  mute: (r: FeedRow, from: Element | null) => void;
}

const rowActions: RowActions = {
  // The row collapses first, then the job is saved (a saved posting leaves the list).
  save: (r, from) =>
    collapseRow(from, () => {
      // A double Save (or a Save on a second surface) is a no-op, with no second toast (#534).
      if (alreadyInApply(r.url)) return;
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
      notifyRemoved(`Muted ${r.company}`, undo, 'Its postings no longer show in Review on Find.');
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
  linked = null,
}: {
  label: string;
  rows: FeedRow[];
  shown: number;
  onMore: () => void;
  now: number;
  actions: RowActions;
  /** At lg: a title selects the posting for the detail column. Below lg: none (no posting page). */
  onOpen?: (r: FeedRow) => void;
  /** The selected posting's fingerprint: its card is marked current. */
  selected: string | null;
  /** Below lg, an old #/find/<fingerprint> link's posting: scrolled into view. */
  linked?: string | null;
}) {
  const linkedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    linkedRef.current?.scrollIntoView({ block: 'start' });
  }, [linked]);
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
          <Box as="li" key={r.fingerprint} ref={r.fingerprint === linked ? linkedRef : undefined}>
            <Card
              as="article"
              padding="none"
              aria-label={rowName(r)}
              aria-current={r.fingerprint === selected ? 'true' : undefined}
              className={r.fingerprint === selected ? 'rjb-selected' : undefined}
            >
              <Box sx={{ p: 'sm' }}>
                <PostingCard r={r} now={now} onOpen={onOpen} compact actions={actions} />
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

// One fact per line, in one order on every card (#616, Adrian 2026-11-12): the place, the work mode,
// the posted day. The place never carries the mode, so the mode shows once, on its own line.
// A place that is only a work mode ("Remote") is no place: the mode line says it.
const ONLY_MODE = /^(remote|hybrid|on[\s-]?site|in[\s-]?office)$/i;
const placeOf = (r: FeedRow) => {
  const where = cleanPlace(r.location);
  return where && !ONLY_MODE.test(where) ? where : 'Location not stated';
};
// Remote only (feed/autoScan.ts): a posting that states no work mode is kept, and says so.
const modeOf = (r: FeedRow) =>
  r.remoteUnstated ? 'Remote not stated' : r.mode ? modeLabel(r.mode) : 'Work mode not stated';

const rowName = (r: FeedRow) => `${r.title}${r.company ? ` at ${r.company}` : ''}`;

/** A posting's one action row (Adrian 2026-11-08): left-aligned, one HDS size, Save primary, Skip
 *  secondary, Open posting as an icon button, and More (…) holding Not this company. The same row
 *  on a Browse card, the Deck and the selected posting. */
function PostingActions({
  r,
  actions,
  decide = true,
  openKey = true,
}: {
  r: FeedRow;
  actions: RowActions;
  /** False in the Deck (#545): Save and Skip sit in the action dock; the card keeps More. */
  decide?: boolean;
  /** The Open posting key; a compact Browse card has none (its title is the way in, #544). */
  openKey?: boolean;
}) {
  // Not this company is picked in the menu (a portal): its feedback anchors on the row's trigger.
  const more = useRef<HTMLButtonElement>(null);
  const sheet = useBackSheet(`posting-more:${r.fingerprint}`);
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center">
      {decide && (
        <>
          <SaveKey r={r} actions={actions} />
          <SkipKey r={r} actions={actions} />
        </>
      )}
      {decide && openKey && httpUrl(r.url) && (
        <HdsTooltip>
          <HdsTooltip.Trigger asChild>
            <Button
              size="md"
              variant="secondary"
              iconOnly
              label={`Open posting for ${rowName(r)}`}
              asChild
            >
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open posting for ${rowName(r)}`}
              >
                <Icon icon={ExternalLink} />
              </a>
            </Button>
          </HdsTooltip.Trigger>
          <HdsTooltip.Content>Open posting</HdsTooltip.Content>
        </HdsTooltip>
      )}
      {r.company.trim() && (
        <Menu modal={false} {...sheet}>
          <Menu.Trigger asChild>
            <Button
              ref={more}
              size="md"
              variant="secondary"
              iconOnly
              iconLeft={<Icon icon={Ellipsis} />}
              label={`More actions: ${rowName(r)}`}
            />
          </Menu.Trigger>
          <Menu.Content align="start">
            <Menu.Item onSelect={() => actions.mute(r, more.current)}>
              {`Not this company: ${r.company}`}
            </Menu.Item>
          </Menu.Content>
        </Menu>
      )}
    </Stack>
  );
}

/** Save, the filled key, and Skip, the grey key: on a card's action row, or in the Deck's dock
 *  (#545), where `from` is the Deck's card so it collapses as it goes. */
function SaveKey({
  r,
  actions,
  from,
}: {
  r: FeedRow;
  actions: RowActions;
  from?: () => Element | null;
}) {
  return (
    <Button
      size="md"
      variant="primary"
      aria-label={`Save ${rowName(r)}`}
      onClick={(e) => actions.save(r, from ? from() : e.currentTarget)}
    >
      <Icon icon={Plus} />
      Save
    </Button>
  );
}

function SkipKey({
  r,
  actions,
  from,
}: {
  r: FeedRow;
  actions: RowActions;
  from?: () => Element | null;
}) {
  return (
    <Button
      size="md"
      variant="secondary"
      aria-label={`Skip ${rowName(r)}`}
      onClick={(e) => actions.skip(r, from ? from() : e.currentTarget)}
    >
      Skip
    </Button>
  );
}

/** A posting card (#458, Adrian 2026-11-02; actions 2026-11-08): a badge row (the source; New only
 *  when the posting is new), the title on the ramp's title step, the company as a subline, the
 *  meta lines with their icons, the pay when the source states it (never invented), then one
 *  left-aligned action row (PostingActions). A compact Browse card (#544, redesign §5.1) is the
 *  title (bold body, 3 lines at most; it opens the posting), the company, the facts, the pay, then
 *  Save, Skip and More: no badges, no description row and no Open posting key. */
function PostingCard({
  r,
  now,
  onOpen,
  noTitle = false,
  compact = false,
  decide = true,
  actions,
  children,
}: {
  r: FeedRow;
  now: number;
  /** At lg, Browse: the title selects the posting (#/find/<fingerprint>) for the detail column. */
  onOpen?: (r: FeedRow) => void;
  /** The selected posting's view names it in its own header. */
  noTitle?: boolean;
  /** A Browse card (#544): three cards and part of a fourth fit on a phone. */
  compact?: boolean;
  /** False in the Deck (#545): Save and Skip are in the action dock. */
  decide?: boolean;
  actions: RowActions;
  /** Extra content above the footer (the Deck's excerpt). */
  children?: ReactNode;
}) {
  const pay = payLabel(r);
  const posted = postedAgo(r.postedAt, now);
  const postedLabel = posted && (posted === 'today' ? 'Posted today' : `Posted ${posted}`);
  return (
    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack gap="px8">
        {!compact && (
          <Stack direction="row" wrap="wrap" gap="px8" align="center">
            <Badge>{SOURCE_LABEL[r.source]}</Badge>
            {r.isNew && <Badge tone="info">New</Badge>}
          </Stack>
        )}
        {noTitle ? null : compact ? (
          // Takes focus after a decision on the card before it (no ring: focusAsHeading).
          <Text variant="body" as="h3" weight="bold" lineClamp={3} tabIndex={-1}>
            <CardTitleLink r={r} onOpen={onOpen} />
          </Text>
        ) : (
          <Text variant="title" as="h3" weight="bold" tabIndex={-1}>
            {r.title}
          </Text>
        )}
        {r.company && !noTitle && (
          <Text variant="ui" as="p">
            {r.company}
          </Text>
        )}
        <Stack gap="px4">
          <Fact icon={MapPin} text={placeOf(r)} truncate />
          <Fact icon={Briefcase} text={modeOf(r)} />
          {postedLabel && <Fact icon={Calendar} text={postedLabel} />}
        </Stack>
        {pay && (
          <Text variant="body" as="p" weight="bold">
            {pay}
          </Text>
        )}
        {children}
        <Box sx={{ pt: compact ? undefined : 'xs' }}>
          <PostingActions r={r} actions={actions} decide={decide} openKey={!compact} />
        </Box>
      </Stack>
    </Box>
  );
}

/** A compact card's title opens the posting (#544): at lg it selects it for the detail column
 *  (in place); below lg, with no posting page, it is the link out to the posting itself. */
function CardTitleLink({ r, onOpen }: { r: FeedRow; onOpen?: (r: FeedRow) => void }) {
  if (onOpen)
    return (
      // A click on the link bubbles here: in place, the list keeps its history entry.
      <span onClick={inPlaceClick(() => onOpen(r))}>
        <InlineLink href={findHash(r.fingerprint)} externalIcon={false}>
          <span>{r.title}</span>
        </InlineLink>
      </span>
    );
  // The title in its own span, so it reads as one text beside the link's "opens in new tab".
  return httpUrl(r.url) ? (
    <InlineLink href={r.url}>
      <span>{r.title}</span>
    </InlineLink>
  ) : (
    <>{r.title}</>
  );
}

/** One card at a time (#545): the same posting card, its text at once (7 lines) with "Read the
 *  full posting", More on the card for Not this company, and Skip (grey) and Save (filled, right)
 *  in the action dock (inline under the card at lg). "1 of N" is Find's caption, not a pager row;
 *  a sideways swipe, or the arrow keys on the card, steps it. A decided card leaves the deck, so
 *  the next one takes its place. */
function Deck({
  rows,
  at,
  onAt,
  docked,
  now,
  actions,
  empty,
}: {
  rows: FeedRow[];
  at: number;
  onAt: (n: number) => void;
  /** Below lg: the keys dock at the bottom of the screen. */
  docked: boolean;
  now: number;
  actions: RowActions;
  empty: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  if (!rows.length)
    return (
      <EmptySection>
        <EmptyState
          framed
          icon={SearchX}
          titleId={EMPTY_TITLE_ID}
          title="You’re all caught up"
          description={empty}
        />
      </EmptySection>
    );
  const r = rows[at];
  const step = (d: -1 | 1) => {
    const to = at + d;
    if (to >= 0 && to < rows.length) onAt(to);
  };
  const from = () => cardRef.current;
  return (
    <Stack gap="normal">
      <SwipeArea onPrev={() => step(-1)} onNext={() => step(1)}>
        <Card
          ref={cardRef}
          as="article"
          aria-label={rowName(r)}
          padding="none"
          onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if ((e.target as Element).closest('input, textarea, [role="menu"]')) return;
            e.preventDefault();
            step(e.key === 'ArrowLeft' ? -1 : 1);
          }}
        >
          <DeckBody>
            <PostingCard r={r} now={now} actions={actions} decide={false}>
              <DeckExcerpt r={r} />
            </PostingCard>
          </DeckBody>
        </Card>
      </SwipeArea>
      <ActionDock docked={docked} row label={`Actions for ${rowName(r)}`}>
        <SkipKey r={r} actions={actions} from={from} />
        <SaveKey r={r} actions={actions} from={from} />
      </ActionDock>
    </Stack>
  );
}

/** The Deck's excerpt (#545): the posting's text at once, cut at 7 lines, then "Read the full
 *  posting" (the posting itself, in a new tab). No disclosure. */
function DeckExcerpt({ r }: { r: FeedRow }) {
  const { text, loading } = usePostingText(r);
  const body = text.trim() ? excerpt(text, 1200) : r.snippet;
  const link = httpUrl(r.url);
  return (
    <Stack gap="px8">
      {body ? (
        <Text variant="body" as="p" tone="secondary" className="rjb-deck-excerpt">
          {body}
        </Text>
      ) : loading ? (
        <Stack gap="px8" aria-busy="true">
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="70%" />
        </Stack>
      ) : null}
      {link && (
        <Text as="p" variant="ui">
          <InlineLink href={r.url} standalone size="sm">
            Read the full posting
          </InlineLink>
        </Text>
      )}
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
  now,
  actions,
}: {
  r: FeedRow | null;
  /** A posting is named in the route but the Feed is still reading. */
  waiting: boolean;
  wide: boolean;
  now: number;
  actions: RowActions;
}) {
  usePageTitle(r ? r.title : wide ? 'Find' : null);
  // Fetched on open when the list was read without it (a phone, or the server's rows).
  const { text, loading } = usePostingText(r);
  if (!r)
    return (
      <Stack gap="normal">
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

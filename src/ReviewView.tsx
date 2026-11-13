// Review new (simplify 5/9, #386; docs/specs/simplify.md): every undecided design-system posting
// from every source, as one list, newest first (it follows the Search profile's work mode);
// a title selects the posting (#471 slice 3: `#/find/<fingerprint>`), and the posting shows in the
// right column at lg (details, Save / Skip / Not this company, Open posting; ↑ / ↓ move the
// selection). Below lg the list is the tab, with a "‹ › 1 of N" pager that steps a current card
// (Adrian 2026-11-13: list only, no view switch and no filter row). No fit tiers
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
  Text,
  Tooltip as HdsTooltip,
  useAtLeast,
  VisuallyHidden,
} from '@hirobius/design-system';
import {
  Banknote,
  Briefcase,
  Calendar,
  Ellipsis,
  ExternalLink,
  MapPin,
  MousePointerClick,
  Plus,
  SearchX,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import './FindList.css';
import { useBackSheet } from './useBackCloses';
import { findHash, getRoute, postingOf, selectPosting, useRoute } from './route';
import { inPlaceClick } from './back';
import { tooSoon } from './answerGuard';
import { focusAsHeading, focusNewHeading, pageHeadingNow } from './focusRescue';
import { usePageTitle } from './pageTitle';
import { ItemList, ItemRow, Panel, PanelBody } from './PipelinePanel';
import { useRemembered } from './viewMemory';
import { useFeed } from './feed/useFeed';
import { useAutoLoad } from './autoLoad';
import { spacerRef, useWindowedList } from './useWindowedList';
import { placeSaysRemote } from './feed/placeRemote';
import { capsToSentence } from './feed/capsCase';
import CompanyLogo from './CompanyLogo';
import { NoResultsKeys } from './AutoScanViews';
import { filterCounts, newTodayLine, payLabel, sortRows, type FeedRow } from './feed/feed';
import { companyKey, decide, muteCompany, undecide } from './feed/decided';
import { followPosting } from './feed/follow';
import { jobFieldsFor } from './feed/toJob';
import { postedAgo } from './feed/format';
import { SOURCE_LABEL } from './feed/types';
import { addJobDetailed } from './store';
import { alreadyInApply, notifyRemoved, notifySaved, showNotice } from './saveNotice';
import { modeLabel } from './screening';
import { collapseRow } from './feedback';
import { saveRow } from './saveFlight';
import { usePostingText } from './feed/postingText';
import { httpUrl } from './httpUrl';
import { DetailHeader, DetailTitleBlock } from './DetailHeader';
import { FactLines } from './hds-gaps/FactLines';

/** Rows per page of Browse and of Review; Load more adds this many. */
export const REVIEW_PAGE = 25;

/** ↑ / ↓ at lg leave these alone: a text field, a select, a menu or a dialog has its own keys. */
const KEY_OWNERS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"], [role="menuitem"], [role="listbox"], [role="dialog"]';

export default function ReviewView({
  label = 'New postings',
  scanStatus = false,
  header,
  before,
}: {
  /** The panel's name: "Review new" on Find. */
  label?: string;
  /** Find: the auto-scan's status sits above the panel and says the new and source counts (this
   *  Feed's, so the page has one number); the panel doesn't repeat them. */
  scanStatus?: boolean;
  /** The page's head (its h1), shown while no posting is selected: a selected posting's title is
   *  the page's h1 then (#363, as a job's is on Apply). Find passes a function and gets what its
   *  short header shows (#544): the new count and whether a posting is selected. */
  header?: ReactNode | ((tools: FindTools) => ReactNode);
  /** Find's list column, above the list: Daily picks. */
  before?: ReactNode;
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
  // No filters on Review (Adrian 2026-11-13): it follows the Search profile's work mode only
  // (remote by default); an older remembered New or Remote filter is not read.
  const [shown, setShown] = useRemembered(kept('shown'), REVIEW_PAGE);

  // Newest first, always (Adrian 2026-11-13: no Sort on Find; an older remembered sort is not read).
  const rows = useMemo(() => (view ? sortRows(view.rows, 'newest') : []), [view]);
  const listed = rows;
  const counts = useMemo(() => filterCounts(view?.rows ?? []), [view]);
  // The selected posting is in the route (#/find/<fingerprint>), so a link to it is shareable and
  // survives a reload. At lg Browse opens on the first posting, as Apply opens on its first job
  // (Adrian 2026-11-12, #546); below lg nothing is selected (no posting page).
  const route = useRoute();
  const selectedFp = postingOf(route);
  const selected = selectedFp
    ? (view?.rows.find((r) => r.fingerprint === selectedFp) ?? null)
    : null;
  const wide = useAtLeast('lg');
  // Below lg there is no posting page (Adrian 2026-11-08): an old #/find/<fingerprint> link opens
  // Find with that card scrolled into view, and the route drops it.
  const [linked, setLinked] = useState<string | null>(null);
  // "Loaded N more" after the Browse list pages (2026-11-12), said by the polite status below.
  const [loadedMore, setLoadedMore] = useState('');
  if (!wide && selectedFp && linked !== selectedFp) setLinked(selectedFp);
  useEffect(() => {
    if (!wide && selectedFp) selectPosting(null, true);
  }, [wide, selectedFp]);
  // At lg, with nothing selected the list's first posting is selected, in place (#546), so the
  // detail column is never empty.
  // A decided posting stays in the list while its card collapses: it is never picked again.
  const columns = wide && !!header;
  const alone = !selectedFp && !!view && !listed.length;
  // Kept with the list it was decided on: once the list changes the card has left it.
  const [deciding, setDeciding] = useState<{ on: FeedRow[]; gone: FeedRow[]; mute: boolean[] }>({
    on: [],
    gone: [],
    mute: [],
  });
  // Never under a dialog on the route (Documents, Privacy and terms): a new page would close it.
  const dialogOpen = route.documents != null || route.legal != null;
  useEffect(() => {
    if (!columns || dialogOpen || selectedFp) return;
    const gone = deciding.on === listed ? deciding.gone : [];
    const first = listed.find((x) => !gone.some((g, i) => goneWith(g, deciding.mute[i])(x)));
    if (first) selectPosting(first.fingerprint, true);
  }, [columns, dialogOpen, selectedFp, listed, deciding]);

  // ↑ / ↓ at lg move the selection through the list as it shows (in place), and its card scrolls
  // into view. Never while a text field, a menu or a dialog holds focus.
  const listedRef = useRef(listed);
  useEffect(() => {
    listedRef.current = listed;
  }, [listed]);
  useEffect(() => {
    if (!columns) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as Element | null;
      if (t?.closest?.(KEY_OWNERS)) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      const rows = listedRef.current;
      const fp = postingOf(getRoute());
      const at = rows.findIndex((x) => x.fingerprint === fp);
      const to = rows[at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!to) return;
      e.preventDefault();
      selectPosting(to.fingerprint, true);
      requestAnimationFrame(() => cardEl(to.fingerprint)?.scrollIntoView({ block: 'nearest' }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [columns]);

  // Below lg (Adrian 2026-11-13): "‹ › 1 of N" steps a current card through the list. An arrow
  // scrolls its card to the top and focuses its title; scrolling moves the current card with it
  // (the first card whose bottom is past a quarter of the screen), so the count stays true.
  const [cur, setCur] = useState<{ fp: string | null; at: number }>({ fp: null, at: 0 });
  const curFound = cur.fp ? listed.findIndex((x) => x.fingerprint === cur.fp) : -1;
  const curAt = listed.length
    ? curFound >= 0
      ? curFound
      : Math.min(cur.at, listed.length - 1)
    : 0;
  const stepping = useRef(0);
  const step = (d: -1 | 1) => {
    const to = listed[curAt + d];
    if (!to) return;
    stepping.current = Date.now();
    setCur({ fp: to.fingerprint, at: curAt + d });
    let frames = 30;
    const tick = () => {
      const el = cardEl(to.fingerprint);
      if (!el) {
        if (frames-- > 0) requestAnimationFrame(tick);
        return;
      }
      stepping.current = Date.now();
      el.scrollIntoView({ block: 'start' });
      const title = el.querySelector<HTMLElement>('h3');
      if (title) focusAsHeading(title);
    };
    requestAnimationFrame(tick);
  };
  const pager = !wide && !!view && listed.length > 0 && !feed.error;
  useEffect(() => {
    if (!pager) return;
    let raf = 0;
    const follow = () => {
      raf = 0;
      // An arrow's own scroll (and the smooth tail of it) does not move the current card.
      if (Date.now() - stepping.current < 600) return;
      const line = window.innerHeight / 4;
      const items = document.querySelectorAll<HTMLElement>('.rjb-find-list > li[data-window-key]');
      for (const el of items) {
        if (el.getBoundingClientRect().bottom > line) {
          const fp = el.dataset.windowKey ?? null;
          const at = listedRef.current.findIndex((x) => x.fingerprint === fp);
          if (at >= 0) setCur((c) => (c.fp === fp ? c : { fp, at }));
          return;
        }
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(follow);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pager]);

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
  const next = (r: FeedRow, mute = false) => {
    setDeciding((d) =>
      d.on === listed
        ? { on: listed, gone: [...d.gone, r], mute: [...d.mute, mute] }
        : { on: listed, gone: [r], mute: [mute] },
    );
    moveOff(goneWith(r, mute));
  };
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

  // Find's one empty state (#694), picked by cause.
  const emptyCause: EmptyCause = view && decidedAny(view.hidden) ? 'caughtUp' : 'none';
  const empty = <FindEmpty cause={emptyCause} />;
  const panel = (
    <Panel label={label} title={label} titleHidden flat>
      <PanelBody>
        <Stack gap="normal">
          {/* No status text above the list (Adrian 2026-11-08): the source health and the "not
              shown" counts are the Account menu's Scan details. Screen readers still hear progress. */}
          {/* The counts left the heading and Find's caption (the New and Remote chips show them);
              a screen reader still hears them here, politely. */}
          <VisuallyHidden as="p" role="status" aria-live="polite">
            {loadedMore ||
              ((scanStatus ? null : line) ??
                (feed.loading
                  ? 'Reading your sources…'
                  : view
                    ? `${listed.length} postings, ${counts.new} new`
                    : ''))}
          </VisuallyHidden>
          {/* Below lg only, the pager row (Adrian 2026-11-13): "‹ › 1 of N" at its start. At lg
              there is no row: the list starts under the tabs. */}
          {pager && (
            <Stack
              direction="row"
              gap="px8"
              align="center"
              role="group"
              aria-label="Postings in the list"
              className="rjb-find-pager"
            >
              <Button
                variant="tertiary"
                iconOnly
                label="Previous posting"
                iconLeft={<Icon icon={ChevronLeft} />}
                disabled={curAt <= 0}
                onClick={() => step(-1)}
              />
              <Button
                variant="tertiary"
                iconOnly
                label="Next posting"
                iconLeft={<Icon icon={ChevronRight} />}
                disabled={curAt >= listed.length - 1}
                onClick={() => step(1)}
              />
              <Text variant="ui" as="span" aria-live="polite" className="rjb-find-pager-count">
                {`${curAt + 1} of ${listed.length}`}
              </Text>
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
      ) : listed.length ? (
        <RowList
          label="New postings"
          rows={listed}
          shown={shown}
          onMore={(added) => {
            setLoadedMore(`Loaded ${added} more`);
            setShown((n) => n + REVIEW_PAGE);
          }}
          now={feed.at}
          actions={actions}
          onOpen={wide ? open : undefined}
          linked={wide ? null : linked}
          selected={selectedFp}
          current={pager ? (listed[curAt]?.fingerprint ?? null) : null}
        />
      ) : columns ? null : (
        // At lg the empty state is the right column's (the two columns stay, Adrian 2026-11-13).
        empty
      )}
    </Panel>
  );
  const head =
    typeof header === 'function'
      ? header({
          newCount: view ? counts.new : null,
          selected: !!selectedFp,
        })
      : !selectedFp && header;
  const list = (
    <Stack gap="px24">
      {head}
      {before}
      {panel}
    </Stack>
  );
  if (!header) return list;
  const detail = alone ? (
    empty
  ) : (
    <PostingDetail
      key={selected?.fingerprint ?? selectedFp ?? 'none'}
      r={selected}
      waiting={(!!selectedFp && !selected && (feed.loading || !view)) || (!selectedFp && !view)}
      wide={wide}
      now={feed.at}
      actions={detailActions}
    />
  );
  // At lg: the list column beside the selected posting (the first one until another is picked).
  // With no posting left, the right column says why (caught up, or nothing matches).
  if (columns)
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

/** A decision takes this posting away, and with Not this company every posting of its company. */
const goneWith = (r: FeedRow, mute: boolean) => (x: FeedRow) =>
  x.fingerprint === r.fingerprint ||
  (mute && !!companyKey(r.company) && companyKey(x.company) === companyKey(r.company));

const EMPTY_TITLE_ID = 'rjb-review-empty-title';

/** The mounted card of a posting in Find's list, if any. */
function cardEl(fp: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('.rjb-find-list > li[data-window-key]'))
    if (el.dataset.windowKey === fp) return el;
  return null;
}

/** What Find's short header shows (#544). */
export interface FindTools {
  newCount: number | null;
  /** A posting is selected (at lg its title is the page's h1). */
  selected: boolean;
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
 *  above and room around it, like the Apply list's (TrackerView), with the centred teaching empty
 *  (icon tile, centred text) of Apply's "Track your first job", on the page background (#553). */
function EmptySection({ children, cause }: { children: ReactNode; cause: EmptyCause }) {
  return (
    <Box
      as="section"
      aria-label="No postings"
      data-empty-section=""
      data-empty-cause={cause}
      sx={{ py: 'lg' }}
    >
      <PanelBody>{children}</PanelBody>
    </Box>
  );
}

/** Why Find has nothing to show (#694). One cause, one icon tile, one set of keys: `none` nothing
 *  read or nothing matches, `caughtUp` every posting is saved or skipped. */
type EmptyCause = 'none' | 'caughtUp';

const EMPTY_COPY: Record<EmptyCause, { icon: LucideIcon; title: string; description: string }> = {
  none: {
    icon: SearchX,
    title: 'No postings match yet',
    description: 'No design-system posting from your sources right now. The next scan looks again.',
  },
  caughtUp: {
    icon: CircleCheck,
    title: 'You’re all caught up',
    description:
      'Every posting from your sources is saved or skipped. The next scan brings new ones.',
  },
};

function FindEmpty({ cause }: { cause: EmptyCause }) {
  const copy = EMPTY_COPY[cause];
  return (
    <EmptySection cause={cause}>
      <EmptyState
        onPage
        icon={copy.icon}
        titleId={EMPTY_TITLE_ID}
        title={copy.title}
        description={copy.description}
        action={<NoResultsKeys caughtUp={cause === 'caughtUp'} />}
      />
    </EmptySection>
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
    saveRow(from, () => {
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
      notifyRemoved(`Muted ${r.company}`, undo, 'Its postings no longer show in Find.');
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
  current = null,
}: {
  label: string;
  rows: FeedRow[];
  shown: number;
  /** Shows the next page; given how many it adds. */
  onMore: (added: number) => void;
  now: number;
  actions: RowActions;
  /** At lg: a title selects the posting for the detail column. Below lg: none (no posting page). */
  onOpen?: (r: FeedRow) => void;
  /** The selected posting's fingerprint: its card is marked current. */
  selected: string | null;
  /** Below lg, an old #/find/<fingerprint> link's posting: scrolled into view. */
  linked?: string | null;
  /** Below lg, the pager's current card: kept mounted. */
  current?: string | null;
}) {
  const left = rows.length - shown;
  // Auto-load (2026-11-12): the sentinel pages the list; Review's polite status says "Loaded N more".
  const more = () => onMore(Math.min(left, REVIEW_PAGE));
  const sentinel = useAutoLoad(left > 0, more);
  // Only a window of ~100 cards is mounted (memory audit 2026-11-13); spacers hold the rest.
  const visible = rows.slice(0, shown);
  const { listRef, itemRef, segments } = useWindowedList(
    visible.map((r) => r.fingerprint),
    [selected, linked, current],
  );
  // The linked card is found by its key on the mounted list (it is always kept mounted), so no
  // element reference outlives its card.
  useEffect(() => {
    if (!linked) return;
    const items = listRef.current?.querySelectorAll<HTMLElement>('[data-window-key]') ?? [];
    for (const el of items)
      if (el.dataset.windowKey === linked) {
        el.scrollIntoView({ block: 'start' });
        break;
      }
  }, [linked, listRef]);
  return (
    // The gap before Load more is the cards' own gap (one parent gap, no margins).
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'sm' }}>
      <Box
        as="ul"
        ref={listRef}
        aria-label={label}
        className="rjb-find-list"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'sm',
        }}
      >
        {segments.map((seg) => {
          if (seg.kind === 'spacer')
            return (
              <li
                key={seg.key}
                className="rjb-window-spacer"
                aria-hidden="true"
                ref={spacerRef(seg.px)}
              />
            );
          const r = visible[seg.index];
          return (
            <Box
              as="li"
              key={r.fingerprint}
              ref={itemRef(r.fingerprint)}
              aria-setsize={rows.length}
              aria-posinset={seg.index + 1}
            >
              <Card
                as="article"
                padding="none"
                aria-label={rowName(r)}
                aria-current={r.fingerprint === selected ? 'true' : undefined}
                className={r.fingerprint === selected ? 'rjb-selected' : undefined}
              >
                <Box sx={{ p: 'sm' }}>
                  <PostingCard
                    r={r}
                    now={now}
                    onOpen={onOpen}
                    keys={!onOpen}
                    compact
                    actions={actions}
                  />
                </Box>
              </Card>
            </Box>
          );
        })}
      </Box>
      {left > 0 && (
        <>
          <div ref={sentinel} aria-hidden="true" />
          <Box>
            <Button variant="secondary" onClick={more}>
              {`Load more (${left})`}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

// One fact per line, in one order on every card (#616, Adrian 2026-11-12): the place, the work mode,
// the posted day. The mode line is left out when the place already says remote ("Remote (US)",
// "New York or Remote"; placeSaysRemote, Adrian 2026-11-12, reversing #616's "once, also then").
// A place that is only a work mode ("Remote") is no place: the mode line says it.
const ONLY_MODE = /^(remote|hybrid|on[\s-]?site|in[\s-]?office)$/i;
const placeOf = (r: FeedRow) => {
  const where = cleanPlace(r.location);
  return where && !ONLY_MODE.test(where) ? where : 'Location not stated';
};
// Remote only (feed/autoScan.ts): a posting that states no work mode is kept, and says so.
const modeOf = (r: FeedRow): string | null =>
  placeSaysRemote(placeOf(r))
    ? null
    : r.remoteUnstated
      ? 'Remote not stated'
      : r.mode
        ? modeLabel(r.mode)
        : 'Work mode not stated';

const rowName = (r: FeedRow) => `${r.title}${r.company ? ` at ${r.company}` : ''}`;

/** A posting's keys (Adrian 2026-11-08): one HDS size, Save primary, Skip secondary, Open
 *  posting as an icon button. The same keys on a Browse card and the selected posting. */
function postingKeys(r: FeedRow, actions: RowActions, openKey = true): ReactNode[] {
  return [
    <SaveKey key="save" r={r} actions={actions} />,
    <SkipKey key="skip" r={r} actions={actions} />,
    openKey && httpUrl(r.url) && (
      <HdsTooltip key="open">
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
    ),
  ].filter(Boolean);
}

/** A card's one action row: left-aligned, the keys, then More (…) holding Not this company. */
function PostingActions({
  r,
  actions,
  openKey = true,
}: {
  r: FeedRow;
  actions: RowActions;
  /** The Open posting key; a compact Browse card has none (its title is the way in, #544). */
  openKey?: boolean;
}) {
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center">
      {postingKeys(r, actions, openKey)}
      <PostingMenu r={r} actions={actions} />
    </Stack>
  );
}

/** More (…): Not this company. On a card it ends the action row; in the detail it sits beside
 *  the title block, as a job's More does (one detail template, #546). */
function PostingMenu({ r, actions }: { r: FeedRow; actions: RowActions }) {
  // Not this company is picked in the menu (a portal): its feedback anchors on the trigger.
  const more = useRef<HTMLButtonElement>(null);
  const sheet = useBackSheet(`posting-more:${r.fingerprint}`);
  if (!r.company.trim()) return null;
  return (
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
  );
}

/** Save, the filled key, and Skip, the grey key, on a card's action row and in the detail. */
function SaveKey({ r, actions }: { r: FeedRow; actions: RowActions }) {
  return (
    <Button
      size="md"
      variant="primary"
      aria-label={`Save ${rowName(r)}`}
      onClick={(e) => actions.save(r, e.currentTarget)}
    >
      <Icon icon={Plus} />
      Save
    </Button>
  );
}

function SkipKey({ r, actions }: { r: FeedRow; actions: RowActions }) {
  return (
    <Button
      size="md"
      variant="secondary"
      aria-label={`Skip ${rowName(r)}`}
      onClick={(e) => actions.skip(r, e.currentTarget)}
    >
      Skip
    </Button>
  );
}

/** The posting's text (the detail's Description), read on open (usePostingText) with a Skeleton. */
function DescriptionText({ r }: { r: FeedRow }) {
  const { text, loading } = usePostingText(r);
  if (text.trim())
    return (
      <Text variant="body" as="p" tone="secondary" className="rjb-prewrap">
        {excerpt(text, 2000)}
      </Text>
    );
  return loading ? (
    <Stack gap="px8" aria-busy="true">
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
    </Stack>
  ) : (
    <Text variant="caption" as="p" tone="secondary">
      This source gives no description. Open the posting to read it.
    </Text>
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
  keys = true,
  compact = false,
  actions,
}: {
  r: FeedRow;
  now: number;
  /** At lg, Browse: the title selects the posting (#/find/<fingerprint>) for the detail column. */
  onOpen?: (r: FeedRow) => void;
  /** At lg a list card carries no keys: the detail column has them (#546). */
  keys?: boolean;
  /** A Browse card (#544): three cards and part of a fourth fit on a phone. */
  compact?: boolean;
  actions: RowActions;
}) {
  const pay = payLabel(r);
  const posted = postedAgo(r.postedAt, now);
  const postedLabel = posted && (posted === 'today' ? 'Posted today' : `Posted ${posted}`);
  const mode = modeOf(r);
  return (
    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack gap="px8">
        {/* No source or New badge on any card (#557 cuts): the detail's title block keeps the
            source as a neutral badge; "N new" is Find's caption. */}
        {compact ? (
          // Takes focus after a decision on the card before it (no ring: focusAsHeading).
          <Text variant="body" as="h3" weight="bold" lineClamp={3} tabIndex={-1}>
            <CardTitleLink r={r} onOpen={onOpen} />
          </Text>
        ) : (
          <Text variant="title" as="h3" weight="bold" tabIndex={-1}>
            {r.title}
          </Text>
        )}
        {/* No company (an HN post naming none): said, as the detail's title block does. Its More
            would hold only Not this company, so it has none (PostingMenu). */}
        {r.company.trim() ? (
          // The company's logo first (letter until it loads; companyLogo.ts's rule), then its name.
          <Stack direction="row" gap="px8" align="center">
            <CompanyLogo inline company={r.company} postings={[r.url]} />
            <Text variant="ui" as="p" className="min-w-0">
              {r.company}
            </Text>
          </Stack>
        ) : (
          <Text variant="ui" as="p" tone="secondary">
            Company not stated
          </Text>
        )}
        <FactLines
          truncateFirst
          items={[
            { icon: MapPin, label: placeOf(r) },
            mode ? { icon: Briefcase, label: mode } : null,
            postedLabel ? { icon: Calendar, label: postedLabel } : null,
          ]}
        />
        {pay && (
          <Text variant="body" as="p" weight="bold">
            {pay}
          </Text>
        )}
        {compact && <BrowseExcerpt r={r} />}
        {keys && (
          <Box sx={{ pt: compact ? undefined : 'xs' }}>
            <PostingActions r={r} actions={actions} openKey={!compact} />
          </Box>
        )}
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

/** A Browse card's excerpt (2026-11-12): two lines of the text already held (never fetched for the
 *  list), all-caps runs title-cased for display; "Show more" opens it in place, with "Read the full
 *  posting" then. No text, nothing. */
function BrowseExcerpt({ r }: { r: FeedRow }) {
  const [open, setOpen] = useState(false);
  const id = `rjb-ex-${r.fingerprint.replace(/[^\w-]/g, '')}`;
  const raw = (r.text ?? '').trim() || r.snippet?.trim() || '';
  if (!raw) return null;
  const body = capsToSentence(excerpt(raw, open ? 1200 : 300));
  const link = httpUrl(r.url);
  return (
    <Stack gap="hairline" align="start">
      <Text
        id={id}
        variant="caption"
        as="p"
        tone="secondary"
        className={open ? undefined : 'rjb-clamp-2'}
      >
        {body}
      </Text>
      <Button
        variant="link"
        size="sm"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Show less' : 'Show more'}
      </Button>
      {open && link && (
        <InlineLink href={r.url} standalone size="sm">
          Read the full posting
        </InlineLink>
      )}
    </Stack>
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
 *  posting" until one is picked). A decision moves on to the next posting. */
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
  const pay = payLabel(r);
  const posted = postedAgo(r.postedAt, now);
  // One fact per line, in the card's order (#616): place, work mode (not when the place says
  // remote, 2026-11-12), then pay.
  const mode = modeOf(r);
  const facts = [
    { icon: MapPin, label: placeOf(r) },
    ...(mode ? [{ icon: Briefcase, label: mode }] : []),
    // As on a job's page: a missing pay says so, you need it to decide.
    { icon: Banknote, label: pay || 'Pay not stated' },
    ...(posted
      ? [{ icon: Calendar, label: posted === 'today' ? 'Posted today' : `Posted ${posted}` }]
      : []),
  ];
  // One detail template (#546): the job page's header, then the content.
  return (
    <Box as="section" aria-labelledby="rjb-posting-title" sx={{ minWidth: 0 }}>
      <DetailHeader
        titleBlock={
          <DetailTitleBlock
            title={r.title}
            titleId="rjb-posting-title"
            company={r.company}
            noCompany="Company not stated"
            facts={facts}
            // The source shows here (neutral, as a job's status does).
            badges={<Badge tone="neutral">{SOURCE_LABEL[r.source]}</Badge>}
          />
        }
        more={<PostingMenu r={r} actions={actions} />}
        docked={!wide}
        label={`Actions for ${rowName(r)}`}
        keys={postingKeys(r, actions)}
      />
      <Panel label="Description" title="Description">
        <PanelBody>
          <DescriptionText r={r} />
        </PanelBody>
      </Panel>
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

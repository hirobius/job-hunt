// Companies (#237, Calm list 3/7; the Discover tool keeps its `teams` slug and Teams label): one
// list of company rows with their open roles inline. The rows are the track's watched companies (its
// board tiles, feed/watchlist.ts) and the companies found by the track's own source
// (feed/companySource.ts, #215): the keyless GitHub search where the track's terms name a topic,
// else its starter list and the YC companies hiring now that match its titles. One row per
// board. Each board is read live and filtered by the track's terms (feed/teamRoles.ts); "Hiring now"
// hides the companies known to have no matching role. Rev-3 mock: one "Watched" panel (count badge,
// one caption, Add a company, Hiring now | All) of hairline rows, each a name, "Greenhouse · 3
// matching roles" and a Roles button that opens that company's roles in place, one row at a time. "Add a company" (AddCompany.tsx) is the one
// way onto the list; dream companies sit under it (DreamCompanies.tsx), then outreach targets (only
// once one is saved), and
// Live postings and the list checker stay one link away (DiscoverView's secondary views).
import { useEffect, useMemo, useRef, useState } from 'react';
import { recall, remember, useRemembered } from './viewMemory';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Disclosure,
  InlineLink,
  Stack,
  Tag,
  Text,
  useToast,
} from '@hirobius/design-system';
import { SavedTargets, type Row } from './OutreachRows';
import { atsSearchUrl } from './jobsData';
import { SOURCE_LABEL } from './feed/types';
import { Panel, PanelBody, PanelRow } from './PipelinePanel';
import { useWatching } from './outreachShared';
import {
  findDesignSystemOrgs,
  MAX_ORG_LOOKUPS,
  MIN_STARS,
  type OrgTarget,
  type RunReport,
} from './feed/dsOrgs';
import { createGithubBudget } from './feed/githubBudget';
import {
  suggestTrackCompanies,
  type CompanySource,
  type SuggestReport,
  type SuggestedCompany,
} from './feed/companySource';
import { YC_CREDIT } from './feed/yc';
import { probeFetchJson } from './feed/probeFetch';
import { httpUrl, saveTarget, useTargets } from './feed/targets';
import { liveFetchJson } from './feed/fetchFeed';
import { createLimiter } from './feed/probe';
import { boardLabel, boardsFromUrls, type Board } from './feed/sources/ats';
import {
  boardKey,
  orderTeams,
  foldRolesState,
  readRoles,
  teamStatus,
  type RolesState,
  type TeamStatus,
} from './feed/teamRoles';
import AddCompany from './AddCompany';
import DreamCompanies from './DreamCompanies';
import { useMustInclude } from './feed/mustInclude';
import { DreamStar, FoldedRoles, RoleList } from './TeamRoles';
import { useRoleTypes } from './feed/roleTypePref';
import CompanyLogo from './CompanyLogo';

/** Watched boards read on arrival; the rest wait for "Check open roles". A starter pack can file
 *  a hundred boards, and each read is a whole board. */
const AUTO_READ = 10;
/** A panel's hairline list (the rows are PanelRows). */
const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;
/** The company rows reorder as their boards answer (open roles first). The browser's scroll
 *  anchoring would follow a row that moved and drag the page with it, under the user and on the
 *  way back to this page (return paths): it anchors on what is around the list instead. */
const COMPANY_LIST = { ...LIST, overflowAnchor: 'none' } as const;

type CompanyRow = Row & { boardCheck?: OrgTarget['boardCheck']; watched?: boolean };

const asRow = (o: OrgTarget): CompanyRow => ({
  login: o.login,
  company: o.company,
  website: o.website,
  repo: o.repo,
  repoUrl: o.repoUrl,
  stars: o.stars,
  board: o.board,
  openRoles: o.openRoles,
  boardCheck: o.boardCheck,
});

const suggestedRow = (c: SuggestedCompany): CompanyRow => ({
  login: c.login,
  company: c.company,
  website: httpUrl(c.website), // a third party's link: only http(s) becomes an href
  board: c.board,
  boardCheck: c.boardCheck,
});

const watchedRow = (b: Board): CompanyRow => ({
  login: boardKey(b),
  company: boardLabel(b),
  board: b,
  watched: true,
});

const roleCount = (n: number) => `${n} matching ${n === 1 ? 'role' : 'roles'}`;
/** A row's status, after its board's name: "3 matching roles", "no matching roles". */
const STATUS_LINE: Record<TeamStatus, (r: CompanyRow, rs?: RolesState) => string> = {
  hiring: (_, rs) => roleCount(rs?.state === 'ok' ? rs.roles.length : 0),
  quiet: () => 'no matching roles',
  unknown: () => "couldn't check",
  loading: () => 'checking open roles…',
  unchecked: (r) => (r.watched ? 'not checked yet' : 'not looked up yet'),
  none: () => 'board not found',
};
/** What an open row says when it has no role to list. */
const OPEN_LINE: Partial<Record<TeamStatus, string>> = {
  quiet: 'No open role matches this track right now.',
  unknown: "Couldn't read this board (rate-limited, offline or blocked). Try again later.",
  loading: 'Checking open roles…',
  unchecked: 'Not looked up yet: find more to check this one.',
  none: 'No board on the systems we check; it may hire elsewhere.',
};
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** How long after GitHub's wait ends the list picks up again by itself. */
const RESUME_SLACK_MS = 1000;
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const companies = (n: number) => `${n} ${n === 1 ? 'company' : 'companies'}`;
const teamsN = (n: number) => `${n} ${n === 1 ? 'team' : 'teams'}`;

export default function CompaniesPanel({
  categoryId,
  boardUrls,
  terms,
  source,
}: {
  categoryId: string;
  boardUrls: string[];
  /** The track's search terms: a role matches when it mentions one as a phrase. */
  terms: string[];
  /** Where this track's companies come from (feed/companySource.ts). */
  source: CompanySource;
}) {
  const search = source.kind === 'github' ? source.search : null;
  const suggested = source.kind === 'suggested' ? source : null;
  const { toast } = useToast();
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  // What the list was showing is kept per track for this page load (viewMemory), so a trip away
  // (a saved role's page, Live postings) and Back comes back to it as it was (return paths).
  const kept = (k: string) => `companies:${categoryId}:${k}`;
  const [skipSmall, setSkipSmall] = useRemembered(kept('skipSmall'), true);
  const [running, setRunning] = useState(false);
  const [found, setFound] = useRemembered<CompanyRow[]>(kept('found'), []);
  const [report, setReport] = useRemembered<RunReport | null>(kept('report'), null);
  const [suggestReport, setSuggestReport] = useRemembered<SuggestReport | null>(
    kept('suggestReport'),
    null,
  );
  const [ran, setRan] = useRemembered(kept('ran'), false);
  // GitHub's keyless limit is not an error: the run stops, keeps what it found, and picks up once
  // by itself when the wait is over. A click before then only says the time again.
  const [early, setEarly] = useState(false);
  const resumed = useRef(false);
  const [hiringOnly, setHiringOnly] = useRemembered(kept('hiringOnly'), true);
  const [readAll, setReadAll] = useRemembered(kept('readAll'), false);
  // One row's roles open at a time (rev-3 mock).
  const [openRow, setOpenRow] = useRemembered<string | null>(kept('openRow'), null);
  // The roles read so far come back with the list; a read cut short by leaving (still loading
  // when kept) is dropped, so it is read again.
  const [rolesKept] = useState(() => {
    const done = Object.fromEntries(
      Object.entries(recall<Record<string, RolesState>>(kept('roles')) ?? {}).filter(
        ([, v]) => v.state !== 'loading',
      ),
    );
    remember(kept('roles'), done);
    return done;
  });
  const [roles, setRoles] = useRemembered<Record<string, RolesState>>(kept('roles'), rolesKept);
  // A design-systems track ranks and tags role types and folds the engineering-heavy roles.
  const roleTypes = useRoleTypes(categoryId, terms);
  const include = useMustInclude(categoryId).terms;
  // One politeness budget for the board probes, the role reads and the dream checks.
  const [limiter] = useState(() => createLimiter());
  const abort = useRef<AbortController | null>(null);
  const life = useRef<AbortController | null>(null);
  const asked = useRef(new Set<string>(Object.keys(rolesKept)));
  useEffect(() => {
    life.current = new AbortController();
    return () => {
      life.current?.abort();
      abort.current?.abort();
    };
  }, []);

  // Read a board once per page load (kept with the list); a failure is "Couldn't check", never "no roles". A read cut
  // short (Cancel, leaving) is forgotten, so it can be asked again.
  const loadRoles = (b: Board, signal: AbortSignal) => {
    const k = boardKey(b);
    if (asked.current.has(k)) return;
    asked.current.add(k);
    setRoles((m) => ({ ...m, [k]: { state: 'loading' } }));
    void readRoles(b, terms, { fetchJson: liveFetchJson, limiter, signal }).then((r) => {
      // Cut short: forget the ask so it can be made again, but keep the "Couldn't check" answer, so
      // a cancelled team's row stays visible (a watched board is re-read by the effect below).
      if (signal.aborted) asked.current.delete(k);
      // Left while reading: nothing to show it on, and the kept list reads it again on return.
      if (life.current?.signal.aborted) return;
      setRoles((m) => ({ ...m, [k]: r }));
    });
  };

  // Watched companies: the first few are read on arrival, the rest on "Check open roles".
  const watchedBoards = useMemo(() => boardsFromUrls(boardUrls, Infinity), [boardUrls]);
  const wanted = useMemo(
    () => (readAll ? watchedBoards : watchedBoards.slice(0, AUTO_READ)),
    [readAll, watchedBoards],
  );
  useEffect(() => {
    const signal = life.current?.signal;
    if (!signal || signal.aborted) return;
    for (const b of wanted) loadRoles(b, signal);
    // loadRoles skips boards already asked; `roles` re-runs this after a read was dropped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, roles]);

  // One list: GitHub teams first (they carry a repo), then watched boards not already among them.
  const teamBoards = new Set(found.flatMap((r) => (r.board ? [boardKey(r.board)] : [])));
  const rows: CompanyRow[] = [
    ...found,
    ...watchedBoards.filter((b) => !teamBoards.has(boardKey(b))).map(watchedRow),
  ];

  // What a row counts and lists: its board's roles that pass must include (feed/mustInclude.ts),
  // less the folded engineering-heavy ones.
  const foldOf = (r: Row) =>
    foldRolesState(r.board ? roles[boardKey(r.board)] : undefined, roleTypes.fold, include);
  const rolesOf = (r: Row) => foldOf(r).roles;
  const statusOf = (r: CompanyRow): TeamStatus =>
    r.board && !rolesOf(r)
      ? 'unchecked'
      : teamStatus({ board: r.board, boardCheck: r.boardCheck, roles: rolesOf(r) });
  const shown = orderTeams(
    rows,
    (r) => {
      const rs = rolesOf(r);
      return { status: statusOf(r), count: rs?.state === 'ok' ? rs.roles.length : 0 };
    },
    hiringOnly,
  );
  const hiring = rows.filter((r) => statusOf(r) === 'hiring').length;
  // No board found on the systems we check is not "no openings": under Hiring now these sit below,
  // collapsed, rather than hidden.
  const notFound = hiringOnly ? rows.filter((r) => statusOf(r) === 'none') : [];
  const unread = watchedBoards.filter((b) => !roles[boardKey(b)]).length;

  const waitUntil = report?.stoppedUntil;
  const find = async (resume = false) => {
    if (running || !search) return;
    if (!resume && waitUntil && waitUntil > Date.now()) {
      setEarly(true);
      return;
    }
    if (!resume) resumed.current = false;
    const ac = new AbortController();
    abort.current = ac;
    const rep = {} as RunReport;
    setRunning(true);
    setRan(true);
    setEarly(false);
    // Picking up after a wait keeps the list; a fresh search starts it again.
    if (!resume) setFound([]);
    setReport(null);
    try {
      for await (const o of findDesignSystemOrgs({
        fetchJson: probeFetchJson,
        budget: createGithubBudget(),
        signal: ac.signal,
        minStars: skipSmall ? MIN_STARS : 0,
        queries: search.queries,
        report: rep,
        limiter,
      })) {
        setFound((prev) => (prev.some((p) => p.login === o.login) ? prev : [...prev, asRow(o)]));
        setReport({ ...rep });
        if (o.board) loadRoles(o.board, ac.signal);
      }
    } finally {
      setReport({ ...rep });
      setRunning(false);
    }
  };

  // Once per stop, carry on by ourselves a moment after the wait is over.
  useEffect(() => {
    if (!waitUntil || running || resumed.current) return;
    const t = setTimeout(
      () => {
        resumed.current = true;
        void find(true);
      },
      Math.max(0, waitUntil - Date.now()) + RESUME_SLACK_MS,
    );
    return () => clearTimeout(t);
    // find reads the latest state when the timer fires; only a new stop re-arms it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitUntil, running]);

  // A track with no GitHub topic: its starter list, then the YC companies that match its titles.
  const suggest = async () => {
    if (running || !suggested) return;
    const ac = new AbortController();
    abort.current = ac;
    const rep: SuggestReport = { ycMatched: 0 };
    setRunning(true);
    setRan(true);
    setFound([]);
    setSuggestReport(null);
    try {
      for await (const c of suggestTrackCompanies(suggested, {
        fetchJson: probeFetchJson,
        watched: watchedBoards,
        terms,
        limiter,
        signal: ac.signal,
        report: rep,
      })) {
        setFound((prev) => [...prev, suggestedRow(c)]);
        if (c.board) loadRoles(c.board, ac.signal);
      }
    } finally {
      setSuggestReport({ ...rep });
      setRunning(false);
    }
  };

  const saved = (r: Row) => targets.some((t) => t.login.toLowerCase() === r.login.toLowerCase());
  const save = (r: Row) => {
    saveTarget(categoryId, r);
    toast({ title: `Saved ${r.company} as a target`, tone: 'success' });
  };

  const toggleRow = (r: CompanyRow) => {
    const next = openRow === r.login ? null : r.login;
    setOpenRow(next);
    // Opening a watched board not read yet reads it now.
    const signal = life.current?.signal;
    if (next && r.board && signal && !signal.aborted) loadRoles(r.board, signal);
  };

  const companyRow = (r: CompanyRow) => {
    const { roles: rs, folded } = foldOf(r);
    const status = statusOf(r);
    const matching = rs?.state === 'ok' ? rs.roles : [];
    const line = STATUS_LINE[status](r, rs);
    const open = openRow === r.login;
    const panelId = `rjb-roles-${r.login.replace(/[^a-z0-9_-]/gi, '-')}`;
    const careers = atsSearchUrl(`"${r.company}"`, { role: 'careers', where: '', mode: 'any' });
    const watching = isWatching(r.board);
    return (
      <PanelRow key={r.login}>
        {/* 12 from the row's caption to its open roles (rev-3 mock). Compact density's "xs" is
            2px, so rows use the px steps. */}
        <Stack gap="px12">
          {/* No wrap: the name column shrinks so the star and Roles stay on the right at 390. */}
          <Stack direction="row" gap="px8" align="center" justify="space-between">
            <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
              <Stack direction="row" gap="px12" align="center">
                <Box sx={{ display: { base: 'none', sm: 'block' } }}>
                  <CompanyLogo company={r.company} addresses={[r.website]} />
                </Box>
                <Stack gap="px4">
                  <Text variant="ui" as="span">
                    {r.website ? (
                      <InlineLink href={r.website} externalIcon={false}>
                        {r.company}
                      </InlineLink>
                    ) : (
                      r.company
                    )}
                  </Text>
                  <Text variant="caption" as="p" tone="secondary">
                    {r.board ? `${SOURCE_LABEL[r.board.kind]} · ${line}` : capital(line)}
                  </Text>
                  {r.repo && r.repoUrl && (
                    <Text variant="caption" as="p" tone="secondary">
                      <InlineLink href={r.repoUrl} externalIcon={false}>
                        {r.repo}
                      </InlineLink>
                      {` · ${(r.stars ?? 0).toLocaleString()} stars`}
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Box>
            <Stack direction="row" gap="px4" align="center">
              <DreamStar
                categoryId={categoryId}
                company={r.company}
                website={r.website}
                board={r.board}
              />
              <Button
                size="md"
                variant="secondary"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`Roles at ${r.company}`}
                onClick={() => toggleRow(r)}
              >
                Roles
              </Button>
            </Stack>
          </Stack>
          {open && (
            <Box id={panelId}>
              <Stack gap="px12">
                {matching.length > 0 ? (
                  <RoleList company={r.company} roles={matching} typed={roleTypes.ranked} />
                ) : (
                  <Text variant="caption" as="p" tone="secondary">
                    {status === 'quiet' && folded.length > 0
                      ? 'Only engineering-heavy roles match right now.'
                      : (OPEN_LINE[status] ?? '')}
                  </Text>
                )}
                <FoldedRoles company={r.company} roles={folded} />
                {!r.watched && (
                  <Stack direction="row" gap="px8" align="center" wrap="wrap">
                    {r.board ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={watching}
                        aria-label={`${watching ? 'Watching' : 'Watch board for'} ${r.company}`}
                        onClick={() => watch(r.board!)}
                      >
                        {watching ? 'Watching' : 'Watch board'}
                      </Button>
                    ) : (
                      <Button size="sm" variant="tertiary" asChild>
                        <a
                          href={careers}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Search careers for ${r.company}`}
                        >
                          Search careers
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saved(r)}
                      aria-label={`${saved(r) ? 'Saved' : 'Save as target:'} ${r.company}`}
                      onClick={() => save(r)}
                    >
                      {saved(r) ? 'Saved' : 'Save as target'}
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Box>
          )}
        </Stack>
      </PanelRow>
    );
  };

  const teams = search ? `${search.noun} teams` : '';
  const hidden = rows.length - shown.length - notFound.length;
  const caption = running
    ? suggested
      ? `Checking… ${companies(found.length)} so far.`
      : `Checking… ${teamsN(found.length)} so far.`
    : rows.length
      ? `${companies(rows.length)}, ${hiring} hiring now. Open roles that match this track show first.` +
        (report && report.unresolved > 0 && !report.stoppedUntil
          ? ` ${report.unresolved} not looked up yet: find more to resolve the next ${MAX_ORG_LOOKUPS}.`
          : '')
      : search
        ? `Add a company, or find teams with public ${search.noun} work on GitHub. Their open roles show here.`
        : suggested
          ? 'Add a company, or get suggestions for this track. Their open roles show here.'
          : "Add a company to see its open roles here. The team search looks on GitHub, and this track's titles don't name anything GitHub tracks.";

  return (
    // Panels 24 apart, like the Pipeline's.
    <Stack gap="normal">
      <Panel
        label="Watched"
        title="Watched"
        count={rows.length}
        countLabel={companies(rows.length)}
      >
        <PanelBody>
          <Stack gap="tight">
            <Text variant="caption" as="p" tone="secondary" role="status">
              {caption}
            </Text>
            <Stack direction="row" gap="px8" align="center" wrap="wrap">
              <AddCompany categoryId={categoryId} boardUrls={boardUrls} />
              {search &&
                (running ? (
                  <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void find()}>
                    {ran ? `Find more ${teams}` : `Find ${teams}`}
                  </Button>
                ))}
              {suggested &&
                (running ? (
                  <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void suggest()}>
                    {ran ? 'Suggest again' : 'Suggest companies'}
                  </Button>
                ))}
              {unread > 0 && !readAll && (
                <Button size="sm" variant="secondary" onClick={() => setReadAll(true)}>
                  {`Check open roles at ${companies(unread)}`}
                </Button>
              )}
            </Stack>
            {suggested && (
              <Text variant="caption" as="p" tone="secondary">
                {suggested.line}
              </Text>
            )}
            {suggestReport?.ycDown && (
              <Alert tone="warning">{`The ${YC_CREDIT} didn't answer, so only your starter list is suggested. Try again later.`}</Alert>
            )}
            {suggested?.yc &&
              suggestReport &&
              !suggestReport.ycDown &&
              !suggestReport.ycMatched && (
                <Text variant="caption" as="p" tone="secondary">
                  No YC company hiring now matches this track's titles.
                </Text>
              )}
            {rows.length > 0 && (
              // Two chips (rev-3 mock): Hiring now filled, All outlined, 8 apart; HDS Tag with
              // aria-pressed, 40px tall on a phone (base.css) and never under 48 wide.
              <Stack
                direction="row"
                gap="px8"
                align="center"
                role="group"
                aria-label="Show companies"
              >
                <Tag active={hiringOnly} onClick={() => setHiringOnly(true)}>
                  Hiring now
                </Tag>
                {/* What Hiring now hides (no matching role, or not checked yet) is counted here. */}
                <Tag active={!hiringOnly} onClick={() => setHiringOnly(false)}>
                  {hiringOnly && hidden > 0 ? `All (${hidden} more)` : 'All'}
                </Tag>
              </Stack>
            )}
            {search && (
              <Disclosure label="Refine">
                <Checkbox
                  label={`Skip small teams (fewer than ${MIN_STARS} GitHub stars)`}
                  checked={skipSmall}
                  onChange={() => setSkipSmall((v) => !v)}
                />
              </Disclosure>
            )}
            {waitUntil && (
              <Text variant="caption" as="p" tone="secondary" role="status">
                {early
                  ? `Still busy. We'll carry on by ourselves after ${clock(waitUntil)}.`
                  : `GitHub's free search is busy. Showing what we found; more after ${clock(waitUntil)}.`}
              </Text>
            )}
            {report?.error && <Alert tone="warning">{report.error}</Alert>}
          </Stack>
        </PanelBody>
        {shown.length > 0 && (
          <ul aria-label="Companies" style={COMPANY_LIST}>
            {shown.map(companyRow)}
          </ul>
        )}
        {notFound.length > 0 && (
          <PanelRow as="div">
            <Disclosure label={`Board not found (${notFound.length})`}>
              <ul aria-label="Board not found" style={COMPANY_LIST}>
                {notFound.map(companyRow)}
              </ul>
            </Disclosure>
          </PanelRow>
        )}
      </Panel>

      <DreamCompanies
        categoryId={categoryId}
        terms={terms}
        limiter={limiter}
        roles={roles}
        roleTypes={roleTypes}
        include={include}
      />

      {/* No empty section: it shows once a company is saved as a target. */}
      {targets.length > 0 && (
        <Panel
          label="Outreach targets"
          title="Outreach targets"
          count={targets.length}
          countLabel={companies(targets.length)}
        >
          <SavedTargets categoryId={categoryId} boardUrls={boardUrls} />
        </Panel>
      )}

      <MoreWays />
    </Stack>
  );
}

// "More ways to find companies" (rev-3 mock): the shared Panel, like Watched, with full-bleed
// hairline rows, each a title, a caption and an Open button (a 40px target), not bare text links.
const MORE_WAYS = [
  {
    title: 'Live postings from job boards',
    caption: 'HN, Remotive, Jobicy and your watched boards',
    href: '#/discover/live',
  },
  {
    title: 'Check a list of companies',
    caption: 'Paste names or a YC batch, see who has a board',
    href: '#/discover/boards',
  },
] as const;

function MoreWays() {
  return (
    <Panel label="More ways to find companies" title="More ways to find companies">
      <ul style={LIST}>
        {MORE_WAYS.map((w) => (
          <PanelRow key={w.href}>
            <Stack direction="row" gap="px8" align="center" justify="space-between">
              <Stack gap="px4">
                <Text variant="ui" as="span">
                  {w.title}
                </Text>
                <Text variant="caption" tone="secondary">
                  {w.caption}
                </Text>
              </Stack>
              <Button size="md" variant="secondary" asChild>
                <a href={w.href} aria-label={`Open ${w.title}`}>
                  Open
                </a>
              </Button>
            </Stack>
          </PanelRow>
        ))}
      </ul>
    </Panel>
  );
}

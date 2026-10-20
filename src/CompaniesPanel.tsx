// Companies (#237, Calm list 3/7; the Discover tool keeps its `teams` slug and Teams label): one
// list of company rows with their open roles inline. The rows are the track's watched companies (its
// board tiles, feed/watchlist.ts) and the teams found with the keyless GitHub search in the track's
// own field (feed/teamTopics.ts picks the topics; a track with none gets no search), one row per
// board. Each board is read live and filtered by the track's terms (feed/teamRoles.ts); "Hiring now"
// hides the companies known to have no matching role. "Add a company" (AddCompany.tsx) is the one
// way onto the list; dream companies sit on top (DreamCompanies.tsx), outreach targets below, and
// Live postings and the list checker stay one link away (DiscoverView's secondary views).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Disclosure,
  Input as HdsInput,
  InlineLink,
  Stack,
  Text,
  Toggle,
  useToast,
} from '@hirobius/design-system';
import { SavedTargets, TargetRow, type Row } from './OutreachRows';
import { ROWS_CLASS, rowsStyle, useWatching } from './outreachShared';
import {
  findDesignSystemOrgs,
  MAX_ORG_LOOKUPS,
  MIN_STARS,
  type OrgTarget,
  type RunReport,
} from './feed/dsOrgs';
import { createGithubBudget } from './feed/githubBudget';
import type { TeamSearch } from './feed/teamTopics';
import { probeFetchJson } from './feed/probeFetch';
import { saveTarget, useTargets } from './feed/targets';
import { liveFetchJson } from './feed/fetchFeed';
import { createLimiter } from './feed/probe';
import { boardLabel, boardsFromUrls, type Board } from './feed/sources/ats';
import {
  boardKey,
  orderTeams,
  readRoles,
  teamStatus,
  type RolesState,
  type TeamStatus,
} from './feed/teamRoles';
import AddCompany from './AddCompany';
import DreamCompanies from './DreamCompanies';
import { DreamStar, RoleList } from './TeamRoles';

/** Watched boards read on arrival; the rest wait for "Check open roles". A starter pack can file
 *  a hundred boards, and each read is a whole board. */
const AUTO_READ = 10;
/** Roles shown on a row before "Show more". */
const INLINE_ROLES = 3;

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

const watchedRow = (b: Board): CompanyRow => ({
  login: boardKey(b),
  company: boardLabel(b),
  board: b,
  watched: true,
});

const roleCount = (n: number) => `${n} matching ${n === 1 ? 'role' : 'roles'}`;
const ROLES_LINE: Partial<Record<TeamStatus, (r?: RolesState) => string>> = {
  hiring: (r) => (r?.state === 'ok' ? `${roleCount(r.roles.length)} · ${r.total} open in all` : ''),
  quiet: (r) => `No matching roles · ${r?.state === 'ok' ? r.total : 0} open in all`,
  unknown: () => "Couldn't check",
  loading: () => 'Checking open roles…',
  unchecked: () => 'Not looked up yet',
};

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const companies = (n: number) => `${n} ${n === 1 ? 'company' : 'companies'}`;
const teamsN = (n: number) => `${n} ${n === 1 ? 'team' : 'teams'}`;

export default function CompaniesPanel({
  categoryId,
  boardUrls,
  terms,
  search,
}: {
  categoryId: string;
  boardUrls: string[];
  /** The track's search terms: a role matches when it mentions one as a phrase. */
  terms: string[];
  /** The GitHub search for this track's field, or null when its terms name no topic (or the
   *  GitHub source is off). */
  search: TeamSearch | null;
}) {
  const { toast } = useToast();
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  const [minStars, setMinStars] = useState(String(MIN_STARS));
  const [running, setRunning] = useState(false);
  const [found, setFound] = useState<CompanyRow[]>([]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [ran, setRan] = useState(false);
  const [hiringOnly, setHiringOnly] = useState(true);
  const [readAll, setReadAll] = useState(false);
  const [roles, setRoles] = useState<Record<string, RolesState>>({});
  // One politeness budget for the board probes, the role reads and the dream checks.
  const [limiter] = useState(() => createLimiter());
  const abort = useRef<AbortController | null>(null);
  const life = useRef<AbortController | null>(null);
  const asked = useRef(new Set<string>());
  useEffect(() => {
    life.current = new AbortController();
    return () => {
      life.current?.abort();
      abort.current?.abort();
    };
  }, []);

  // Read a board once per visit; a failure is "Couldn't check", never "no roles". A read cut
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

  const rolesOf = (r: Row) => (r.board ? roles[boardKey(r.board)] : undefined);
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

  const find = async () => {
    if (running || !search) return;
    const ac = new AbortController();
    abort.current = ac;
    const rep = {} as RunReport;
    setRunning(true);
    setRan(true);
    setFound([]);
    setReport(null);
    const stars = Number(minStars);
    try {
      for await (const o of findDesignSystemOrgs({
        fetchJson: probeFetchJson,
        budget: createGithubBudget(),
        signal: ac.signal,
        minStars: Number.isFinite(stars) && stars >= 0 ? stars : MIN_STARS,
        queries: search.queries,
        report: rep,
        limiter,
      })) {
        setFound((prev) => [...prev, asRow(o)]);
        setReport({ ...rep });
        if (o.board) loadRoles(o.board, ac.signal);
      }
    } finally {
      setReport({ ...rep });
      setRunning(false);
    }
  };

  const saved = (r: Row) => targets.some((t) => t.login.toLowerCase() === r.login.toLowerCase());
  const save = (r: Row) => {
    saveTarget(categoryId, r);
    toast({ title: `Saved ${r.company} as a target`, tone: 'success' });
  };

  const companyRow = (r: CompanyRow) => {
    const rs = rolesOf(r);
    const status = statusOf(r);
    const matching = rs?.state === 'ok' ? rs.roles : [];
    return (
      <TargetRow
        key={r.login}
        r={r}
        saved={saved(r)}
        watching={isWatching(r.board)}
        showWatch={!r.watched}
        onSave={r.watched ? undefined : () => save(r)}
        onWatch={watch}
        rolesLine={r.watched && !rs ? 'Open roles not checked yet' : ROLES_LINE[status]?.(rs)}
        star={
          <DreamStar
            categoryId={categoryId}
            company={r.company}
            website={r.website}
            board={r.board}
          />
        }
      >
        {matching.length > 0 && (
          <RoleList company={r.company} roles={matching.slice(0, INLINE_ROLES)} />
        )}
        {matching.length > INLINE_ROLES && (
          <Disclosure label={`Show ${matching.length - INLINE_ROLES} more`}>
            <RoleList
              company={r.company}
              label={`More open roles at ${r.company}`}
              roles={matching.slice(INLINE_ROLES)}
            />
          </Disclosure>
        )}
      </TargetRow>
    );
  };

  const teams = search ? `${search.noun} teams` : '';
  const summary = ran
    ? running
      ? `Checking… ${teamsN(found.length)} so far`
      : `${teamsN(found.length)} found · ${hiring} hiring now`
    : rows.length
      ? `${companies(rows.length)} · ${hiring} hiring now`
      : '';
  const hidden = rows.length - shown.length - notFound.length;

  return (
    // HDS docs-site rhythm (#241): 48 between sections, 24 under each heading.
    <Stack gap="spacious">
      <Stack direction="row" gap="xs" align="center" justify="space-between" wrap="wrap">
        <Text variant="ui" tone="secondary">
          Companies you watch or star, with their open roles.
        </Text>
        <AddCompany categoryId={categoryId} boardUrls={boardUrls} />
      </Stack>
      <DreamCompanies categoryId={categoryId} terms={terms} limiter={limiter} />

      <Stack gap="normal" as="section" aria-label="Open roles by company">
        <Stack gap="xs">
          <Text variant="body" as="h3" className="rjb-semibold">
            Open roles by company
          </Text>
          <Text variant="ui" as="p" tone="secondary">
            {search
              ? `Companies you watch and companies with public ${search.noun} work on GitHub, the ones with roles that match this track first. Source: GitHub search and the companies' own job boards, no sign-in.`
              : rows.length
                ? "Companies you watch, the ones with roles that match this track first. Source: the companies' own job boards."
                : "Add a company to see its open roles here. The team search looks on GitHub, and this track's titles don't name anything GitHub tracks."}
          </Text>
        </Stack>
        {(search || rows.length > 0) && (
          <Stack direction="row" gap="xs" align="center" wrap="wrap">
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
            {unread > 0 && !readAll && (
              <Button size="sm" variant="secondary" onClick={() => setReadAll(true)}>
                {`Check open roles at ${companies(unread)}`}
              </Button>
            )}
            <Toggle label="Hiring now" checked={hiringOnly} onChange={setHiringOnly} />
          </Stack>
        )}
        {search && (
          <Disclosure label="Refine">
            <div style={{ width: 'calc(var(--primitive-space-1) * 36)' }}>
              <HdsInput
                size="sm"
                label="Minimum stars"
                helperText="Used on the next search"
                type="number"
                inputMode="numeric"
                min={0}
                value={minStars}
                onChange={(e) => setMinStars(e.target.value)}
              />
            </div>
          </Disclosure>
        )}

        {report?.stoppedUntil && (
          <Alert tone="warning">{`GitHub asks us to wait until ${clock(report.stoppedUntil)}. What was found so far is below; try again after that.`}</Alert>
        )}
        {report?.error && <Alert tone="warning">{report.error}</Alert>}

        <Stack gap="xs">
          {summary && (
            <Text variant="ui" as="p" role="status">
              {summary}
              {!running && hidden > 0
                ? `. ${hidden} with no matching role or not checked yet hidden: turn off Hiring now to see them.`
                : ''}
              {report && !running && report.unresolved > 0 && !report.stoppedUntil
                ? `. ${report.unresolved} not looked up yet: find more to resolve the next ${MAX_ORG_LOOKUPS}.`
                : ''}
            </Text>
          )}

          {shown.length > 0 && (
            <ul aria-label="Companies" style={rowsStyle} className={ROWS_CLASS}>
              {shown.map(companyRow)}
            </ul>
          )}
        </Stack>
        {notFound.length > 0 && (
          <Disclosure label={`Board not found (${notFound.length})`}>
            <ul aria-label="Board not found" style={rowsStyle} className={ROWS_CLASS}>
              {notFound.map(companyRow)}
            </ul>
          </Disclosure>
        )}
      </Stack>

      <SavedTargets categoryId={categoryId} boardUrls={boardUrls} findLink={false} />

      <Stack gap="normal" as="section" aria-label="More ways to find companies">
        <Text variant="body" as="h3" className="rjb-semibold">
          More ways to find companies
        </Text>
        <Stack gap="xs">
          <Text variant="ui" as="p">
            <InlineLink href="#/discover/live" externalIcon={false}>
              Live postings from job boards
            </InlineLink>
          </Text>
          <Text variant="ui" as="p">
            <InlineLink href="#/discover/boards" externalIcon={false}>
              Check a list of companies
            </InlineLink>
          </Text>
        </Stack>
      </Stack>
    </Stack>
  );
}

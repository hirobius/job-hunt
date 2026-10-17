// The Companies tool (Discover's default, slug `teams`; docs/specs/discovery-methods.md, method 3):
// companies that publish a design system on GitHub, found with the keyless GitHub search
// (src/feed/dsOrgs.ts). Open roles first: each team's board is read live and filtered by the track's
// terms (src/feed/teamRoles.ts), "Hiring now" hides the teams known to have none, and a team's
// matching roles save to the Pipeline inline. Dream companies sit on top (DreamCompanies.tsx). A team
// with no opening can still be saved as an outreach target (src/feed/targets.ts) or its board watched.
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Disclosure,
  Input as HdsInput,
  Stack,
  Text,
  Toggle,
  useToast,
} from '@hirobius/design-system';
import { SavedTargets, TargetRow, type Row } from './OutreachRows';
import { listStyle, useWatching } from './outreachShared';
import { SECONDARY } from './hds-gaps/tone';
import { findDesignSystemOrgs, MIN_STARS, type OrgTarget, type RunReport } from './feed/dsOrgs';
import { createGithubBudget } from './feed/githubBudget';
import { probeFetchJson } from './feed/probeFetch';
import { saveTarget, useTargets } from './feed/targets';
import { liveFetchJson } from './feed/fetchFeed';
import { createLimiter } from './feed/probe';
import {
  boardKey,
  orderTeams,
  readRoles,
  teamStatus,
  type RolesState,
  type TeamStatus,
} from './feed/teamRoles';
import DreamCompanies from './DreamCompanies';
import { DreamStar, RoleList } from './TeamRoles';

type TeamRow = Row & { boardCheck?: OrgTarget['boardCheck'] };

const asRow = (o: OrgTarget): TeamRow => ({
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

export default function OutreachTargets({
  categoryId,
  boardUrls,
  terms,
}: {
  categoryId: string;
  boardUrls: string[];
  /** The track's search terms: a role matches when it mentions one as a phrase. */
  terms: string[];
}) {
  const { toast } = useToast();
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  const [minStars, setMinStars] = useState(String(MIN_STARS));
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [ran, setRan] = useState(false);
  const [hiringOnly, setHiringOnly] = useState(true);
  const [roles, setRoles] = useState<Record<string, RolesState>>({});
  // One politeness budget for the board probes, the role reads and the dream checks.
  const [limiter] = useState(() => createLimiter());
  const abort = useRef<AbortController | null>(null);
  const asked = useRef(new Set<string>());
  useEffect(() => () => abort.current?.abort(), []);

  // Read a team's board once per visit; a failure is "Couldn't check", never "no roles".
  const loadRoles = (b: NonNullable<Row['board']>, signal: AbortSignal) => {
    const k = boardKey(b);
    if (asked.current.has(k)) return;
    asked.current.add(k);
    setRoles((m) => ({ ...m, [k]: { state: 'loading' } }));
    void readRoles(b, terms, { fetchJson: liveFetchJson, limiter, signal }).then((r) => {
      if (signal.aborted) asked.current.delete(k);
      setRoles((m) => ({ ...m, [k]: r }));
    });
  };
  const rolesOf = (r: Row) => (r.board ? roles[boardKey(r.board)] : undefined);
  const statusOf = (r: TeamRow) =>
    teamStatus({ board: r.board, boardCheck: r.boardCheck, roles: rolesOf(r) });
  const shown = orderTeams(
    rows,
    (r) => {
      const rs = rolesOf(r);
      return { status: statusOf(r), count: rs?.state === 'ok' ? rs.roles.length : 0 };
    },
    hiringOnly,
  );
  const hiring = rows.filter((r) => statusOf(r) === 'hiring').length;

  const find = async () => {
    if (running) return;
    const ac = new AbortController();
    abort.current = ac;
    const rep = {} as RunReport;
    setRunning(true);
    setRan(true);
    setRows([]);
    setReport(null);
    const stars = Number(minStars);
    try {
      for await (const o of findDesignSystemOrgs({
        fetchJson: probeFetchJson,
        budget: createGithubBudget(),
        signal: ac.signal,
        minStars: Number.isFinite(stars) && stars >= 0 ? stars : MIN_STARS,
        report: rep,
        limiter,
      })) {
        setRows((prev) => [...prev, asRow(o)]);
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

  return (
    <Stack gap="inset">
      <DreamCompanies categoryId={categoryId} terms={terms} limiter={limiter} />
      <Text variant="body" as="h3" className="rjb-semibold">
        Design-system teams
      </Text>
      <Text variant="ui" style={SECONDARY}>
        Companies that publish a design system on GitHub, with their open roles that match this
        track first. Source: GitHub search and the companies' own job boards, no sign-in.
      </Text>
      <Stack direction="row" gap="xs" align="end" wrap="wrap">
        <div style={{ width: 'calc(var(--primitive-space-1) * 36)' }}>
          <HdsInput
            size="sm"
            label="Minimum stars"
            type="number"
            inputMode="numeric"
            min={0}
            value={minStars}
            onChange={(e) => setMinStars(e.target.value)}
            disabled={running}
          />
        </div>
        {running ? (
          <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" onClick={() => void find()}>
            {ran ? 'Find more design-system teams' : 'Find design-system teams'}
          </Button>
        )}
        <Toggle label="Hiring now" checked={hiringOnly} onChange={setHiringOnly} />
      </Stack>

      {report?.stoppedUntil && (
        <Alert tone="warning">{`GitHub asks us to wait until ${clock(report.stoppedUntil)}. What was found so far is below; try again after that.`}</Alert>
      )}
      {report?.error && <Alert tone="warning">{report.error}</Alert>}

      {ran && (
        <Text variant="ui" as="p" role="status">
          {running
            ? `Checking… ${rows.length} ${rows.length === 1 ? 'team' : 'teams'} so far`
            : `${rows.length} ${rows.length === 1 ? 'team' : 'teams'} found · ${hiring} hiring now`}
          {!running && shown.length < rows.length
            ? `. ${rows.length - shown.length} with no matching role hidden: turn off Hiring now to see them.`
            : ''}
          {report && !running && report.unresolved > 0 && !report.stoppedUntil
            ? `. ${report.unresolved} not looked up yet: find more to resolve the next ${30}.`
            : ''}
        </Text>
      )}

      {shown.length > 0 && (
        <ul aria-label="Design-system teams" style={listStyle}>
          {shown.map((r) => {
            const rs = rolesOf(r);
            const status = statusOf(r);
            return (
              <TargetRow
                key={r.login}
                r={r}
                saved={saved(r)}
                watching={isWatching(r.board)}
                onSave={() => save(r)}
                onWatch={watch}
                rolesLine={ROLES_LINE[status]?.(rs)}
                star={
                  <DreamStar
                    categoryId={categoryId}
                    company={r.company}
                    website={r.website}
                    board={r.board}
                  />
                }
              >
                {rs?.state === 'ok' && rs.roles.length > 0 && (
                  <Disclosure label={`Show ${roleCount(rs.roles.length)}`}>
                    <RoleList company={r.company} roles={rs.roles} />
                  </Disclosure>
                )}
              </TargetRow>
            );
          })}
        </ul>
      )}

      <SavedTargets categoryId={categoryId} boardUrls={boardUrls} />
    </Stack>
  );
}

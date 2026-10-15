// Outreach targets (docs/specs/discovery-methods.md, method 3): companies that publish a design system
// on GitHub, found with the keyless GitHub search (src/feed/dsOrgs.ts), with a board and its open roles
// when we can find one. Most have no opening; those are people to write to, so a company can be saved
// as a target (src/feed/targets.ts, local to this device) or its board watched. Two surfaces share the
// rows: the "Teams" tool (find + saved) and the By company view of Live postings (saved only).
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input as HdsInput, Stack, Text, useToast } from '@hirobius/design-system';
import {
  listStyle,
  SavedTargets,
  SECONDARY,
  TargetRow,
  useWatching,
  type Row,
} from './OutreachRows';
import { findDesignSystemOrgs, MIN_STARS, type OrgTarget, type RunReport } from './feed/dsOrgs';
import { createGithubBudget } from './feed/githubBudget';
import { probeFetchJson } from './feed/probeFetch';
import { saveTarget, useTargets } from './feed/targets';

const asRow = (o: OrgTarget): Row => ({
  login: o.login,
  company: o.company,
  website: o.website,
  repo: o.repo,
  repoUrl: o.repoUrl,
  stars: o.stars,
  board: o.board,
  openRoles: o.openRoles,
});

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function OutreachTargets({
  categoryId,
  boardUrls,
}: {
  categoryId: string;
  boardUrls: string[];
}) {
  const { toast } = useToast();
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  const [minStars, setMinStars] = useState(String(MIN_STARS));
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [ran, setRan] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

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
      })) {
        setRows((prev) => [...prev, asRow(o)]);
        setReport({ ...rep });
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
      <Text variant="ui" style={SECONDARY}>
        Companies that publish a design system on GitHub, most starred first. Most have no opening
        right now; the useful ones are people to write to. Source: GitHub search, no sign-in.
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
      </Stack>

      {report?.stoppedUntil && (
        <Alert tone="warning">{`GitHub asks us to wait until ${clock(report.stoppedUntil)}. What was found so far is below; try again after that.`}</Alert>
      )}
      {report?.error && <Alert tone="warning">{report.error}</Alert>}

      {ran && (
        <Text variant="ui" as="p" role="status" style={{ margin: 0 }}>
          {running
            ? `Checking… ${rows.length} ${rows.length === 1 ? 'team' : 'teams'} so far`
            : `${rows.length} ${rows.length === 1 ? 'team' : 'teams'} found`}
          {report && !running && report.unresolved > 0 && !report.stoppedUntil
            ? `. ${report.unresolved} not looked up yet: find more to resolve the next ${30}.`
            : ''}
        </Text>
      )}

      {rows.length > 0 && (
        <ul aria-label="Design-system teams" style={listStyle}>
          {rows.map((r) => (
            <TargetRow
              key={r.login}
              r={r}
              saved={saved(r)}
              watching={isWatching(r.board)}
              onSave={() => save(r)}
              onWatch={watch}
            />
          ))}
        </ul>
      )}

      <SavedTargets categoryId={categoryId} boardUrls={boardUrls} />
    </Stack>
  );
}

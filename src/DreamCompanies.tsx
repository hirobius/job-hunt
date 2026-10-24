// Dream companies (Teams tool, top section): starred companies that always show, open roles or
// not. "Check dream companies" re-reads every board fresh and lists the matching openings that are new
// since the last check (the ids seen are stored per company, src/feed/dreams.ts). Rev-3 mock: a panel
// with a count badge; a board the companies list has already read shows its matching roles.
import { useEffect, useRef, useState } from 'react';
import { Box, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import { atsSearchUrl } from './jobsData';
import { markDreamChecked, useDreams, type Dream } from './feed/dreams';
import { liveFetchJson } from './feed/fetchFeed';
import type { Limiter } from './feed/probe';
import {
  boardKey,
  foldRolesState,
  newSince,
  readRoles,
  type Role,
  type RolesState,
} from './feed/teamRoles';
import { foldRoles } from './feed/roleType';
import type { IncludeRule } from './feed/mustInclude';
import { keepForTrack, scorerFor } from './tracks/forTrack';
import { SOURCE_LABEL } from './feed/types';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { DreamStar, FoldedRoles, RoleList } from './TeamRoles';
import CompanyLogo from './CompanyLogo';

type Checked = { roles: Role[]; fresh: Set<string> } | 'unknown';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DreamCompanies({
  categoryId,
  terms,
  limiter,
  roles = {},
  roleTypes = { ranked: false, fold: false },
  include = [],
}: {
  categoryId: string;
  terms: string[];
  limiter: Limiter;
  /** Boards the companies list has read this visit, by boardKey: a starred one shows its count. */
  roles?: Record<string, RolesState>;
  /** A design-systems track tags role types and folds the engineering-heavy roles (roleType.ts). */
  roleTypes?: { ranked: boolean; fold: boolean };
  /** The track's must-include terms: a role that never says one is not counted or flagged new. */
  include?: IncludeRule;
}) {
  const dreams = useDreams(categoryId);
  const [checked, setChecked] = useState<Record<string, Checked>>({});
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const check = async () => {
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    setSummary('');
    const at = new Date().toISOString();
    let fresh = 0;
    let failed = 0;
    await Promise.all(
      dreams
        .filter((d) => d.board)
        .map(async (d) => {
          const r = await readRoles(d.board!, terms, {
            fetchJson: liveFetchJson,
            limiter,
            signal: ac.signal,
            fresh: true,
            include,
          });
          if (ac.signal.aborted) return;
          if (r.state !== 'ok') {
            failed++;
            setChecked((c) => ({ ...c, [d.key]: 'unknown' }));
            return;
          }
          // New openings are counted among the roles shown, not the folded engineering-heavy ones.
          const kept = keepForTrack(r.roles, include);
          const found = newSince(
            foldRoles(kept, roleTypes.fold && !scorerFor(include)).shown,
            d.seen,
          );
          fresh += found.length;
          markDreamChecked(
            categoryId,
            d.key,
            r.roles.map((x) => x.id),
            at,
          );
          setChecked((c) => ({
            ...c,
            [d.key]: { roles: kept, fresh: new Set(found.map((x) => x.id)) },
          }));
        }),
    );
    if (ac.signal.aborted) return;
    setRunning(false);
    setSummary(
      `${plural(fresh, 'new opening')} since the last check` +
        (failed ? `. ${plural(failed, 'board')} couldn't be checked.` : '.'),
    );
  };

  const n = dreams.length;
  const canCheck = dreams.some((d) => d.board);
  // An empty section stays hidden (a clean first run): a row's star is how a company gets here.
  if (n === 0) return null;
  return (
    <Panel
      label="Dream companies"
      title="Dream companies"
      count={n}
      countLabel={plural(n, 'company', 'companies')}
    >
      {/* The check sits under the head, not beside it: at 390 a header button wraps the title. */}
      {(summary || canCheck) && (
        <PanelBody>
          <Stack gap="tight">
            {summary && (
              <Text variant="caption" as="p" tone="secondary" role="status">
                {summary}
              </Text>
            )}
            {canCheck && (
              <Box>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={running}
                  onClick={() => void check()}
                >
                  {running ? 'Checking…' : 'Check dream companies'}
                </Button>
              </Box>
            )}
          </Stack>
        </PanelBody>
      )}
      <CardList label="Dream companies">
        {dreams.map((d) => (
          <DreamRow
            key={d.key}
            d={d}
            categoryId={categoryId}
            checked={checked[d.key]}
            read={d.board ? roles[boardKey(d.board)] : undefined}
            roleTypes={roleTypes}
            include={include}
          />
        ))}
      </CardList>
    </Panel>
  );
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function statusLine(d: Dream, c?: Checked, read?: RolesState): string {
  // `c` and `read` hold the shown roles only (DreamRow folds them first).
  if (!d.board) return 'No public board to check';
  if (c === 'unknown') return "Couldn't check";
  if (c) return `${plural(c.roles.length, 'matching role')} · ${c.fresh.size} new`;
  // Read by the companies list below this visit: its count, not "Not checked yet".
  if (read?.state === 'ok') return plural(read.roles.length, 'matching role');
  if (d.checkedAt)
    return `Last checked ${new Date(d.checkedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  return 'Not checked yet';
}

function DreamRow({
  d,
  categoryId,
  checked: allChecked,
  read: allRead,
  roleTypes,
  include,
}: {
  d: Dream;
  categoryId: string;
  checked?: Checked;
  read?: RolesState;
  roleTypes: { ranked: boolean; fold: boolean };
  include: IncludeRule;
}) {
  const read = foldRolesState(allRead, roleTypes.fold, include).roles;
  const split =
    allChecked && allChecked !== 'unknown' ? foldRoles(allChecked.roles, roleTypes.fold) : null;
  const checked: Checked | undefined =
    allChecked && allChecked !== 'unknown'
      ? { roles: split!.shown, fresh: allChecked.fresh }
      : allChecked;
  const careers = atsSearchUrl(`"${d.company}"`, { role: 'careers', where: '', mode: 'any' });
  return (
    <ListCard>
      {/* Compact density's "xs" is 2px: 12 to the roles, 8 between actions. */}
      <Stack gap="px12">
        <Stack direction="row" gap="px8" align="center" justify="space-between" wrap="wrap">
          <Stack direction="row" gap="px12" align="center">
            <Box sx={{ display: { base: 'none', sm: 'block' } }}>
              <CompanyLogo company={d.company} addresses={[d.website]} />
            </Box>
            <Stack gap="px4">
              <Text variant="ui" as="span">
                {d.website ? (
                  <InlineLink href={d.website} externalIcon={false}>
                    {d.company}
                  </InlineLink>
                ) : (
                  d.company
                )}
              </Text>
              {/* The companies list's caption: "Greenhouse · 3 matching roles". */}
              <Text variant="caption" tone="secondary">
                {d.board
                  ? `${SOURCE_LABEL[d.board.kind]} · ${lower(statusLine(d, checked, read))}`
                  : statusLine(d, checked, read)}
              </Text>
            </Stack>
          </Stack>
          <Stack direction="row" gap="px8" align="center">
            {!d.board && (
              <Button size="sm" variant="tertiary" asChild>
                <a
                  href={careers}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Search careers for ${d.company}`}
                >
                  Search careers
                </a>
              </Button>
            )}
            <DreamStar categoryId={categoryId} company={d.company} />
          </Stack>
        </Stack>
        {checked && checked !== 'unknown' && checked.roles.length > 0 && (
          <RoleList
            company={d.company}
            roles={checked.roles}
            newIds={checked.fresh}
            typed={roleTypes.ranked}
          />
        )}
        {split && <FoldedRoles company={d.company} roles={split.folded} />}
      </Stack>
    </ListCard>
  );
}

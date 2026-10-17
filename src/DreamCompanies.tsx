// Dream companies (Companies tool, top section): starred companies that always show, open roles or
// not. "Check dream companies" re-reads every board fresh and lists the matching openings that are new
// since the last check (the ids seen are stored per company, src/feed/dreams.ts).
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import { atsSearchUrl } from './jobsData';
import { markDreamChecked, useDreams, type Dream } from './feed/dreams';
import { liveFetchJson } from './feed/fetchFeed';
import type { Limiter } from './feed/probe';
import { newSince, readRoles, type Role } from './feed/teamRoles';
import { SOURCE_LABEL } from './feed/types';
import { SECONDARY } from './hds-gaps/tone';
import { listStyle } from './outreachShared';
import { DreamStar, RoleList } from './TeamRoles';

type Checked = { roles: Role[]; fresh: Set<string> } | 'unknown';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DreamCompanies({
  categoryId,
  terms,
  limiter,
}: {
  categoryId: string;
  terms: string[];
  limiter: Limiter;
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
          });
          if (ac.signal.aborted) return;
          if (r.state !== 'ok') {
            failed++;
            setChecked((c) => ({ ...c, [d.key]: 'unknown' }));
            return;
          }
          const found = newSince(r.roles, d.seen);
          fresh += found.length;
          markDreamChecked(
            categoryId,
            d.key,
            r.roles.map((x) => x.id),
            at,
          );
          setChecked((c) => ({
            ...c,
            [d.key]: { roles: r.roles, fresh: new Set(found.map((x) => x.id)) },
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

  return (
    <Stack gap="xs" as="section" aria-label="Dream companies">
      <Stack direction="row" gap="xs" align="center" justify="space-between" wrap="wrap">
        <Text variant="body" as="h3" className="rjb-semibold">
          Dream companies
        </Text>
        {dreams.some((d) => d.board) && (
          <Button size="sm" variant="secondary" disabled={running} onClick={() => void check()}>
            {running ? 'Checking…' : 'Check dream companies'}
          </Button>
        )}
      </Stack>
      {summary && (
        <Text variant="ui" as="p" role="status">
          {summary}
        </Text>
      )}
      {dreams.length === 0 ? (
        <Text variant="caption" as="p" style={SECONDARY}>
          Star a company to keep it here, open roles or not.
        </Text>
      ) : (
        <ul aria-label="Dream companies" style={listStyle}>
          {dreams.map((d) => (
            <DreamRow key={d.key} d={d} categoryId={categoryId} checked={checked[d.key]} />
          ))}
        </ul>
      )}
    </Stack>
  );
}

function statusLine(d: Dream, c?: Checked): string {
  if (!d.board) return 'No public board to check';
  if (c === 'unknown') return "Couldn't check";
  if (c) return `${plural(c.roles.length, 'matching role')} · ${c.fresh.size} new`;
  if (d.checkedAt)
    return `Last checked ${new Date(d.checkedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  return 'Not checked yet';
}

function DreamRow({ d, categoryId, checked }: { d: Dream; categoryId: string; checked?: Checked }) {
  const careers = atsSearchUrl(`"${d.company}"`, { role: 'careers', where: '', mode: 'any' });
  return (
    <li>
      <Stack gap="xs">
        <Stack direction="row" gap="xs" align="center" justify="space-between" wrap="wrap">
          <Stack gap="px4">
            <Stack direction="row" gap="xs" align="center" wrap="wrap">
              <Text variant="ui" as="span">
                {d.website ? (
                  <InlineLink href={d.website} externalIcon={false}>
                    {d.company}
                  </InlineLink>
                ) : (
                  d.company
                )}
              </Text>
              {d.board && <Badge>{SOURCE_LABEL[d.board.kind]}</Badge>}
            </Stack>
            <Text variant="caption" style={SECONDARY}>
              {statusLine(d, checked)}
            </Text>
          </Stack>
          <Stack direction="row" gap="xs" align="center">
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
          <RoleList company={d.company} roles={checked.roles} newIds={checked.fresh} />
        )}
      </Stack>
    </li>
  );
}

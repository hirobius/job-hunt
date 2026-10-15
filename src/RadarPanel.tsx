// Discover → Live postings → "Radar" (Role Radar, docs/specs/role-radar.md — first pass). Scans
// many company boards on demand (src/radar/scan.ts), keeps the openings that match the search and
// location, and tiers each one against the user's own evidence: what it asks for that the evidence
// covers (Fit, citing the proof) and what it doesn't (Gap). Then it rolls the asks up across the
// scan, so the biggest gaps are visible. Rules only, no AI; evidence stays on this device.
import { useId, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Disclosure,
  InlineLink,
  Spinner,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import EmptyState from './EmptyState';
import type { WorkMode } from './jobsData';
import { addJobDetailed, dedupKey, updateJob, useJobs } from './store';
import { rankPostings } from './feed/match';
import { postedAgo } from './feed/format';
import { jobFieldsFor } from './feed/toJob';
import type { RankedPosting } from './feed/types';
import { modeLabel, verdictTone } from './screening';
import { radarBoards } from './radar/directory';
import { boardReport, scanBoards, type ScanResult } from './radar/scan';
import { fitGap, parseEvidence, type FitGap, type Tier } from './radar/fitGap';
import { demandPatterns } from './radar/patterns';
import type { Verdict } from './types';

const EVIDENCE_KEY = 'rjb_radar_evidence';
/** Rows per tier before "Show more" — the patterns, not a wall of rows, are the headline. */
const TIER_PAGE = 10;
const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;
const TIERS: { tier: Tier; label: string; hint: string; verdict: Verdict }[] = [
  {
    tier: 'strong',
    label: 'Strong',
    hint: 'Most of what it asks for, you can show.',
    verdict: 'match',
  },
  {
    tier: 'stretch',
    label: 'Stretch',
    hint: 'Real overlap, with gaps to argue for.',
    verdict: 'stretch',
  },
  {
    tier: 'reach',
    label: 'Reach',
    hint: 'Little of what it asks for is in your evidence.',
    verdict: 'reach',
  },
];

function readEvidence(): string {
  try {
    return localStorage.getItem(EVIDENCE_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeEvidence(text: string) {
  try {
    localStorage.setItem(EVIDENCE_KEY, text);
  } catch {
    /* blocked storage: the evidence then lasts this page view */
  }
}

interface Scanned {
  at: number;
  result: ScanResult;
}

export default function RadarPanel({
  term,
  where,
  mode,
  boardUrls,
}: {
  term: string;
  where: string;
  mode: WorkMode;
  /** Every tile URL on the track; its company boards are scanned first. */
  boardUrls: string[];
}) {
  const { toast } = useToast();
  const [evidenceText, setEvidenceText] = useState(readEvidence);
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [failed, setFailed] = useState(false);
  const boards = useMemo(() => radarBoards(boardUrls), [boardUrls]);
  const evidence = useMemo(() => parseEvidence(evidenceText), [evidenceText]);

  const scan = async () => {
    setFailed(false);
    setScanning({ done: 0, total: boards.length });
    try {
      const result = await scanBoards(boards, undefined, {
        onProgress: (done, total) => setScanning({ done, total }),
      });
      setScanned({ at: Date.now(), result });
    } catch {
      setFailed(true);
    } finally {
      setScanning(null);
    }
  };

  // A big board mentions "design systems" in hundreds of unrelated bodies; the radar is about
  // roles that ARE the search, so description-only matches stay out unless asked for.
  const [includeText, setIncludeText] = useState(false);
  const matched = useMemo(
    () =>
      !scanned || !term.trim()
        ? []
        : rankPostings(scanned.result.postings, { term, where, mode, now: scanned.at }),
    [scanned, term, where, mode],
  );
  const textOnly = matched.filter((p) => p.hit === 'text').length;
  const rows = useMemo(
    () =>
      matched
        .filter((p) => includeText || p.hit === 'title')
        .map((p) => ({ p, fg: fitGap(p, evidence) })),
    [matched, includeText, evidence],
  );
  const patterns = useMemo(
    () =>
      demandPatterns(
        rows.map((r) => r.p),
        evidence,
      ),
    [rows, evidence],
  );

  const jobs = useJobs();
  const savedKeys = useMemo(() => new Set(jobs.map((j) => dedupKey(j.url))), [jobs]);
  const save = (p: RankedPosting, verdict: Verdict, tierLabel: string) => {
    const fields = jobFieldsFor(p, term);
    const url = addJobDetailed(p.url, {
      ...fields,
      note: `Found by Role Radar · ${tierLabel} · “${term}”`,
    });
    if (!url) return;
    updateJob(url, { verdict });
    toast({ title: 'Added to Pipeline', description: fields.label, tone: 'success' });
  };

  return (
    <Stack gap="px24">
      <Disclosure
        label={`Your evidence (${evidence.length})`}
        variant="panel"
        defaultOpen={!evidenceText}
      >
        <Stack gap="xs">
          <Text variant="caption" style={SECONDARY}>
            One skill per line, as “Skill: what shows it (link)”. Fit notes only ever cite these.
            Kept on this device.
          </Text>
          <Textarea
            aria-label="Your evidence"
            rows={6}
            value={evidenceText}
            placeholder={
              'Design tokens: token pipeline with generated outputs (https://…)\nAccessibility: automated contrast and axe checks'
            }
            onChange={(e) => {
              setEvidenceText(e.target.value);
              writeEvidence(e.target.value);
            }}
          />
        </Stack>
      </Disclosure>

      <Stack direction="row" gap="xs" align="center" wrap="wrap">
        <Button variant="primary" size="sm" onClick={scan} disabled={!!scanning}>
          {`Scan ${boards.length} company boards`}
        </Button>
        <Text variant="caption" style={SECONDARY}>
          {scanning
            ? `Scanned ${scanning.done} of ${scanning.total} boards…`
            : scanned
              ? boardReport(scanned.result.boards)
              : 'Reads every board on this track plus a starter list, then matches the search above.'}
        </Text>
        {scanning && <Spinner size="sm" label="Scanning boards" />}
      </Stack>

      {failed ? (
        <EmptyState title="The scan failed" message="Check your connection and scan again." />
      ) : !scanned ? null : !term.trim() ? (
        <EmptyState message="Type a search term above to see how the openings fit." />
      ) : matched.length === 0 ? (
        <EmptyState
          title={`No openings on these boards mention “${term}”`}
          message="Try a broader term, or watch more company boards."
        />
      ) : (
        <>
          {textOnly > 0 && (
            <Stack direction="row" gap="xs" align="center" wrap="wrap">
              <Text variant="caption" style={SECONDARY}>
                {includeText
                  ? `Including ${textOnly} that only mention “${term}” in the description.`
                  : `${rows.length} with “${term}” in the title. ${textOnly} more only mention it in the description.`}
              </Text>
              <Button variant="tertiary" size="sm" onClick={() => setIncludeText((v) => !v)}>
                {includeText ? 'Title matches only' : 'Show those too'}
              </Button>
            </Stack>
          )}
          <PatternsSection total={patterns.total} covered={patterns.covered} thin={patterns.thin} />
          {TIERS.map((t) => (
            <TierSection
              key={t.tier}
              label={t.label}
              hint={t.hint}
              rows={rows.filter((r) => r.fg.tier === t.tier)}
              now={scanned.at}
              savedKeys={savedKeys}
              onSave={(p) => save(p, t.verdict, t.label)}
              tone={verdictTone(t.verdict)}
            />
          ))}
        </>
      )}
    </Stack>
  );
}

function TierSection({
  label,
  hint,
  rows,
  now,
  savedKeys,
  onSave,
  tone,
}: {
  label: string;
  hint: string;
  rows: { p: RankedPosting; fg: FitGap }[];
  now: number;
  savedKeys: Set<string>;
  onSave: (p: RankedPosting) => void;
  tone: 'success' | 'warning' | 'danger';
}) {
  const id = useId();
  const [shown, setShown] = useState(TIER_PAGE);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <Stack gap="xs">
        <Stack direction="row" gap="xs" align="center" wrap="wrap">
          <Text variant="title" as="h3" id={id} style={{ margin: 0 }}>
            {label} · {rows.length}
          </Text>
          <Text variant="caption" style={SECONDARY}>
            {hint}
          </Text>
        </Stack>
        <Stack as="ul" gap="px16" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.slice(0, shown).map(({ p, fg }) => (
            <RadarRow
              key={p.id}
              p={p}
              fg={fg}
              label={label}
              tone={tone}
              now={now}
              saved={savedKeys.has(dedupKey(p.url))}
              onSave={() => onSave(p)}
            />
          ))}
        </Stack>
        {rows.length > shown && (
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setShown((n) => n + TIER_PAGE)}
            style={{ alignSelf: 'flex-start' }}
          >
            {`Show more ${label.toLowerCase()} (${rows.length - shown})`}
          </Button>
        )}
      </Stack>
    </section>
  );
}

function RadarRow({
  p,
  fg,
  label,
  tone,
  now,
  saved,
  onSave,
}: {
  p: RankedPosting;
  fg: FitGap;
  label: string;
  tone: 'success' | 'warning' | 'danger';
  now: number;
  saved: boolean;
  onSave: () => void;
}) {
  const meta = [p.company, p.location, p.mode && modeLabel(p.mode), postedAgo(p.postedAt, now)]
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <Stack gap="xs">
        <Stack direction="row" gap="px16" align="start" justify="space-between">
          <Stack gap="px2" style={{ minWidth: 0 }}>
            <Text variant="ui" as="h4" style={{ margin: 0, overflowWrap: 'anywhere' }}>
              <InlineLink href={p.url} externalIcon={false}>
                {p.title}
              </InlineLink>
            </Text>
            <Text variant="caption" style={{ ...SECONDARY, overflowWrap: 'anywhere' }}>
              {meta}
            </Text>
          </Stack>
          <Stack direction="row" gap="xs" align="center">
            <Badge tone={tone}>{label}</Badge>
            <Button
              size="sm"
              variant={saved ? 'tertiary' : 'secondary'}
              disabled={saved}
              aria-label={saved ? `Saved: ${p.title}` : `Save: ${p.title}`}
              onClick={onSave}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
          </Stack>
        </Stack>
        <Disclosure label={`Fit and gap (${fg.fit.length} · ${fg.gap.length})`}>
          <Stack gap="xs">
            <Text variant="caption" style={SECONDARY}>
              Fit
            </Text>
            {fg.fit.length ? (
              <ul aria-label="Fit" style={{ margin: 0 }}>
                {fg.fit.map((f) => (
                  <li key={f.ask.id}>
                    <Text variant="ui" as="span">
                      {f.ask.label}
                      {f.proof && ': '}
                      {f.url ? (
                        <InlineLink href={f.url}>{f.proof || f.ask.label}</InlineLink>
                      ) : (
                        f.proof
                      )}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : (
              <Text variant="ui">Nothing it asks for is in your evidence yet.</Text>
            )}
            <Text variant="caption" style={SECONDARY}>
              Gap
            </Text>
            {fg.gap.length ? (
              <ul aria-label="Gap" style={{ margin: 0 }}>
                {fg.gap.map((a) => (
                  <li key={a.id}>
                    <Text variant="ui" as="span">
                      {a.label}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : (
              <Text variant="ui">No gaps against the asks the radar knows.</Text>
            )}
          </Stack>
        </Disclosure>
      </Stack>
    </li>
  );
}

function PatternsSection({
  total,
  covered,
  thin,
}: {
  total: number;
  covered: { label: string; count: number }[];
  thin: { label: string; count: number }[];
}) {
  const id = useId();
  const list = (name: string, items: { label: string; count: number }[]) => (
    <Stack gap="xs" style={{ minWidth: 0 }}>
      <Text variant="ui" as="h4" style={{ margin: 0 }}>
        {name}
      </Text>
      {items.length ? (
        <ul aria-label={name} style={{ margin: 0 }}>
          {items.map((d) => (
            <li key={d.label}>
              <Text variant="ui" as="span">
                {d.label} · {d.count} of {total}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text variant="caption" style={SECONDARY}>
          None.
        </Text>
      )}
    </Stack>
  );
  return (
    <section aria-labelledby={id}>
      <Stack gap="px16">
        <Text variant="title" as="h3" id={id} style={{ margin: 0 }}>
          What these postings ask for
        </Text>
        {list('Covered by your evidence', covered)}
        {list('Thin or not shown', thin)}
      </Stack>
    </section>
  );
}

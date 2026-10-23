// "Add companies with public design systems" (2026-10-23): a row in Companies' More ways to find
// companies. Runs Adele's names (feed/adele.ts, a vendored MIT snapshot) through the board probe
// (its own limiter, so a 429 here never stops the panel's role reads) and watches every live board
// as it is found. The run belongs to the track, not the row: leaving Companies keeps it going and
// coming back shows where it is; Cancel stops it and keeps what it watched.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Button, InlineLink, Stack, Text, useToast } from '@hirobius/design-system';
import { PanelRow } from './PipelinePanel';
import { probeFetchJson } from './feed/probeFetch';
import { ADELE, ADELE_CREDIT, adeleNames, watchAdeleBoards, type AdeleRun } from './feed/adele';

const boards = (n: number) => `${n} new ${n === 1 ? 'board' : 'boards'}`;

/** What a finished run came to, in one line. */
function adeleSummary(r: AdeleRun): string {
  const rest = [
    r.alreadyWatched > 0 && `${r.alreadyWatched} already watched`,
    r.missed > 0 && `${r.missed} with no public board`,
    r.unknown > 0 && `${r.unknown} couldn’t be checked`,
  ].filter(Boolean);
  return `Watching ${boards(r.watched)}.${rest.length ? ` ${rest.join(', ')}.` : ''}`;
}

type RunState =
  | { state: 'idle' }
  | { state: 'running'; run: AdeleRun | null }
  | { state: 'done' | 'stopped'; run: AdeleRun }
  | { state: 'failed'; run: AdeleRun | null };

const IDLE: RunState = { state: 'idle' };
const runs = new Map<string, RunState>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const set = (id: string, s: RunState) => {
  runs.set(id, s);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function startRun(categoryId: string, names: string[], boardUrls: string[]): void {
  if (runs.get(categoryId)?.state === 'running') return;
  const ac = new AbortController();
  controllers.set(categoryId, ac);
  let last: AdeleRun | null = null;
  set(categoryId, { state: 'running', run: null });
  watchAdeleBoards(categoryId, names, {
    fetchJson: probeFetchJson,
    signal: ac.signal,
    boardUrls,
    onProgress: (p) => {
      last = p;
      if (!ac.signal.aborted) set(categoryId, { state: 'running', run: p });
    },
  })
    .then((r) => set(categoryId, { state: ac.signal.aborted ? 'stopped' : 'done', run: r }))
    .catch(() => set(categoryId, { state: 'failed', run: last }))
    .finally(() => controllers.delete(categoryId));
}

const stopRun = (categoryId: string) => controllers.get(categoryId)?.abort();

export default function AdeleSeed({
  categoryId,
  boardUrls,
}: {
  categoryId: string;
  boardUrls: string[];
}) {
  const { toast } = useToast();
  const names = adeleNames();
  const s = useSyncExternalStore(subscribe, () => runs.get(categoryId) ?? IDLE);
  const title = `Add companies with public design systems (${names.length})`;
  const running = s.state === 'running';

  // A run that ends while the row is on screen says so (one toast; the line under the row stays).
  const was = useRef(s.state);
  useEffect(() => {
    if (was.current === 'running' && s.state !== 'running' && s.state !== 'idle') {
      if (s.state === 'failed')
        toast({ title: 'The check stopped. Try again in a minute.', tone: 'warning' });
      else
        toast({
          title: `Watching ${boards(s.run.watched)} from Adele`,
          tone: s.run.watched > 0 ? 'success' : 'neutral',
        });
    }
    was.current = s.state;
  }, [s, toast]);

  const line =
    s.state === 'idle'
      ? ''
      : s.state === 'running'
        ? s.run
          ? `Checked ${s.run.done} of ${s.run.total} · watching ${s.run.watched}`
          : 'Checking…'
        : s.state === 'failed'
          ? `The check stopped${s.run ? ` after ${s.run.done} of ${s.run.total}` : ''}. Watching ${boards(s.run?.watched ?? 0)}.`
          : `${s.state === 'stopped' ? `Stopped after ${s.run.done} of ${s.run.total}. ` : ''}${adeleSummary(s.run)}`;

  return (
    <PanelRow>
      <Stack gap="px8">
        <Stack direction="row" gap="px8" align="center" justify="space-between">
          <Stack gap="px4">
            <Text variant="ui" as="span">
              {title}
            </Text>
            <Text variant="caption" tone="secondary">
              {`From ${ADELE_CREDIT} (MIT). `}
              <InlineLink href={ADELE.source}>Adele on GitHub</InlineLink>
            </Text>
          </Stack>
          {running ? (
            <Button size="md" variant="secondary" onClick={() => stopRun(categoryId)}>
              Cancel
            </Button>
          ) : (
            <Button
              size="md"
              variant="secondary"
              aria-label={title}
              onClick={() => startRun(categoryId, names, boardUrls)}
            >
              Add
            </Button>
          )}
        </Stack>
        {/* Always mounted, so the first progress line is announced. */}
        <Text variant="caption" as="p" tone="secondary" role="status">
          {line}
        </Text>
      </Stack>
    </PanelRow>
  );
}

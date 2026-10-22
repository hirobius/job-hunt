import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Icon,
  Select,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@hirobius/design-system';
import { Panel, PanelBody, PanelRow, PanelRows } from './PipelinePanel';
import { useCategories } from './curation/curationStore';
import { useMode } from './trackModes';
import { modeLabel, verdictLabel, verdictTone } from './screening';
import { updateJob } from './store';
import type { Job } from './types';
import { forgetKey, getKey, saveModel, useAiConnected, useAiModel } from './ai/connection';
import { connectFromHere } from './ai/oauth';
import {
  AiError,
  defaultModel,
  FALLBACK_MODEL,
  listModels,
  screenPosting,
  type ModelInfo,
} from './ai/client';
import { MAX_POSTING_CHARS } from './ai/untrusted';
import type { AiScreen } from './ai/result';
import { useRemembered } from './viewMemory';

// "Screen with AI" (bring your own model): the user connects their own OpenRouter account, picks a
// model, pastes the posting and gets SUGGESTIONS for the Fit fields. Nothing is saved until they
// accept a suggestion. Every string from the model is rendered as React text (never HTML, never
// markdown, never a link), after src/ai/result.ts has checked and cleaned it. The rules-based
// screener (JdScreenPanel) stays the default; this panel is behind the AI_SCREENING flag.

const EXPLAINER =
  'Optional. Connect your own AI account through OpenRouter and pick a model. When you press Screen, only the posting you paste and the track’s name, titles, level, place and work mode are sent, to the provider you connected. Your key stays in this browser.';
const COST = 'Your provider bills you for each screen, usually a cent or less.';

type Field = 'verdict' | 'mode' | 'angle' | `blocker:${string}`;

export default function AiScreenPanel({ job }: { job: Job }) {
  const connected = useAiConnected();
  // View memory: the open panel, the pasted posting and the suggestions outlive a re-render of
  // the job page (accepting re-sorts the rail at lg) and a hop away and Back.
  const [open, setOpen] = useRemembered(`ai-screen:open:${job.url}`, false);
  // Why the key went (OpenRouter refused it): shown over Connect, since the screener is gone.
  const [refused, setRefused] = useState('');
  const bodyId = useId();
  return (
    <Panel
      label="Screen with AI"
      title="Screen with AI"
      description="Suggestions from a model you connect. Nothing is saved until you accept it."
      trailing={
        <Button
          variant="tertiary"
          size="sm"
          iconRight={<Icon icon={open ? ChevronUp : ChevronDown} />}
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Open'}
        </Button>
      }
    >
      {open && (
        <PanelBody>
          <Box id={bodyId}>
            {connected ? (
              <Screener job={job} onKeyRefused={setRefused} />
            ) : (
              <Connect notice={refused} />
            )}
          </Box>
        </PanelBody>
      )}
    </Panel>
  );
}

function Connect({ notice }: { notice: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap="normal">
      {notice && <Alert tone="warning">{notice}</Alert>}
      <Text variant="caption" as="p" tone="secondary">
        {EXPLAINER}
      </Text>
      <Text variant="caption" as="p" tone="secondary">
        {COST}
      </Text>
      <Stack direction="row" gap="tight">
        <Button
          variant="secondary"
          size="md"
          loading={busy}
          onClick={() => {
            setBusy(true);
            void connectFromHere().catch(() => setBusy(false));
          }}
        >
          Connect OpenRouter
        </Button>
      </Stack>
    </Stack>
  );
}

function useTracks() {
  const all = useCategories();
  return useMemo(
    () => all.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [all],
  );
}

function Screener({ job, onKeyRefused }: { job: Job; onKeyRefused: (why: string) => void }) {
  const tracks = useTracks();
  const [trackId, setTrackId] = useState(() => tracks[0]?.id ?? '');
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0];
  const workMode = useMode(track?.id ?? '');
  const saved = useAiModel();
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [text, setText] = useRemembered(`ai-screen:text:${job.url}`, '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useRemembered<{ screen: AiScreen; truncated: boolean } | null>(
    `ai-screen:result:${job.url}`,
    null,
  );
  const [acceptedList, setAccepted] = useRemembered<Field[]>(`ai-screen:accepted:${job.url}`, []);
  const accepted = new Set(acceptedList);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    listModels()
      .then((m) => live && setModels(m))
      .catch(() => live && setModelsFailed(true));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, []);

  const model = saved ?? (models ? defaultModel(models) : FALLBACK_MODEL);
  const info = models?.find((m) => m.id === model);
  const options = useMemo(() => {
    const list = (models ?? []).map((m) => ({ value: m.id, label: m.name }));
    return list.some((o) => o.value === model) ? list : [{ value: model, label: model }, ...list];
  }, [models, model]);

  const run = async () => {
    const key = getKey();
    if (!key) return;
    setBusy(true);
    setError('');
    setResult(null);
    setAccepted([]);
    abort.current = new AbortController();
    try {
      const out = await screenPosting(
        {
          posting: text,
          track: {
            label: track?.label ?? '',
            titles: track?.titles ?? [],
            seniority: track?.seniority ?? 'any',
            location: track?.location ?? '',
            workMode,
          },
        },
        { key, model, structured: info?.structured ?? true, signal: abort.current.signal },
      );
      setResult(out);
    } catch (e) {
      if (e instanceof AiError && e.keyRefused) {
        onKeyRefused(e.message);
        forgetKey();
        return;
      }
      setError(
        e instanceof AiError ? e.message : 'The AI couldn’t screen this posting. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const accept = (fields: Field[]) => {
    if (!result) return;
    const s = result.screen;
    const patch: Partial<Job> = {};
    const blockers = new Set(job.blockers ?? []);
    for (const f of fields) {
      if (f === 'verdict') patch.verdict = s.verdict;
      else if (f === 'mode' && s.mode) patch.mode = s.mode;
      else if (f === 'angle') patch.angle = s.angle;
      else if (f.startsWith('blocker:')) blockers.add(f.slice('blocker:'.length));
    }
    if (fields.some((f) => f.startsWith('blocker:'))) patch.blockers = [...blockers];
    patch.screenedAt = new Date().toISOString();
    updateJob(job.url, patch);
    setAccepted((a) => [...new Set([...a, ...fields])]);
  };

  const fields: Field[] = result
    ? [
        'verdict',
        ...(result.screen.mode ? (['mode'] as Field[]) : []),
        ...result.screen.blockers.map((b) => `blocker:${b}` as Field),
        ...(result.screen.angle ? (['angle'] as Field[]) : []),
      ]
    : [];
  const pending = fields.filter((f) => !accepted.has(f));

  return (
    <Stack gap="normal">
      <Text variant="caption" as="p" tone="secondary">
        {COST}
      </Text>
      {tracks.length > 1 && (
        <Select
          label="Screen against track"
          value={track?.id ?? ''}
          onChange={setTrackId}
          options={tracks.map((t) => ({ value: t.id, label: t.label }))}
        />
      )}
      <Select label="Model" value={model} onChange={saveModel} options={options} />
      {modelsFailed && (
        <Text variant="caption" as="p" tone="secondary">
          {`Couldn’t load the model list, so ${model} is used.`}
        </Text>
      )}
      <Textarea
        label="Job posting"
        rows={8}
        value={text}
        placeholder="Paste the full job posting…"
        onChange={(e) => setText(e.target.value.slice(0, MAX_POSTING_CHARS * 2))}
      />
      {error && <Alert tone="warning">{error}</Alert>}
      {busy && (
        <Stack direction="row" gap="tight" align="center">
          <Spinner size="sm" label="Screening" />
          <Text variant="caption" as="span" tone="secondary">
            Asking the model…
          </Text>
        </Stack>
      )}
      {result && (
        <Suggestions
          screen={result.screen}
          truncated={result.truncated}
          fields={fields}
          accepted={accepted}
          onAccept={(f) => accept([f])}
        />
      )}
      <Stack direction="row" gap="tight" wrap="wrap">
        {result && pending.length > 0 ? (
          <Button variant="primary" size="md" onClick={() => accept(pending)}>
            {pending.length === fields.length ? 'Accept all' : `Accept the other ${pending.length}`}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="md"
            onClick={() => void run()}
            disabled={!text.trim() || busy}
          >
            Screen
          </Button>
        )}
        {(text || result) && !busy && (
          <Button
            variant="tertiary"
            size="md"
            onClick={() => {
              setText('');
              setResult(null);
              setError('');
            }}
          >
            Clear
          </Button>
        )}
        <Button variant="tertiary" size="md" onClick={forgetKey}>
          Disconnect
        </Button>
      </Stack>
    </Stack>
  );
}

function Suggestions({
  screen,
  truncated,
  fields,
  accepted,
  onAccept,
}: {
  screen: AiScreen;
  truncated: boolean;
  fields: Field[];
  accepted: Set<Field>;
  onAccept: (f: Field) => void;
}) {
  const view = (f: Field): { label: string; value: React.ReactNode; name: string } => {
    if (f === 'verdict')
      return {
        label: 'Fit',
        name: verdictLabel(screen.verdict),
        value: <Badge tone={verdictTone(screen.verdict)}>{verdictLabel(screen.verdict)}</Badge>,
      };
    if (f === 'mode')
      return {
        label: 'Work mode',
        name: modeLabel(screen.mode!),
        value: <Badge tone="neutral">{modeLabel(screen.mode!)}</Badge>,
      };
    if (f === 'angle')
      return {
        label: 'Angle',
        name: 'the angle',
        value: (
          <Text variant="body" as="span">
            {screen.angle}
          </Text>
        ),
      };
    const b = f.slice('blocker:'.length);
    return {
      label: 'Dealbreaker',
      name: b,
      value: (
        <Text variant="body" as="span">
          {b}
        </Text>
      ),
    };
  };
  return (
    <Stack gap="tight">
      <Text variant="caption" as="p" tone="secondary">
        {truncated
          ? 'Suggested from the first part of the posting (it was very long). Check before you accept.'
          : 'Suggested. Check each one before you accept it.'}
      </Text>
      <PanelRows label="AI suggestions">
        {fields.map((f) => {
          const v = view(f);
          const done = accepted.has(f);
          return (
            <PanelRow key={f} dense>
              <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
                <Stack gap="px4">
                  <Text variant="caption" as="span" tone="secondary">
                    {v.label}
                  </Text>
                  {v.value}
                </Stack>
                {done ? (
                  <Stack direction="row" gap="tight" align="center">
                    <Icon icon={Check} size="small" />
                    <Text variant="caption" as="span" tone="secondary">
                      Added
                    </Text>
                  </Stack>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Accept ${v.label.toLowerCase()}: ${v.name}`}
                    onClick={() => onAccept(f)}
                  >
                    Accept
                  </Button>
                )}
              </Stack>
            </PanelRow>
          );
        })}
      </PanelRows>
    </Stack>
  );
}

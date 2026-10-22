// The two OpenRouter calls "Screen with AI" makes, both with the user's own key and only when
// they ask: list models, and screen one posting. The request carries no tools, so the model can
// call nothing, and the reply is only ever data for parseScreen. Error messages are fixed
// sentences: they never carry the key, the posting or the provider's raw text.
import { BRAND } from '../brand';
import { validModelId } from './connection';
import { buildMessages, type ScreenInput } from './prompt';
import { parseScreen, SCREEN_SCHEMA, type AiScreen } from './result';

export const API = 'https://openrouter.ai/api/v1';
export const TIMEOUT_MS = 45_000;
/** Used until the model list has loaded, or when it can't. */
export const FALLBACK_MODEL = 'anthropic/claude-sonnet-4.5';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (u, i) => fetch(u, i);

export interface ModelInfo {
  id: string;
  name: string;
  /** The model takes a JSON schema as response_format. */
  structured: boolean;
}

/** Newest Claude Sonnet, else newest Claude, else the first model listed. */
export function defaultModel(models: ModelInfo[]): string {
  const version = (id: string) =>
    (id.match(/(\d+(?:[.-]\d+)?)/g) ?? [])
      .map((v) => parseFloat(v.replace('-', '.')))
      .reduce((a, b) => Math.max(a, b), 0);
  const claude = models.filter((m) => /^anthropic\/claude-/.test(m.id) && !/:/.test(m.id));
  const pick = (list: ModelInfo[]) =>
    [...list].sort((a, b) => version(b.id) - version(a.id))[0]?.id;
  return (
    pick(claude.filter((m) => /sonnet/.test(m.id))) ??
    pick(claude) ??
    models[0]?.id ??
    FALLBACK_MODEL
  );
}

export async function listModels(fetchImpl: FetchLike = defaultFetch): Promise<ModelInfo[]> {
  const res = await fetchImpl(`${API}/models`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) throw new Error('Couldn’t load the model list.');
  const body = (await res.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error('Couldn’t load the model list.');
  const out: ModelInfo[] = [];
  for (const m of body.data.slice(0, 2000)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as { id?: unknown; name?: unknown; supported_parameters?: unknown };
    const id = validModelId(r.id);
    if (!id) continue;
    const params = Array.isArray(r.supported_parameters) ? r.supported_parameters : [];
    out.push({
      id,
      name:
        typeof r.name === 'string'
          ? r.name.replace(/[^\p{L}\p{N} ().:,'/-]/gu, '').slice(0, 80) || id
          : id,
      structured: params.includes('structured_outputs') || params.includes('response_format'),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export class AiError extends Error {
  constructor(
    message: string,
    /** The key was refused: the caller should forget it. */
    public readonly keyRefused = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** The request body, built in one place so tests can read exactly what leaves the browser. */
export function screenRequest(
  input: ScreenInput,
  model: string,
  structured: boolean,
  nonce?: string,
) {
  const { messages, truncated } = buildMessages(input, nonce);
  return {
    truncated,
    body: {
      model,
      messages,
      temperature: 0,
      max_tokens: 600,
      response_format: structured
        ? {
            type: 'json_schema',
            json_schema: { name: 'job_screen', strict: true, schema: SCREEN_SCHEMA },
          }
        : { type: 'json_object' },
    },
  };
}

export interface ScreenOutcome {
  screen: AiScreen;
  truncated: boolean;
}

export async function screenPosting(
  input: ScreenInput,
  opts: {
    key: string;
    model: string;
    structured: boolean;
    fetch?: FetchLike;
    signal?: AbortSignal;
    nonce?: string;
  },
): Promise<ScreenOutcome> {
  const model = validModelId(opts.model);
  if (!model) throw new AiError('Pick a model first.');
  const { body, truncated } = screenRequest(input, model, opts.structured, opts.nonce);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  opts.signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await (opts.fetch ?? defaultFetch)(`${API}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.key}`,
        'Content-Type': 'application/json',
        'X-Title': BRAND.name,
      },
      body: JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: timeout.signal,
    });
  } catch {
    throw new AiError(
      timeout.signal.aborted
        ? 'The AI took too long to answer. Try again.'
        : 'Couldn’t reach OpenRouter. Check your connection.',
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
  if (res.status === 401 || res.status === 403)
    throw new AiError('OpenRouter refused your key, so it was forgotten. Connect again.', true);
  if (res.status === 402) throw new AiError('Your OpenRouter account is out of credits.');
  if (res.status === 429)
    throw new AiError('Too many requests right now. Wait a minute and try again.');
  if (!res.ok)
    throw new AiError('The AI couldn’t screen this posting. Try again or pick another model.');
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new AiError('The AI’s answer wasn’t readable. Try again.');
  }
  const choice = (data as { choices?: { message?: { content?: unknown; tool_calls?: unknown } }[] })
    ?.choices?.[0];
  // We offered no tools; a reply that tries to call one is not a screen.
  if (
    !choice?.message ||
    (Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length)
  )
    throw new AiError(
      'The AI’s answer wasn’t in the expected shape, so nothing was suggested. Try again or pick another model.',
    );
  const parsed = parseScreen(choice.message.content);
  if (!parsed.ok) throw new AiError(parsed.error);
  return { screen: parsed.screen, truncated };
}

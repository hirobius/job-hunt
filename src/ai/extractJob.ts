import type { ExtractedJob } from './extract-core';

export type ExtractResult =
  | { ok: true; source: 'text' | 'link'; job: ExtractedJob }
  | { ok: false; error: string; fallback?: 'paste'; message?: string };

/** Call the serverless extractor. Pass a `url` (server fetches it) or pasted `text`. */
export async function extractJob(
  input: { url?: string; text?: string; skills?: string },
  opts: { signal?: AbortSignal } = {},
): Promise<ExtractResult> {
  let res: Response;
  try {
    res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: opts.signal ?? AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, error: 'network', message: 'Network error — try again.' };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'bad_response', message: 'Unexpected response from the server.' };
  }

  const b = (body ?? {}) as Record<string, unknown>;
  if (b.ok && b.job) {
    return {
      ok: true,
      source: (b.source as 'text' | 'link') ?? 'text',
      job: b.job as ExtractedJob,
    };
  }
  return {
    ok: false,
    error: String(b.error ?? 'unknown'),
    fallback: b.fallback as 'paste' | undefined,
    message: b.message as string | undefined,
  };
}

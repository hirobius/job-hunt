import type { TailoredResume } from './tailor-core';

export type TailorResult =
  | { ok: true; tailored: TailoredResume }
  | { ok: false; error: string; message?: string };

/** Call the serverless résumé tailorer with the candidate's résumé text + the target job. */
export async function tailorResume(
  input: { resume: string; job: string },
  opts: { signal?: AbortSignal } = {},
): Promise<TailorResult> {
  let res: Response;
  try {
    res = await fetch('/api/tailor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: opts.signal ?? AbortSignal.timeout(60_000),
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
  if (b.ok && b.tailored) return { ok: true, tailored: b.tailored as TailoredResume };
  return {
    ok: false,
    error: String(b.error ?? 'unknown'),
    message: b.message as string | undefined,
  };
}

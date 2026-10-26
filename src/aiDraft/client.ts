// AI drafting (#232): the browser's side. It talks only to our own origin (`/api/draft`), so the
// CSP's connect-src is unchanged. Sends the user's access token and the request; nothing else.
import { loadSupabase } from '../supabase';
import { DRAFT_ERRORS, DRAFT_PATH, type DraftRequest, type DraftResult } from './contract';

let status: Promise<boolean> | null = null;

/** Whether drafting is set up on the server. Asked once per page load; anything but a clear yes
 *  (dev server, offline, an old deploy without the function) is no, so Draft stays hidden. */
export function draftConfigured(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  status ??= fetchImpl(DRAFT_PATH, { headers: { accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) return false;
      const body = (await r.json()) as { configured?: unknown };
      return body.configured === true;
    })
    .catch(() => false);
  return status;
}

/** Tests: forget the cached answer. */
export function resetDraftStatus() {
  status = null;
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await (await loadSupabase()).auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

const failed = (code: keyof typeof DRAFT_ERRORS, message = DRAFT_ERRORS[code]): DraftResult => ({
  ok: false,
  code,
  message,
});

/** Ask for a draft. Every outcome is a DraftResult with a named code; this never throws. */
export async function requestDraft(
  req: DraftRequest,
  fetchImpl: typeof fetch = fetch,
  token: () => Promise<string | null> = accessToken,
): Promise<DraftResult> {
  const t = await token();
  if (!t) return failed('not_signed_in');
  let res: Response;
  try {
    res = await fetchImpl(DRAFT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify(req),
    });
  } catch {
    return failed(
      'provider_failed',
      "Couldn't reach the server. Check your connection and try again.",
    );
  }
  let body: Partial<{ ok: boolean; text: string; code: string; message: string }>;
  try {
    body = await res.json();
  } catch {
    return failed('provider_failed');
  }
  if (res.ok && body.ok === true && typeof body.text === 'string' && body.text.trim())
    return { ok: true, text: body.text };
  const code = (
    body.code && body.code in DRAFT_ERRORS ? body.code : 'provider_failed'
  ) as keyof typeof DRAFT_ERRORS;
  return failed(
    code,
    typeof body.message === 'string' && body.message ? body.message : DRAFT_ERRORS[code],
  );
}

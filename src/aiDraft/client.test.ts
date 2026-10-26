// The browser side of AI drafting (#232): same-origin only, named errors for every failure,
// and "set up?" read as no unless the server clearly says yes.
import { describe, expect, it, vi } from 'vitest';
import { draftConfigured, requestDraft, resetDraftStatus } from './client';
import { DRAFT_ERRORS, DRAFT_PATH } from './contract';

const REQ = { kind: 'cover' as const, mode: 'draft' as const, text: '', instruction: 'Warm' };
const reply = (status: number, body: unknown) =>
  vi.fn(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
const token = async () => 'tok';

describe('draftConfigured', () => {
  it.each([
    ['configured', reply(200, { configured: true }), true],
    ['not configured', reply(200, { configured: false }), false],
    ['the dev server (HTML)', reply(200, '<!doctype html>'), false],
    ['a 404', reply(404, {}), false],
  ])('%s', async (_, f, want) => {
    resetDraftStatus();
    expect(await draftConfigured(f as unknown as typeof fetch)).toBe(want);
    expect(f).toHaveBeenCalledWith(DRAFT_PATH, expect.anything());
  });

  it('offline is no, and the answer is asked once per page load', async () => {
    resetDraftStatus();
    const f = vi.fn(async () => Promise.reject(new TypeError('offline')));
    expect(await draftConfigured(f as unknown as typeof fetch)).toBe(false);
    await draftConfigured(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('requestDraft', () => {
  it('posts the request with the bearer token to our own origin', async () => {
    const f = reply(200, { ok: true, text: 'Hello' });
    expect(await requestDraft(REQ, f as unknown as typeof fetch, token)).toEqual({
      ok: true,
      text: 'Hello',
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/draft');
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok' });
    expect(JSON.parse(init.body as string)).toEqual(REQ);
  });

  it('signed out never calls the server', async () => {
    const f = reply(200, {});
    expect(await requestDraft(REQ, f as unknown as typeof fetch, async () => null)).toEqual({
      ok: false,
      code: 'not_signed_in',
      message: DRAFT_ERRORS.not_signed_in,
    });
    expect(f).not.toHaveBeenCalled();
  });

  it.each(['not_set_up', 'not_signed_in', 'cap_reached', 'provider_failed', 'bad_input'] as const)(
    'passes the named error %s through',
    async (code) => {
      const f = reply(400, { ok: false, code, message: 'Named.' });
      expect(await requestDraft(REQ, f as unknown as typeof fetch, token)).toEqual({
        ok: false,
        code,
        message: 'Named.',
      });
    },
  );

  it('an unknown answer, a network failure or an empty draft is a provider failure', async () => {
    for (const f of [
      reply(500, 'oops'),
      reply(200, { ok: true, text: '  ' }),
      reply(500, { code: 'weird' }),
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    ])
      expect(await requestDraft(REQ, f as unknown as typeof fetch, token)).toMatchObject({
        ok: false,
        code: 'provider_failed',
      });
  });
});

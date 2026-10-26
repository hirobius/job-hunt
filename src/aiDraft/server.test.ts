// The AI drafting function (#232, ADR 0009) with the provider, Supabase and the env stubbed:
// ships dark, signed-in only, the monthly cap held server-side, named errors, the key never sent
// back, and the cost settled at what the call really used.
import { describe, expect, it, vi } from 'vitest';
import {
  buildPrompt,
  costOf,
  DEFAULT_MONTHLY_CAP_USD,
  DRAFT_MODEL,
  handleDraft,
  readSettings,
  worstCaseCost,
  type DraftDeps,
  type ModelOutcome,
} from './server';
import { DRAFT_ERRORS, DRAFT_KINDS, MAX_BODY_BYTES, MAX_TEXT, parseDraftRequest } from './contract';
import { DOCUMENT_KINDS } from '../documents';

const ENV = { ANTHROPIC_API_KEY: 'sk-ant-secret', SUPABASE_SERVICE_ROLE_KEY: 'service-secret' };
const GOOD: ModelOutcome = {
  ok: true,
  text: '  Dear Acme,\nHello.  ',
  stopReason: 'end_turn',
  model: DRAFT_MODEL,
  usage: { model: DRAFT_MODEL, input_tokens: 1_000, output_tokens: 2_000 },
};

function deps(over: Partial<DraftDeps> = {}) {
  const d = {
    env: ENV,
    verifyUser: vi.fn(async (t: string) => (t === 'good-token' ? 'user-1' : null)),
    reserve: vi.fn(async () => ({ status: 'ok' as const, id: '42' })),
    settle: vi.fn(async () => {}),
    callModel: vi.fn(async () => GOOD),
    ...over,
  };
  return d;
}

const post = (body: unknown, token: string | null = 'good-token', raw?: string) =>
  new Request('https://app.example/api/draft', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? JSON.stringify(body),
  });
const DRAFT = { kind: 'cover', mode: 'draft', text: '', instruction: 'For Acme, warm, 150 words' };

async function call(req: Request, d: DraftDeps) {
  const res = await handleDraft(req, d);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('ships dark', () => {
  it('GET says not configured, and POST names "not set up", when the key is missing', async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: 'k' }, { SUPABASE_SERVICE_ROLE_KEY: 's' }]) {
      const d = deps({ env });
      const get = await call(new Request('https://app.example/api/draft'), d);
      expect(get.body).toEqual({ configured: false });
      const r = await call(post(DRAFT), d);
      expect(r.status).toBe(503);
      expect(r.body).toMatchObject({
        ok: false,
        code: 'not_set_up',
        message: DRAFT_ERRORS.not_set_up,
      });
      expect(DRAFT_ERRORS.not_set_up).toBe('AI drafting is not set up.');
      expect(d.callModel).not.toHaveBeenCalled();
    }
  });

  it('GET says configured once both keys are set, and nothing else', async () => {
    const r = await call(new Request('https://app.example/api/draft'), deps());
    expect(r.body).toEqual({ configured: true });
  });

  it('a cap that is not a number fails closed (not set up), never runs uncapped', () => {
    expect(readSettings({ ...ENV, AI_MONTHLY_CAP_USD: 'ten' })).toBeNull();
    expect(readSettings({ ...ENV, AI_USER_MONTHLY_CAP_USD: '-1' })).toBeNull();
    expect(readSettings(ENV)).toMatchObject({ capUsd: DEFAULT_MONTHLY_CAP_USD, userCapUsd: 10 });
    expect(DEFAULT_MONTHLY_CAP_USD).toBe(10);
    expect(
      readSettings({ ...ENV, AI_MONTHLY_CAP_USD: '25', AI_USER_MONTHLY_CAP_USD: '2' }),
    ).toMatchObject({ capUsd: 25, userCapUsd: 2 });
  });

  it('the usage table missing (migration not applied) reads as not set up', async () => {
    const d = deps({ reserve: vi.fn(async () => ({ status: 'missing' as const })) });
    const r = await call(post(DRAFT), d);
    expect(r.body).toMatchObject({ code: 'not_set_up' });
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('other methods are refused', async () => {
    const res = await handleDraft(
      new Request('https://app.example/api/draft', { method: 'PUT' }),
      deps(),
    );
    expect(res.status).toBe(405);
  });
});

describe('signed-in only', () => {
  it.each([
    ['no token', null],
    ['a token Supabase does not accept', 'forged'],
  ])('%s → not signed in, nothing reserved or called', async (_, token) => {
    const d = deps();
    const r = await call(post(DRAFT, token), d);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: 'not_signed_in', message: DRAFT_ERRORS.not_signed_in });
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('a verifier that throws is not signed in, not a crash', async () => {
    const d = deps({ verifyUser: vi.fn(async () => Promise.reject(new Error('down'))) });
    expect((await call(post(DRAFT), d)).body).toMatchObject({ code: 'not_signed_in' });
  });
});

describe('bad input', () => {
  it.each([
    ['not JSON', undefined, '{nope'],
    ['an unknown kind', { ...DRAFT, kind: 'poem' }],
    ['an unknown mode', { ...DRAFT, mode: 'translate' }],
    ['a draft with nothing asked', { ...DRAFT, instruction: '  ' }],
    ['a rewrite with no text', { ...DRAFT, mode: 'rewrite', text: ' ' }],
    ['text over the limit', { ...DRAFT, text: 'x'.repeat(MAX_TEXT + 1) }],
    [
      'a body over the byte limit',
      undefined,
      JSON.stringify({ ...DRAFT, pad: 'x'.repeat(MAX_BODY_BYTES) }),
    ],
  ])('%s → bad input, nothing reserved', async (_, body, raw?: string) => {
    const d = deps();
    const r = await call(post(body, 'good-token', raw), d);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ ok: false, code: 'bad_input' });
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('the server knows the same kinds as Documents', () => {
    expect([...DRAFT_KINDS]).toEqual(DOCUMENT_KINDS.map((k) => k.kind));
    expect(parseDraftRequest({ ...DRAFT, extra: 1 })).toEqual(DRAFT);
  });
});

describe('the monthly cap', () => {
  it('reserves the worst case under the cap before calling, then settles at the real cost', async () => {
    const order: string[] = [];
    const d = deps({
      env: { ...ENV, AI_USER_MONTHLY_CAP_USD: '3' },
      reserve: vi.fn(async () => (order.push('reserve'), { status: 'ok' as const, id: '7' })),
      callModel: vi.fn(async () => (order.push('call'), GOOD)),
      settle: vi.fn(async () => void order.push('settle')),
    });
    const r = await call(post(DRAFT), d);
    expect(r).toEqual({ status: 200, body: { ok: true, text: 'Dear Acme,\nHello.' } });
    expect(order).toEqual(['reserve', 'call', 'settle']);
    expect(d.reserve).toHaveBeenCalledWith({
      userId: 'user-1',
      capUsd: 10,
      userCapUsd: 3,
      estimateUsd: worstCaseCost(parseDraftRequest(DRAFT) as never),
    });
    // 1k in at $4/M + 2k out at $20/M.
    expect(d.settle).toHaveBeenCalledWith({
      id: '7',
      costUsd: 0.004 + 0.04,
      status: 'done',
      inputTokens: 1_000,
      outputTokens: 2_000,
      model: DRAFT_MODEL,
    });
  });

  it('at the cap, drafting stops with a named error and the provider is never called', async () => {
    const d = deps({ reserve: vi.fn(async () => ({ status: 'cap' as const })) });
    const r = await call(post(DRAFT), d);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 'cap_reached', message: DRAFT_ERRORS.cap_reached });
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it("one user's own cap is named as theirs", async () => {
    const d = deps({ reserve: vi.fn(async () => ({ status: 'user_cap' as const })) });
    expect((await call(post(DRAFT), d)).body).toMatchObject({
      code: 'cap_reached',
      message: expect.stringMatching(/You have used your AI drafting budget/),
    });
  });

  it('a budget check that fails stops the draft (fails closed)', async () => {
    const d = deps({ reserve: vi.fn(async () => Promise.reject(new Error('db down'))) });
    expect((await call(post(DRAFT), d)).body).toMatchObject({ code: 'provider_failed' });
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('the worst case covers a full answer at the highest rate', () => {
    const est = worstCaseCost({
      kind: 'resume',
      mode: 'rewrite',
      text: 'x'.repeat(MAX_TEXT),
      instruction: '',
    });
    expect(est).toBeGreaterThan(0.4);
    expect(est).toBeLessThan(1);
  });

  it('a fallback model is priced per model, at the ceiling when unknown', () => {
    const c = costOf(DRAFT_MODEL, {
      model: DRAFT_MODEL,
      input_tokens: 2_000,
      output_tokens: 1_000,
      iterations: [
        { model: DRAFT_MODEL, input_tokens: 1_000, output_tokens: 500 },
        { model: 'claude-some-other', input_tokens: 1_000, output_tokens: 500 },
      ],
    });
    expect(c).toBeCloseTo(0.004 + 0.01 + 0.01 + 0.025, 6);
  });
});

describe('provider failure', () => {
  it('an API error is named, and its reservation is released', async () => {
    const d = deps({
      callModel: vi.fn(async () => ({ ok: false as const, billed: false, detail: '500' })),
    });
    const r = await call(post(DRAFT), d);
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({
      code: 'provider_failed',
      message: DRAFT_ERRORS.provider_failed,
    });
    expect(d.settle).toHaveBeenCalledWith(
      expect.objectContaining({ id: '42', costUsd: 0, status: 'failed' }),
    );
  });

  it('a call that may have run (timeout) keeps its worst-case reservation', async () => {
    const d = deps({ callModel: vi.fn(async () => Promise.reject(new Error('timeout'))) });
    expect((await call(post(DRAFT), d)).body).toMatchObject({ code: 'provider_failed' });
    expect(d.settle).not.toHaveBeenCalled();
  });

  it.each([
    ['refusal', /declined/],
    ['max_tokens', /too long/],
  ])('stop reason %s is named and still billed', async (stopReason, message) => {
    const d = deps({ callModel: vi.fn(async () => ({ ...GOOD, stopReason })) });
    expect((await call(post(DRAFT), d)).body).toMatchObject({
      code: 'provider_failed',
      message: expect.stringMatching(message),
    });
    expect(d.settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', costUsd: 0.044 }),
    );
  });

  it('never sends the key or the provider detail back', async () => {
    const d = deps({
      callModel: vi.fn(async () => ({
        ok: false as const,
        billed: false,
        detail: 'sk-ant-secret rejected',
      })),
    });
    const res = await handleDraft(post(DRAFT), d);
    const text = await res.text();
    expect(text).not.toMatch(/sk-ant|service-secret|rejected/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('prompt', () => {
  it('fences the user text and keeps their request; a rewrite works from the text', () => {
    const p = buildPrompt({
      kind: 'cover',
      mode: 'rewrite',
      text: 'Old [Company] text',
      instruction: 'Shorter',
    });
    expect(p).toContain('<document>\nOld [Company] text\n</document>');
    expect(p).toContain('<request>\nShorter\n</request>');
    expect(p).toMatch(/^Rewrite this cover letter/);
    expect(
      buildPrompt({ kind: 'resume', mode: 'draft', text: '', instruction: 'Senior designer' }),
    ).toMatch(/^Write a résumé\.\n\n<request>/);
  });

  it('the model is the latest Claude, with the key passed only to the provider', async () => {
    const d = deps();
    await call(post(DRAFT), d);
    expect(DRAFT_MODEL).toBe('claude-opus-5-5');
    expect(d.callModel).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-ant-secret' }));
  });
});

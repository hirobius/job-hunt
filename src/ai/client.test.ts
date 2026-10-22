import { describe, expect, it } from 'vitest';
import {
  AiError,
  defaultModel,
  listModels,
  screenPosting,
  screenRequest,
  type FetchLike,
} from './client';
import type { ScreenInput } from './prompt';

const input: ScreenInput = {
  posting: 'Senior designer. Hybrid in Spokane. Degree required.',
  track: { label: 'Design', titles: ['Designer'], seniority: 'any', location: '', workMode: 'any' },
};
const KEY = 'sk-or-v1-0123456789abcdef';

const reply =
  (status: number, body: unknown): FetchLike =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe('OpenRouter client', () => {
  it('asks for a strict JSON schema when the model takes one, JSON otherwise', () => {
    const s = screenRequest(input, 'anthropic/claude-sonnet-4.5', true, 'n').body;
    expect(s.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(screenRequest(input, 'x/y', false, 'n').body.response_format).toEqual({
      type: 'json_object',
    });
    expect(s).not.toHaveProperty('tools');
    expect(s.temperature).toBe(0);
  });

  it('sends the key only as a bearer header, with no cookies or referrer', async () => {
    let seen: RequestInit | undefined;
    let url = '';
    const fetch: FetchLike = async (u, init) => {
      url = u;
      seen = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"verdict":"match","blockers":[],"angle":"Go"}' } }],
        }),
      );
    };
    const out = await screenPosting(input, {
      key: KEY,
      model: 'anthropic/claude-sonnet-4.5',
      structured: true,
      fetch,
    });
    expect(out.screen).toEqual({ verdict: 'match', blockers: [], angle: 'Go' });
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((seen!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(seen!.credentials).toBe('omit');
    expect(seen!.referrerPolicy).toBe('no-referrer');
    expect(String(seen!.body)).not.toContain(KEY);
  });

  it.each([
    [401, /refused your key/, true],
    [402, /out of credits/, false],
    [429, /Too many requests/, false],
    [500, /couldn’t screen/, false],
  ])('turns HTTP %s into a plain error', async (status, msg, refused) => {
    const err = await screenPosting(input, {
      key: KEY,
      model: 'a/b',
      structured: false,
      fetch: reply(status, { error: { message: `bad key ${KEY}` } }),
    }).catch((e: AiError) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).message).toMatch(msg);
    expect((err as AiError).message).not.toContain(KEY);
    expect((err as AiError).keyRefused).toBe(refused);
  });

  it('a network failure is a plain error', async () => {
    const err = await screenPosting(input, {
      key: KEY,
      model: 'a/b',
      structured: false,
      fetch: () => Promise.reject(new TypeError(KEY)),
    }).catch((e) => e);
    expect((err as Error).message).toMatch(/Couldn’t reach OpenRouter/);
  });

  it('refuses a bad model id before sending anything', async () => {
    let called = false;
    const err = await screenPosting(input, {
      key: KEY,
      model: 'javascript:alert(1)',
      structured: false,
      fetch: async () => {
        called = true;
        return new Response('{}');
      },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(called).toBe(false);
  });

  it('lists models, cleans names and marks structured output', async () => {
    const models = await listModels(
      reply(200, {
        data: [
          { id: 'openai/gpt-5', name: 'GPT-5 <b>', supported_parameters: ['response_format'] },
          {
            id: 'anthropic/claude-sonnet-4.5',
            name: 'Claude Sonnet 4.5',
            supported_parameters: ['structured_outputs'],
          },
          { id: 'bad id', name: 'x' },
        ],
      }),
    );
    expect(models.map((m) => m.id)).toEqual(['anthropic/claude-sonnet-4.5', 'openai/gpt-5']);
    expect(models[1].name).toBe('GPT-5 b');
    expect(models.every((m) => m.structured)).toBe(true);
  });

  it('defaults to the newest Claude Sonnet', () => {
    const m = (id: string) => ({ id, name: id, structured: true });
    expect(
      defaultModel([
        m('openai/gpt-5'),
        m('anthropic/claude-sonnet-4'),
        m('anthropic/claude-sonnet-4.5'),
        m('anthropic/claude-opus-4.1'),
        m('anthropic/claude-sonnet-4.5:beta'),
      ]),
    ).toBe('anthropic/claude-sonnet-4.5');
    expect(defaultModel([m('anthropic/claude-3-haiku'), m('openai/gpt-5')])).toBe(
      'anthropic/claude-3-haiku',
    );
    expect(defaultModel([m('openai/gpt-5')])).toBe('openai/gpt-5');
    expect(defaultModel([])).toBe('anthropic/claude-sonnet-4.5');
  });
});

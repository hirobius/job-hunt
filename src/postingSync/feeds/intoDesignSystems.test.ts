import { describe, expect, it, vi } from 'vitest';
import type { FeedContext } from './context';
import {
  IDS_MCP,
  IDS_QUERY,
  parseIdsResult,
  pickSearch,
  readIntoDesignSystems,
  rpcResult,
} from './intoDesignSystems';

// The shapes below are the MCP spec's (tools/list, tools/call); the tool names and the posting
// fields are guesses until the first live call (the adapter's header says so).
const TOOLS = [
  { name: 'get_stats', inputSchema: { type: 'object', properties: {} } },
  { name: 'read_posting', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
  {
    name: 'search_jobs',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        remote: { type: 'boolean' },
        limit: { type: 'integer' },
      },
    },
  },
];
const JOBS = {
  jobs: [
    {
      id: 'abc',
      title: 'Lead Design Systems Designer',
      company: { name: 'Acme' },
      url: 'https://jobs.intodesignsystems.com/jobs/abc',
      location: 'Remote (EU)',
      posted_at: '2026-10-20',
      description: '<p>Lead our <b>design system</b>.</p>',
    },
    {
      id: 'def',
      title: 'Design Technologist',
      company_name: 'Beta',
      link: 'https://beta.example/careers/1',
      workplace_type: 'Hybrid',
      location: 'Berlin',
    },
    { id: 'abc', title: 'Repeat', url: 'https://jobs.intodesignsystems.com/jobs/abc' },
    { id: 'x', title: 'No link', url: 'javascript:1' },
  ],
};
const sse = (id: number, result: unknown) =>
  `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`;

describe('Into Design Systems (MCP)', () => {
  it('reads an answer from JSON or from an SSE stream, by id', () => {
    expect(rpcResult(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { ok: 1 } }), 2)).toEqual({
      ok: 1,
    });
    expect(rpcResult(`: ping\n${sse(1, { a: 1 })}${sse(3, { b: 2 })}`, 3)).toEqual({ b: 2 });
    expect(() => rpcResult(JSON.stringify({ id: 1, error: { message: 'nope' } }), 1)).toThrow(
      /nope/,
    );
    expect(() => rpcResult('', 1)).toThrow(/no answer/);
  });

  it('picks the job search tool and fills its query, remote and limit', () => {
    expect(pickSearch(TOOLS)).toEqual({
      name: 'search_jobs',
      args: { query: IDS_QUERY, remote: true, limit: 100 },
    });
    expect(pickSearch([{ name: 'get_stats' }])).toBeNull();
    expect(pickSearch(undefined)).toBeNull();
  });

  it('maps postings from structured content or JSON text, once each, web links only', () => {
    const a = parseIdsResult({ structuredContent: JOBS });
    const b = parseIdsResult({ content: [{ type: 'text', text: JSON.stringify(JOBS.jobs) }] });
    expect(b).toEqual(a);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({
      source: 'ids',
      sourceId: 'ids:abc',
      title: 'Lead Design Systems Designer',
      company: 'Acme',
      location: 'Remote (EU)',
      remote: true,
      url: 'https://jobs.intodesignsystems.com/jobs/abc',
      descriptionText: 'Lead our design system.',
      postedAt: '2026-10-20T00:00:00.000Z',
    });
    expect(a[1]).toMatchObject({ company: 'Beta', url: 'https://beta.example/careers/1' });
    expect(a[1].remote).toBeUndefined();
    expect(parseIdsResult({ content: [{ type: 'text', text: 'not json' }] })).toEqual([]);
  });

  it('initializes, keeps the session id, lists tools and calls the search', async () => {
    const bodies: { method: string; session: string | null }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(IDS_MCP);
      const msg = JSON.parse(String(init!.body));
      const h = init!.headers as Record<string, string>;
      bodies.push({ method: msg.method, session: h['mcp-session-id'] ?? null });
      const headers = { 'mcp-session-id': 'sess-1', 'content-type': 'text/event-stream' };
      if (msg.method === 'initialize')
        return new Response(sse(msg.id, { capabilities: {} }), { headers });
      if (msg.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (msg.method === 'tools/list')
        return new Response(sse(msg.id, { tools: TOOLS }), { headers });
      expect(msg.params).toEqual({
        name: 'search_jobs',
        arguments: { query: IDS_QUERY, remote: true, limit: 100 },
      });
      return new Response(sse(msg.id, { structuredContent: JOBS }), { headers });
    });
    const ctx: FeedContext = {
      fetch: f,
      env: () => undefined,
      now: () => new Date(),
      sleep: async () => {},
    };
    expect(await readIntoDesignSystems(ctx)).toHaveLength(2);
    expect(bodies).toEqual([
      { method: 'initialize', session: null },
      { method: 'notifications/initialized', session: 'sess-1' },
      { method: 'tools/list', session: 'sess-1' },
      { method: 'tools/call', session: 'sess-1' },
    ]);
  });

  it('a refusal fails the read with its status', async () => {
    const ctx: FeedContext = {
      fetch: vi.fn(async () => new Response('', { status: 401 })),
      env: () => undefined,
      now: () => new Date(),
      sleep: async () => {},
    };
    await expect(readIntoDesignSystems(ctx)).rejects.toThrow(/Into Design Systems: HTTP 401/);
  });
});

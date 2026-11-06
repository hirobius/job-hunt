// Crash reports (#47) carry no personal data and can't flood the table.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_ANON_KEY } from './config';
import {
  browserOf,
  buildReport,
  createReporter,
  installErrorReporting,
  MAX_MESSAGE,
  MAX_PER_PAGE,
  MAX_STACK,
  routeOf,
  scrubText,
  supabaseSender,
  type ErrorReport,
} from './errorReport';

const where = { hash: '#/queue/abc123', userAgent: 'Mozilla/5.0 Chrome/130.0 Safari/537.36' };

describe('error reports (#47)', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('strips emails and URL queries from text', () => {
    expect(scrubText('no user ada@example.com here', 100)).toBe('no user [email] here');
    expect(scrubText('at https://roleflame.vercel.app/?add=https://x.io/j#/queue/9', 200)).toBe(
      'at https://roleflame.vercel.app/',
    );
    expect(scrubText(`Unexpected token 'A', "Acme Corp notes" is not valid JSON`, 200)).toBe(
      `Unexpected token 'A', "…" is not valid JSON`,
    );
  });

  it('strips a bare session token (a JWT or a Bearer header), wherever a message echoes one', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEiLCJlbWFpbCI6ImEifQ.c2lnbmF0dXJlLXBhcnQ';
    expect(scrubText(`Invalid JWT ${jwt} expired`, 300)).toBe('Invalid JWT [token] expired');
    expect(scrubText(`fetch failed (Authorization: Bearer ${jwt})`, 300)).toBe(
      'fetch failed (Authorization: Bearer [token])',
    );
    expect(scrubText('Bearer abc.def-ghi_123', 300)).toBe('Bearer [token]');
  });

  it('keeps only the tab of the route, never a job id', () => {
    expect(routeOf('#/queue/abc123')).toBe('queue');
    expect(routeOf('#/copy-deck/snippet-1')).toBe('copy-deck');
    expect(routeOf('')).toBe('');
    expect(routeOf('#/<script>')).toBe('');
  });

  it('keeps only the browser family and major version', () => {
    expect(browserOf(where.userAgent)).toBe('Chrome 130');
    expect(browserOf('Mozilla/5.0 (iPhone) Version/18.1 Mobile/15E148 Safari/604.1')).toBe(
      'Safari 18 mobile',
    );
    expect(browserOf('Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge 130');
    expect(browserOf('curl/8')).toBe('Other');
  });

  it('builds a capped report with no user fields', () => {
    const err = new TypeError(`bad ${'x'.repeat(1000)}`);
    err.stack = `TypeError: bad\n${'    at f (https://a.app/assets/x.js:1:2)\n'.repeat(200)}`;
    const r = buildReport('render', err, where);
    expect(Object.keys(r).sort()).toEqual(['browser', 'kind', 'message', 'route', 'stack']);
    expect(r.message.startsWith('TypeError: bad')).toBe(true);
    expect(r.message.length).toBe(MAX_MESSAGE);
    expect(r.stack!.length).toBe(MAX_STACK);
    expect(r.route).toBe('queue');
    expect(buildReport('rejection', 'plain string', where)).toMatchObject({
      message: 'plain string',
      stack: null,
    });
  });

  it('sends each distinct error once, at most a few per page, and never throws', async () => {
    const sent: ErrorReport[] = [];
    const report = createReporter(async (r) => {
      sent.push(r);
      throw new Error('network down');
    });
    for (let i = 0; i < 2; i++) report('error', new Error('same'));
    for (let i = 0; i < 20; i++) report('error', new Error(`e${i}`));
    await vi.waitFor(() => expect(sent.length).toBe(MAX_PER_PAGE));
    expect(sent.filter((r) => r.message === 'Error: same')).toHaveLength(1);
  });

  it('never reports from localhost (dev, E2E, gallery)', () => {
    expect(window.location.hostname).toBe('localhost');
    expect(installErrorReporting(async () => undefined)).toBe(false);
  });

  it('sends with the public key only, never a signed-in session token', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const report = buildReport('error', new Error('x'), where);
    await supabaseSender(fetchImpl as unknown as typeof fetch)(report);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/rest\/v1\/rpc\/report_client_error$/);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SUPABASE_ANON_KEY}`);
    expect(headers.apikey).toBe(SUPABASE_ANON_KEY);
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body as string)).toEqual({
      p_kind: report.kind,
      p_message: report.message,
      p_stack: report.stack,
      p_route: report.route,
      p_browser: report.browser,
    });
  });
});

describe('links in a crash report (security review 2026-10-28)', () => {
  it("keeps a link's host but not a path that names a posting", () => {
    const s = scrubText(
      'URL constructor: https://boards.greenhouse.io/acme/jobs/123 is not valid',
      300,
    );
    expect(s).not.toContain('acme');
    expect(s).toContain('https://boards.greenhouse.io/');
  });

  it("keeps a stack frame's script path", () => {
    expect(scrubText('at f (https://a.app/assets/x-1a.js:1:2)', 300)).toContain(
      '/assets/x-1a.js:1:2',
    );
  });
});

// Crash reports (#47) carry no personal data and can't flood the table.
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  type ErrorReport,
} from './errorReport';

const where = { hash: '#/queue/abc123', userAgent: 'Mozilla/5.0 Chrome/130.0 Safari/537.36' };

describe('error reports (#47)', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('strips emails and URL queries from text', () => {
    expect(scrubText('no user ada@example.com here', 100)).toBe('no user [email] here');
    expect(scrubText('at https://job-hunt-jade.vercel.app/?add=https://x.io/j#/queue/9', 200)).toBe(
      'at https://job-hunt-jade.vercel.app/',
    );
    expect(scrubText(`Unexpected token 'A', "Acme Corp notes" is not valid JSON`, 200)).toBe(
      `Unexpected token 'A', "…" is not valid JSON`,
    );
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
});

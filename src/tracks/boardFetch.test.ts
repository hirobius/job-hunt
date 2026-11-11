import { describe, expect, it, vi } from 'vitest';
import { boardApiUrl } from '../feed/sources/ats';
import { GUARDED_KINDS, allowedUrl, guardedFetch } from './boardFetch';

const ok = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe('boardFetch: the SSRF guard on the five newer board kinds', () => {
  it("lets out each kind's own list URL, as ats.ts builds it from a slug", () => {
    for (const kind of GUARDED_KINDS)
      expect(allowedUrl(kind, boardApiUrl({ kind, slug: 'acme' })), kind).toBe(true);
  });

  it('refuses hosts off the list, other schemes, ports, credentials and nested labels', () => {
    expect(allowedUrl('bamboohr', 'https://evil.com/careers/list')).toBe(false);
    expect(allowedUrl('bamboohr', 'https://bamboohr.com.evil.com/careers/list')).toBe(false);
    expect(allowedUrl('bamboohr', 'https://a.b.bamboohr.com/careers/list')).toBe(false);
    expect(allowedUrl('bamboohr', 'http://acme.bamboohr.com/careers/list')).toBe(false);
    expect(allowedUrl('pinpoint', 'https://acme.pinpointhq.com:8443/postings.json')).toBe(false);
    expect(allowedUrl('breezy', 'https://u:p@acme.breezy.hr/json')).toBe(false); // pii-allow: URL credentials test
    expect(allowedUrl('rippling', 'https://api.rippling.com.evil.com/x')).toBe(false);
    expect(allowedUrl('gem', 'https://api.gem.com@evil.com/x')).toBe(false); // pii-allow: userinfo SSRF test
    expect(allowedUrl('gem', 'not a url')).toBe(false);
  });

  it('sends redirect: error and never calls out for a refused URL', async () => {
    const f = vi.fn(async () => ok('{"result":[]}'));
    await guardedFetch('bamboohr', f)('https://acme.bamboohr.com/careers/list');
    expect(f).toHaveBeenCalledWith('https://acme.bamboohr.com/careers/list', {
      redirect: 'error',
    });
    await expect(guardedFetch('bamboohr', f)('https://169.254.169.254/')).rejects.toThrow(
      /refused/,
    );
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('fails a read that was redirected, or answered with a 3xx', async () => {
    const moved = ok('[]');
    Object.defineProperty(moved, 'redirected', { value: true });
    await expect(
      guardedFetch('gem', async () => moved)('https://api.gem.com/job_board/v0/acme/job_posts/'),
    ).rejects.toThrow(/redirected/);
    const landed = ok('[]');
    Object.defineProperty(landed, 'url', { value: 'https://evil.com/' });
    await expect(
      guardedFetch('gem', async () => landed)('https://api.gem.com/job_board/v0/acme/job_posts/'),
    ).rejects.toThrow(/redirected/);
    await expect(
      guardedFetch(
        'breezy',
        async () => new Response(null, { status: 302 }),
      )('https://acme.breezy.hr/json'),
    ).rejects.toThrow(/redirect refused/);
  });

  it('caps the body: by Content-Length, and by the stream when the header is missing', async () => {
    const big = 'x'.repeat(2000);
    await expect(
      guardedFetch(
        'pinpoint',
        async () => ok(big, { headers: { 'content-length': '2000' } }),
        1000,
      )('https://acme.pinpointhq.com/postings.json'),
    ).rejects.toThrow(/over 1000 bytes/);
    await expect(
      guardedFetch(
        'pinpoint',
        async () => ok(big),
        1000,
      )('https://acme.pinpointhq.com/postings.json'),
    ).rejects.toThrow(/over 1000 bytes/);
    const r = await guardedFetch(
      'pinpoint',
      async () => ok('{"data":[]}'),
      1000,
    )('https://acme.pinpointhq.com/postings.json');
    expect(await r.json()).toEqual({ data: [] });
  });

  it('passes a failed status through, so the reader names it', async () => {
    const r = await guardedFetch(
      'rippling',
      async () => new Response('gone', { status: 404 }),
    )('https://api.rippling.com/platform/api/ats/v1/board/acme/jobs');
    expect(r.status).toBe(404);
  });
});

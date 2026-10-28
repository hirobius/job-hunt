import { describe, expect, it, vi } from 'vitest';
import { fetchProxied, postingsFrom, proxyUrl } from './proxied';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'dsjobs:https://designsystems.jobs/companies/acme/lead',
  source: 'dsjobs',
  title: 'Design Systems Lead',
  company: 'Acme',
  url: 'https://designsystems.jobs/companies/acme/lead',
  location: 'Remote',
  mode: 'remote',
  postedAt: '2026-10-27T20:25:00.000Z',
  text: 'Product Designer · Full time · Remote',
  ...over,
});

describe('proxyUrl', () => {
  it('asks same-origin /api/boards, with the term only when given', () => {
    expect(proxyUrl('dsjobs')).toBe('/api/boards?src=dsjobs');
    expect(proxyUrl('himalayas', ' design systems ')).toBe(
      '/api/boards?src=himalayas&q=design+systems',
    );
  });
});

describe('postingsFrom', () => {
  it('keeps well-formed rows of this source', () => {
    expect(postingsFrom({ postings: [row()] }, 'dsjobs')).toEqual([row()]);
  });

  it('drops rows of another source, non-web links and bad fields', () => {
    const out = postingsFrom(
      {
        postings: [
          row({ id: 'wwr:1' }),
          row({ url: 'javascript:alert(1)' }),
          row({ mode: 'space', postedAt: 'soon', salaryMin: -1, currency: 'dollars', title: 7 }),
          'junk',
        ],
      },
      'dsjobs',
    );
    expect(out).toHaveLength(1);
    expect(out[0].mode).toBeUndefined();
    expect(out[0].postedAt).toBeUndefined();
    expect(out[0].title).toBe('');
    expect(out[0].salaryMin).toBeUndefined();
    expect(postingsFrom(null, 'dsjobs')).toEqual([]);
  });
});

describe('fetchProxied', () => {
  it('returns the board unfiltered: matching is downstream (and the scorer’s on a scored track)', async () => {
    const fetchJson = async () => ({
      postings: [row(), row({ id: 'dsjobs:2', title: 'Design Technologist', text: '' })],
    });
    expect((await fetchProxied('dsjobs', fetchJson)).map((p) => p.id)).toEqual([
      row().id,
      'dsjobs:2',
    ]);
  });

  it('one request per URL while it is in flight', async () => {
    let release!: (v: unknown) => void;
    const fetchJson = vi.fn(() => new Promise((r) => (release = r)));
    const a = fetchProxied('himalayas', fetchJson, 'design systems');
    const b = fetchProxied('himalayas', fetchJson, 'design systems');
    release({ postings: [] });
    await Promise.all([a, b]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('a search board sends its term, and reads nothing without one', async () => {
    const fetchJson = vi.fn(async () => ({ postings: [] }));
    await fetchProxied('himalayas', fetchJson, 'design systems');
    expect(await fetchProxied('himalayas', fetchJson, ' ')).toEqual([]);
    expect(fetchJson.mock.calls).toEqual([
      ['/api/boards?src=himalayas&q=design+systems', undefined],
    ]);
  });

  it('a whole-feed board ignores the term', async () => {
    const fetchJson = vi.fn(async () => ({ postings: [] }));
    await fetchProxied('dsjobs', fetchJson, 'design systems');
    expect(fetchJson).toHaveBeenCalledWith('/api/boards?src=dsjobs', undefined);
  });

  it('after a partial answer, the next read skips the session cache', async () => {
    const fetchJson = vi.fn(async (_url: string, _o?: { fresh?: boolean }) => ({
      postings: [],
      partial: fetchJson.mock.calls.length === 1,
    }));
    await fetchProxied('wwr', fetchJson);
    await fetchProxied('wwr', fetchJson);
    await fetchProxied('wwr', fetchJson);
    expect(fetchJson.mock.calls.map((c) => c[1])).toEqual([undefined, { fresh: true }, undefined]);
  });
});

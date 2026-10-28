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
  it('filters by the phrase rule: "design system" is never "system design"', async () => {
    const fetchJson = async () => ({
      postings: [
        row(),
        row({ id: 'dsjobs:2', title: 'System Design Engineer', text: '' }),
        row({ id: 'dsjobs:3', title: 'Designer', text: 'You will own our design systems.' }),
      ],
    });
    const out = await fetchProxied('dsjobs', 'design system', fetchJson);
    expect(out.map((p) => p.id)).toEqual([row().id, 'dsjobs:3']);
  });

  it('a sweep’s terms share one request while it is in flight', async () => {
    let release!: (v: unknown) => void;
    const fetchJson = vi.fn(() => new Promise((r) => (release = r)));
    const a = fetchProxied('dsjobs', 'design system', fetchJson);
    const b = fetchProxied('dsjobs', 'design technologist', fetchJson);
    release({ postings: [row()] });
    expect((await a).length + (await b).length).toBe(1);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    const c = fetchProxied('dsjobs', 'design system', fetchJson);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    release({ postings: [] });
    await c;
  });

  it('a search source sends its term', async () => {
    const fetchJson = vi.fn(async () => ({ postings: [] }));
    await fetchProxied('himalayas', 'design systems', fetchJson);
    expect(fetchJson).toHaveBeenCalledWith('/api/boards?src=himalayas&q=design+systems');
  });
});

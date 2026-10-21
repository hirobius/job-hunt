import { describe, expect, it, vi } from 'vitest';
import {
  createCompanySuggester,
  knownCompanies,
  localSuggestions,
  mergeSuggestions,
  parseWikidata,
  parseYcSuggestions,
  wikidataUrl,
  YC_SUGGEST_URL,
} from './companySuggest';

describe('knownCompanies', () => {
  it('gathers watched boards, saved jobs, dream companies and targets, one per name', () => {
    const known = knownCompanies({
      tiles: [
        { name: 'Figma', url: 'https://boards.greenhouse.io/figma' },
        { name: 'A search', url: 'https://www.google.com/search?q=x' },
      ],
      jobs: [{ company: 'Plaid' }, { company: 'figma' }, {}],
      dreams: [{ company: 'Quillfeather Labs', website: 'https://www.quillfeather.example/' }],
      targets: [{ company: 'Tidewater', website: 'https://tidewater.example' }],
    });
    expect(known).toEqual([
      { name: 'Figma', detail: 'Greenhouse board' },
      { name: 'Plaid', detail: 'In your Pipeline' },
      { name: 'Quillfeather Labs', detail: 'quillfeather.example' },
      { name: 'Tidewater', detail: 'tidewater.example' },
    ]);
  });
});

describe('localSuggestions', () => {
  const known = [
    { name: 'Quillfeather Labs', detail: 'quillfeather.example' },
    { name: 'Acme Quill', detail: 'In your Pipeline' },
    { name: 'Figma', detail: 'Greenhouse board' },
  ];
  it('matches a word start, prefix matches first, and skips names already picked', () => {
    expect(localSuggestions('quill', known, []).map((s) => s.name)).toEqual([
      'Quillfeather Labs',
      'Acme Quill',
    ]);
    expect(localSuggestions('quill', known, ['quillfeather labs']).map((s) => s.name)).toEqual([
      'Acme Quill',
    ]);
    expect(localSuggestions('q', known, [])).toEqual([]);
    expect(localSuggestions('quill', known, [])[0].source).toBe('tracks');
  });
});

describe('parseYcSuggestions', () => {
  it('names a match with its domain and batch', () => {
    const body = [
      { name: 'Quillstack', website: 'https://quillstack.example', batch: 'Winter 2023' },
      { name: 'Other', website: '' },
      { nope: true },
    ];
    expect(parseYcSuggestions(body, 'quill')).toEqual([
      { name: 'Quillstack', detail: 'YC Winter 2023, quillstack.example', source: 'yc' },
    ]);
    expect(parseYcSuggestions({}, 'quill')).toEqual([]);
  });
});

describe('parseWikidata', () => {
  it('keeps company-like entities and names them by their description', () => {
    const body = {
      search: [
        { id: 'Q1', label: 'Quillon Media', description: 'British media company' },
        { id: 'Q2', label: 'Quill', description: 'writing implement' },
        { id: 'Q3', label: 'Stripe', description: 'Irish-American financial services firm' },
        { id: 'Q4', description: 'no label' },
      ],
    };
    expect(parseWikidata(body)).toEqual([
      { name: 'Quillon Media', detail: 'Wikidata, British media company', source: 'wikidata' },
      {
        name: 'Stripe',
        detail: 'Wikidata, Irish-American financial services firm',
        source: 'wikidata',
      },
    ]);
  });

  it('asks the keyless, CORS-open search endpoint', () => {
    const u = new URL(wikidataUrl('Acme & Co'));
    expect(u.origin).toBe('https://www.wikidata.org');
    expect(u.searchParams.get('action')).toBe('wbsearchentities');
    expect(u.searchParams.get('search')).toBe('Acme & Co');
    expect(u.searchParams.get('origin')).toBe('*');
  });
});

describe('mergeSuggestions', () => {
  it('keeps the first of each name, local first, and caps the list', () => {
    const merged = mergeSuggestions(
      [
        [{ name: 'Quill', detail: 'a', source: 'tracks' }],
        [
          { name: 'quill', detail: 'b', source: 'yc' },
          { name: 'Quillstack', detail: 'c', source: 'yc' },
        ],
      ],
      2,
    );
    expect(merged.map((s) => `${s.name}:${s.source}`)).toEqual(['Quill:tracks', 'Quillstack:yc']);
  });
});

describe('createCompanySuggester', () => {
  const yc = [{ name: 'Quillstack', website: 'https://quillstack.example', batch: 'W23' }];
  const wiki = { search: [{ id: 'Q1', label: 'Quillon Media', description: 'media company' }] };

  it('asks YC once and Wikidata per query; a failing source drops out, the rest stay', async () => {
    const fetchJson = vi.fn(async (url: string) => {
      if (url === YC_SUGGEST_URL) return yc;
      if (url.includes('wikidata')) throw new Error('blocked');
      return null;
    });
    const suggest = createCompanySuggester(fetchJson);
    expect((await suggest('quill')).map((s) => s.name)).toEqual(['Quillstack']);
    await suggest('quills');
    expect(fetchJson.mock.calls.filter(([u]) => u === YC_SUGGEST_URL)).toHaveLength(1);
  });

  it('caches answers in memory by query', async () => {
    const fetchJson = vi.fn(async (url: string) => (url === YC_SUGGEST_URL ? yc : wiki));
    const suggest = createCompanySuggester(fetchJson);
    const first = await suggest('Quill');
    expect(first.map((s) => s.source)).toEqual(['yc', 'wikidata']);
    await suggest('quill ');
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('answers nothing for under two characters, without a request', async () => {
    const fetchJson = vi.fn();
    expect(await createCompanySuggester(fetchJson)('q')).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

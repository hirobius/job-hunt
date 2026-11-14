import { afterEach, describe, expect, it } from 'vitest';
import { LANDING_META, landingChunks, type BundleChunk } from './landingChunks';
import { landingViewOf, preloadLanding } from './landingPreload';

describe('landingViewOf', () => {
  it.each([
    ['', 'review'],
    ['#', 'review'],
    ['#/review', 'review'],
    ['#/review/abc123', 'review'],
    ['#/find', 'review'],
    ['#/today', 'review'],
    ['#/apply', 'apply'],
    ['#/apply?from=/review', 'apply'],
    ['#/queue', 'apply'],
    ['#/apply/job-1', 'job'],
    ['#/queue/job-1', 'job'],
    ['#/apply/company/acme', null],
    ['#/discover', null],
    ['#access_token=x', null],
  ])('%s → %s', (hash, view) => expect(landingViewOf(hash)).toBe(view));
});

describe('preloadLanding', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });
  const meta = (content: string) => {
    const m = document.createElement('meta');
    m.name = LANDING_META;
    m.content = content;
    document.head.appendChild(m);
  };

  it('adds a modulepreload per chunk and a style preload per CSS file', () => {
    meta(
      JSON.stringify({
        review: ['/assets/Today-a.js', '/assets/Today-b.css'],
        apply: ['/assets/x.js'],
      }),
    );
    expect(preloadLanding(document, '#/review')).toEqual([
      '/assets/Today-a.js',
      '/assets/Today-b.css',
    ]);
    const links = [...document.head.querySelectorAll('link')];
    expect(links.map((l) => [l.rel, l.getAttribute('href'), l.getAttribute('as')])).toEqual([
      ['modulepreload', '/assets/Today-a.js', null],
      ['preload', '/assets/Today-b.css', 'style'],
    ]);
  });

  it('does nothing without the meta, with a bad one, or for a view it does not preload', () => {
    expect(preloadLanding(document, '')).toEqual([]);
    meta('not json');
    expect(preloadLanding(document, '')).toEqual([]);
    document.head.innerHTML = '';
    meta(JSON.stringify({ review: ['/assets/a.js'] }));
    expect(preloadLanding(document, '#/apply/company/acme')).toEqual([]);
    expect(document.head.querySelectorAll('link')).toHaveLength(0);
  });

  it('only takes same-site asset paths', () => {
    meta(JSON.stringify({ review: ['https://evil.example/x.js', '/assets/ok.js', 3] }));
    expect(preloadLanding(document, '')).toEqual(['/assets/ok.js']);
  });
});

describe('landingChunks', () => {
  const chunk = (fileName: string, more: Partial<BundleChunk> = {}): BundleChunk => ({
    type: 'chunk',
    fileName,
    imports: [],
    ...more,
  });

  it("lists each view's closure minus what the entry loads, with its CSS", () => {
    const bundle: BundleChunk[] = [
      chunk('assets/index.js', { isEntry: true, imports: ['assets/vendor.js'] }),
      chunk('assets/vendor.js'),
      chunk('assets/Today.js', {
        facadeModuleId: '/repo/src/Today.tsx',
        imports: ['assets/vendor.js', 'assets/feed.js'],
        viteMetadata: { importedCss: new Set(['assets/Today.css']) },
      }),
      chunk('assets/feed.js', { imports: ['assets/vendor.js'] }),
      // TrackerView shares the JobPage chunk (no facade of its own).
      chunk('assets/JobPage.js', {
        facadeModuleId: '/repo/src/JobPage.tsx',
        moduleIds: ['/repo/src/JobPage.tsx', '/repo/src/TrackerView.tsx'],
        imports: ['assets/vendor.js'],
      }),
      { type: 'asset', fileName: 'assets/Today.css' },
    ];
    expect(landingChunks(bundle)).toEqual({
      review: ['/assets/Today.js', '/assets/Today.css', '/assets/feed.js'],
      apply: ['/assets/JobPage.js'],
      job: ['/assets/JobPage.js'],
    });
  });

  it('leaves out a view it cannot find', () => {
    expect(landingChunks([chunk('assets/index.js', { isEntry: true })])).toEqual({});
  });
});

// The size budget fails `vite build` when the JS/CSS a phone downloads before first paint, or a
// lazy chunk, outgrows src/sizeBudget.ts (the `size-budget` plugin in vite.config.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkBudget, gzipSize, type BuiltFile } from './sizeBudget';

// Incompressible text of a given gzip size, near enough.
const noise = (n: number) => {
  let s = '';
  let x = 1;
  while (s.length < n) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    s += String.fromCharCode(33 + (x % 90));
  }
  return s;
};

const FILES: BuiltFile[] = [
  {
    fileName: 'assets/index-AAAAAAAA.js',
    code: noise(1000),
    isEntry: true,
    imports: ['assets/vendor-BBBBBBBB.js'],
  },
  { fileName: 'assets/vendor-BBBBBBBB.js', code: noise(2000), imports: [] },
  {
    fileName: 'assets/JobPage-CCCCCCCC.js',
    code: noise(3000),
    imports: ['assets/vendor-BBBBBBBB.js'],
  },
  { fileName: 'assets/vendor-DDDDDDDD.css', code: noise(500) },
  { fileName: 'assets/JobPage-EEEEEEEE.css', code: noise(800) },
];

describe('checkBudget', () => {
  it('counts the entry and its static imports as initial JS, lazy chunks and their CSS apart', () => {
    const { initialJs, initialCss, over } = checkBudget(FILES);
    expect(initialJs).toBe(gzipSize(FILES[0].code) + gzipSize(FILES[1].code));
    expect(initialCss).toBe(gzipSize(FILES[3].code));
    expect(over).toEqual([]);
  });

  it('names every limit it breaks', () => {
    const { over } = checkBudget(FILES, {
      initialJsGzip: 100,
      initialCssGzip: 100,
      lazyChunkGzip: 100,
    });
    expect(over).toHaveLength(3);
    expect(over[0]).toMatch(/^initial JS .* gzip > 0\.1 kB$/);
    expect(over[1]).toMatch(/^initial CSS /);
    expect(over[2]).toMatch(/^assets\/JobPage-CCCCCCCC\.js /);
  });

  it('runs on every build', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(
      /checkBudget\(files\)[\s\S]*this\.error\(/,
    );
  });
});

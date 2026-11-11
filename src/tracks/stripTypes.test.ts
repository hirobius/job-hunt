// The server-shared files (src/tracks and what it imports, the dry-run script) run under Node's
// --experimental-strip-types (npm run sync:dry-run) and Deno (sync-postings). Strip-only mode
// rejects TypeScript that emits code (parameter properties, enums, namespaces), and neither
// vitest nor the app's tsc catches it: #585 broke the dry run with a parameter property. This
// checks them with `erasableSyntaxOnly` (tsconfig.strip.json), TS1294 being its error.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(__dirname, '../..');
const ERASABLE_ONLY = 1294;

function program(configFile: string) {
  const read = ts.readConfigFile(configFile, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configFile));
  return { parsed, program: ts.createProgram(parsed.fileNames, parsed.options) };
}

describe('strip-types: server-shared files use erasable TypeScript only', () => {
  it('covers src/tracks and the dry-run script, with erasableSyntaxOnly on', () => {
    const { parsed } = program(path.join(root, 'tsconfig.strip.json'));
    expect(parsed.options.erasableSyntaxOnly).toBe(true);
    const files = parsed.fileNames.map((f) => path.relative(root, f));
    expect(files).toContain('src/tracks/boardFetch.ts');
    expect(files).toContain('src/tracks/plan.ts');
    expect(files).toContain('scripts/dry-run-sync.ts');
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
  });

  it(
    'has no syntax strip-only mode rejects, in them or anything they import',
    { timeout: 60_000 },
    () => {
      const { program: p } = program(path.join(root, 'tsconfig.strip.json'));
      const bad = ts
        .getPreEmitDiagnostics(p)
        .filter((d) => d.code === ERASABLE_ONLY)
        .map((d) => {
          const at =
            d.file && d.start !== undefined && d.file.getLineAndCharacterOfPosition(d.start);
          return `${d.file ? path.relative(root, d.file.fileName) : '?'}:${at ? at.line + 1 : '?'}`;
        });
      expect(bad).toEqual([]);
    },
  );

  it('flags a parameter property (the #585 break)', () => {
    const file = 'probe.ts';
    const src =
      'export class E extends Error { constructor(m: string, readonly status?: number) { super(m); } }';
    const host = ts.createCompilerHost({});
    const get = host.getSourceFile;
    host.getSourceFile = (name, lang) =>
      name === file ? ts.createSourceFile(file, src, lang) : get.call(host, name, lang);
    const p = ts.createProgram(
      [file],
      { erasableSyntaxOnly: true, noEmit: true, lib: ['lib.es2020.d.ts'] },
      host,
    );
    expect(ts.getPreEmitDiagnostics(p).some((d) => d.code === ERASABLE_ONLY)).toBe(true);
  });
});

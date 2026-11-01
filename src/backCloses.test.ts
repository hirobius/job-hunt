// Return paths (Adrian 2026-10-22): the browser's Back closes an open sheet (a dialog, a menu, a
// popover) and stays on the page. The review walks found sheets that had been missed one at a time
// (Follow up, then Sign in, the location popover, a row's menu, Recently removed), so every sheet
// root in src is held here: controlled, and its file wires as many sheets to Back
// (useBackCloses / useBackSheet, useBackCloses.ts) as it renders.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : [];
  });
}

/** Sheets whose open state, and so their Back wiring, lives in the file that mounts them. */
const WIRED_ELSEWHERE: Record<string, number> = {};

/** An overlay root's opening tag: `<Dialog`, `<AlertDialog`, `<Menu`, `<HdsMenu`, `<Popover`. */
const ROOT = /<(?:Dialog|AlertDialog|Menu|HdsMenu|Popover)(?=[\s>])[^>]*>/g;

describe('every sheet closes on Back', () => {
  const files = sourceFiles(SRC)
    .map((f) => ({ name: relative(SRC, f), text: readFileSync(f, 'utf8') }))
    .map((f) => ({ ...f, roots: f.text.match(ROOT) ?? [] }))
    .filter((f) => f.roots.length > 0);

  it('finds the sheets', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('each sheet root is controlled', () => {
    const loose = files.flatMap((f) =>
      f.roots.filter((t) => !/\bopen=|\{\.\.\./.test(t)).map((t) => `${f.name}: ${t}`),
    );
    expect(loose).toEqual([]);
  });

  it('each file wires as many sheets to Back as it renders', () => {
    const short = files
      .map((f) => {
        const wired =
          (f.text.match(/\buseBack(?:Closes|Sheet)\(/g) ?? []).length +
          (WIRED_ELSEWHERE[f.name] ?? 0);
        return { name: f.name, roots: f.roots.length, wired };
      })
      .filter((f) => f.wired < f.roots);
    expect(short).toEqual([]);
  });
});

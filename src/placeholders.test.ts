// A clean first run (Adrian 2026-10-22): an empty field shows only its own name as the
// placeholder ("Job title", "Company", "Job description"), never an example. This fails on a
// placeholder with "e.g.", a made-up company or an example address anywhere in the app's source.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'test' ? [] : sourceFiles(p);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : [];
  });
}

/** Every literal placeholder in a file: `placeholder="…"`, `placeholder={'…'}` or `placeholder: '…'`. */
const placeholdersIn = (text: string) =>
  [...text.matchAll(/placeholder(?:=\{?|:\s*)(["'`])([^"'`]*)\1/g)].map((m) => m[2]);

const EXAMPLE = /\be\.g\.|\bfor example\b|\bacme\b|example\.(com|org|net)|you@|\bjane\b|\bjohn\b/i;

describe('placeholders are the field’s own name', () => {
  it('no placeholder in the app shows an example or a made-up name', () => {
    const offenders = sourceFiles(SRC).flatMap((f) =>
      placeholdersIn(readFileSync(f, 'utf8'))
        .filter((p) => EXAMPLE.test(p) || /\n/.test(p) || /\\n/.test(p))
        .map((p) => `${f.slice(SRC.length + 1)}: ${p}`),
    );
    expect(offenders).toEqual([]);
  });

  it('finds the placeholders it checks (the scan is not empty)', () => {
    const all = sourceFiles(SRC).flatMap((f) => placeholdersIn(readFileSync(f, 'utf8')));
    // 10 since the Application kit (#705) and Apply's search (#716) left; a guard against an
    // empty scan, not a count to keep.
    expect(all.length).toBeGreaterThan(5);
  });
});

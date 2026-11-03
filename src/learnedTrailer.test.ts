// Learned: trailer gate (hirobius/ops#612): fix:/revert: commits must carry a `Learned: <one line>`
// trailer (`Learned: none` is allowed). scripts/check-learned-trailer.mjs is a byte-for-byte copy of
// the ops script, run from .husky/commit-msg. These tests run the real hook, as git would.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const hook = resolve(root, '.husky/commit-msg');
const fixture = (name: string) =>
  resolve(root, `scripts/fixtures/check-learned-trailer/${name}.example.txt`);
const msgFile = (msg: string) => {
  const f = join(mkdtempSync(join(tmpdir(), 'lt-hook-')), 'COMMIT_EDITMSG');
  writeFileSync(f, msg);
  return f;
};
const runHook = (file: string) => spawnSync('sh', [hook, file], { cwd: root, encoding: 'utf8' });

describe('husky commit-msg hook: Learned: trailer (ops#612)', () => {
  it('rejects a fix: commit with no Learned: line', () => {
    const r = runHook(msgFile('fix(tracker): stale stage chip\n\nBody only.\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Learned:');
    expect(runHook(fixture('violating')).status).toBe(1);
  });

  it('accepts a fix: commit with a Learned: line', () => {
    const r = runHook(
      msgFile('fix(tracker): stale stage chip\n\nLearned: derive the chip from the row\n'),
    );
    expect(r.status, r.stderr).toBe(0);
    expect(runHook(msgFile('revert: undo chip\n\nLearned: none\n')).status).toBe(0);
    expect(runHook(fixture('passing')).status).toBe(0);
  });

  it('leaves a feat: commit untouched', () => {
    const r = runHook(msgFile('feat: company notes\n'));
    expect(r.status, r.stderr).toBe(0);
  });
});

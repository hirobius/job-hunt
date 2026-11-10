// HDS conformance gate (scripts/check-hds.mjs, `npm run check:hds`). Each test builds a small
// fixture repo in a temp folder and runs the real script on it, then the repo itself must pass.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const script = resolve(root, 'scripts/check-hds.mjs');
const dirs: string[] = [];

type Files = Record<string, string>;
function fixture(files: Files = {}, baseline: unknown[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'check-hds-'));
  dirs.push(dir);
  const base: Files = {
    'package.json': JSON.stringify({ dependencies: { '@hirobius/design-system': '0.40.0' } }),
    'hds-version.json': JSON.stringify({ latest: '0.40.0' }),
    'node_modules/@hirobius/design-system/package.json': JSON.stringify({ version: '0.40.0' }),
    'node_modules/@hirobius/design-system/src/app/data/component-api.json': JSON.stringify({
      components: {
        Button: {},
        Badge: {},
        EmptyState: {},
        List: {},
        ListItem: {},
        Sheet: {},
        Dialog: {},
        Page: {},
      },
    }),
    'hds-baseline.json': JSON.stringify({ entries: baseline }),
    'src/ok.tsx': 'export const ok = 1;\n',
    ...files,
  };
  for (const [p, body] of Object.entries(base)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  return dir;
}
const run = (dir: string) =>
  spawnSync(process.execPath, [script, '--root', dir], { encoding: 'utf8' });

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('check:hds', () => {
  it('passes a clean fixture', () => {
    expect(run(fixture()).status).toBe(0);
  });

  it('flags raw colours in CSS and TS strings, not issue refs in comments or regexes', () => {
    const r = run(
      fixture({
        'src/a.css': '/* #123 */ .a { color: #fff; background: rgb(0 0 0); }\n',
        'src/b.ts':
          "// #534\nconst q = /\"x'/g;\n/** see #107 */\nexport const c = 'hsl(0 0% 0%)';\n",
      }),
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NEW colour: src/a.css:1  #fff');
    expect(r.stderr).toContain('NEW colour: src/a.css:1  rgb(');
    expect(r.stderr).toContain('NEW colour: src/b.ts:4  hsl(');
    expect(r.stderr).not.toMatch(/#123|#534|#107/);
  });

  it('flags raw px for spacing, radius and type; allows 0, 1px, token fallbacks and hds-allow', () => {
    const r = run(
      fixture({
        'src/a.css': [
          '.a { padding: 12px; border-radius: 8px; font-size: 13px; }',
          '.b { margin: 0px; border-width: 1px; gap: 1px; width: 300px; }',
          '.c { border-radius: var(--primitive-radius-full, 999px); }',
          '.d { font-size: 16px; /* hds-allow: iOS zoom */ }',
        ].join('\n'),
        'src/b.tsx':
          'export const B = () => <div className="p-[10px] text-sm" style={{ gap: \'6px\' }} />;\n',
      }),
    );
    expect(r.status).toBe(1);
    for (const m of [
      'padding: 12px',
      'border-radius: 8px',
      'font-size: 13px',
      'p-[10px]',
      'gap: 6px',
    ])
      expect(r.stderr).toContain(m);
    expect(r.stderr).not.toMatch(/\b(0|1|999|16)px/);
  });

  it('flags a local copy of an HDS component, but not one that builds on it', () => {
    const r = run(
      fixture({
        'src/Copy.tsx':
          'export function StatusBadge() { return null; }\nexport function EmptyState() { return null; }\n',
        'src/Wrap.tsx':
          "import { Badge } from '@hirobius/design-system';\nexport function JobBadge() { return <Badge />; }\nexport function JobPage() { return null; }\n",
      }),
    );
    expect(r.stderr).toContain('StatusBadge duplicates HDS Badge');
    expect(r.stderr).toContain('EmptyState duplicates HDS EmptyState');
    expect(r.stderr).not.toContain('JobBadge');
    expect(r.stderr).not.toContain('JobPage');
  });

  it('needs an hds-gap tag on each stand-in, naming a known gap issue', () => {
    const tagged = '// hds-gap: hirobius/hds#1441\nexport function QuietEmpty() { return null; }\n';
    expect(run(fixture({ 'src/hds-gaps/QuietEmpty.tsx': tagged })).status).toBe(0);
    const r = run(
      fixture({
        'src/hds-gaps/Bare.ts': 'export const x = 1;\n',
        'src/hds-gaps/Wrong.ts': '// hds-gap: hirobius/hds#99\nexport const y = 1;\n',
      }),
    );
    expect(r.stderr).toContain('src/hds-gaps/Bare.ts  stand-in has no hds-gap tag');
    expect(r.stderr).toContain('hds#99 is not a known HDS gap issue');
  });

  it('guards the HDS version and the @hirobius registry', () => {
    const r = run(
      fixture({
        'node_modules/@hirobius/design-system/package.json': JSON.stringify({ version: '0.39.0' }),
        'hds-version.json': JSON.stringify({ latest: '0.41.0' }),
        '.npmrc': '# comment\n@hirobius:registry=https://npm.pkg.github.com\n',
      }),
    );
    expect(r.stderr).toContain('installed 0.39.0 != package.json 0.40.0');
    expect(r.stderr).toContain('hds-version.json 0.41.0 != package.json 0.40.0');
    expect(r.stderr).toContain('.npmrc maps @hirobius to https://npm.pkg.github.com');
    const ok = run(fixture({ '.npmrc': '# @hirobius:registry=https://npm.pkg.github.com\n' }));
    expect(ok.status).toBe(0);
  });

  it('lets baselined violations pass, and fails when one is fixed or lacks a redesign issue', () => {
    const files = { 'src/a.css': '.a { padding: 12px; }\n' };
    const entry = { rule: 'px', file: 'src/a.css', match: 'padding: 12px', count: 1 };
    expect(run(fixture(files, [{ ...entry, issue: 'job-hunt#548' }])).status).toBe(0);
    expect(run(fixture(files, [{ ...entry, issue: 'job-hunt#12' }])).stderr).toContain(
      'needs a redesign issue',
    );
    const fixed = run(fixture({}, [{ ...entry, issue: 'job-hunt#548' }]));
    expect(fixed.status).toBe(1);
    expect(fixed.stderr).toContain('FIXED');
    const more = run(
      fixture({ 'src/a.css': '.a { padding: 12px; } .b { padding: 12px; }\n' }, [
        { ...entry, issue: 'job-hunt#548' },
      ]),
    );
    expect(more.status).toBe(1);
  });

  it('catches a component declared first and exported after (default and named)', () => {
    const r = run(
      fixture({
        'src/A.tsx': 'function Button() { return null; }\nexport default Button;\n',
        'src/B.tsx': 'const Badge = () => null;\nexport { Badge as JobTag };\n',
      }),
    );
    expect(r.stderr).toContain('src/A.tsx  Button duplicates HDS Button');
    expect(r.stderr).toContain('src/B.tsx  Badge duplicates HDS Badge');
  });

  it('does not let an hds-gap tag excuse a copy that takes an HDS name', () => {
    const tag = '// hds-gap: hirobius/hds#1441\n';
    const r = run(
      fixture({
        'src/hds-gaps/EmptyState.tsx': `${tag}export function EmptyState() { return null; }\n`,
        'src/hds-gaps/JobSheet.tsx': `${tag}export function JobSheet() { return null; }\n`,
      }),
    );
    expect(r.stderr).toContain('EmptyState duplicates HDS EmptyState');
    expect(r.stderr).not.toContain('JobSheet');
  });

  it('scans .ts files for duplicates too, but not lazy re-exports', () => {
    const r = run(
      fixture({
        'src/a.ts': 'export const Button = (p: unknown) => p;\n',
        'src/lazy.ts': "export const StatusDialog = lazyView(() => import('./x'));\n",
      }),
    );
    expect(r.stderr).toContain('src/a.ts  Button duplicates HDS Button');
    expect(r.stderr).not.toContain('StatusDialog');
  });

  it('catches concatenated px, named colours and px sizes; allows hairlines and breakpoints', () => {
    const r = run(
      fixture({
        'src/a.ts': [
          "export const a = n + 'px';",
          'export const b = `${n}px`;',
          "export const q = window.matchMedia('(max-width: 640px)');",
          "export const s = { color: 'red', width: '320px', height: '1px' };",
        ].join('\n'),
        'src/b.css': [
          '.a { color: white; background: transparent; border: 1px solid black; }',
          '.b { width: 240px; max-height: 50px; height: 1px; }',
          '@media (min-width: 640px) { .c { color: currentColor; } }',
        ].join('\n'),
        'src/c.tsx': 'export const C = () => <div className="w-[12px] h-px" />;\n',
      }),
    );
    for (const m of [
      'src/a.ts:1  concatenated px',
      'src/a.ts:2  concatenated px',
      'color: red',
      'width: 320px',
      'color: white',
      'border: black',
      'width: 240px',
      'max-height: 50px',
      'w-[12px]',
    ])
      expect(r.stderr).toContain(m);
    expect(r.stderr).not.toMatch(/640px|\b1px|transparent|currentColor|a\.ts:3/);
  });

  it('passes on the repo itself, fast', () => {
    const t = Date.now();
    const r = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(Date.now() - t).toBeLessThan(10_000);
  });
});

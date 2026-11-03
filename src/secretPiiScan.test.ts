// Pre-push secret + PII scan (hirobius/ops#943). scripts/hooks/secret-pii-scan.mjs is a byte-for-byte
// copy of the ops script, run as the first stage of .husky/pre-push. Mirrors site-engine#298: the
// ops unit cases, the fixtures under scripts/fixtures/secret-pii-scan/ through real gitleaks with
// this repo's .gitleaks.toml, fail-closed without gitleaks, and a real `git push` through husky into
// a throwaway bare remote (husky must hand git's stdin straight to the scan, or it sees no refs).
// Lines holding fake PII carry `pii-allow` so pushing this file passes the scan.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type PushLine = { localRef: string; localSha: string; remoteRef: string; remoteSha: string };
type Finding = { rule: string; file: string; length: number };
type GitOps = {
  commitExists: (s: string) => boolean;
  mergeBase: (s: string) => string | null;
  isAncestor: (a: string, b: string) => boolean;
};
type ScanModule = {
  parsePushLines: (stdin: string) => PushLine[];
  resolveRanges: (lines: PushLine[], git: GitOps) => string[];
  findPii: (text: string, opts?: { plain?: boolean; label?: string }) => Finding[];
};

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'hooks', 'secret-pii-scan.mjs');
const FIXTURES = join(ROOT, 'scripts', 'fixtures', 'secret-pii-scan');
const HOOK = join(ROOT, '.husky', 'pre-push');
const HUSKY_BIN = join(ROOT, 'node_modules', 'husky', 'bin.js');
const ZERO = '0'.repeat(40);
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const HAS_GITLEAKS = spawnSync('gitleaks', ['version'], { stdio: 'ignore' }).status === 0;

const scan = async () => (await import(pathToFileURL(SCRIPT).href)) as ScanModule;

describe('findPii', () => {
  it('flags real-looking emails, US phones and SSNs on added lines only', async () => {
    const { findPii } = await scan();
    const diff = [
      '+++ b/notes.txt',
      '+call 509-555-2368 or mail jane.doe@acme-roofing.com', // pii-allow
      '+ssn 123-45-6789', // pii-allow
      '-old 509-555-2368', // pii-allow
      ' context jane.doe@acme-roofing.com', // pii-allow
    ].join('\n');
    expect(findPii(diff).map((f) => f.rule)).toEqual(['email', 'phone', 'ssn']);
  });
  it('ignores placeholders, noreply addresses and pii-allow lines', async () => {
    const { findPii } = await scan();
    const diff = [
      '+++ b/a.txt',
      '+x@example.com noreply@anthropic.com 1+bot@users.noreply.github.com',
      '+fake 509-555-0142',
      '+real 509-555-2368 # pii-allow',
    ].join('\n');
    expect(findPii(diff)).toEqual([]);
  });
  it('never returns the matched value', async () => {
    const { findPii } = await scan();
    const [f] = findPii('+++ b/a.txt\n+jane.doe@acme-roofing.com'); // pii-allow
    expect(JSON.stringify(f)).not.toContain('jane');
    expect(f).toMatchObject({ rule: 'email', file: 'a.txt', length: 25 });
  });
});

describe('resolveRanges', () => {
  const git: GitOps = { commitExists: () => true, mergeBase: () => C, isAncestor: () => true };
  it('scans remote..local, merge-base..local for a new branch, skips deletions', async () => {
    const { parsePushLines, resolveRanges } = await scan();
    const lines = parsePushLines(
      `refs/heads/x ${A} refs/heads/x ${B}\nrefs/heads/y ${A} refs/heads/y ${ZERO}\nrefs/heads/z ${ZERO} refs/heads/z ${B}\n`,
    );
    expect(resolveRanges(lines, git)).toEqual([`${B}..${A}`, `${C}..${A}`]);
  });
  it('falls back to the merge-base when main was merged in', async () => {
    const { parsePushLines, resolveRanges } = await scan();
    const lines = parsePushLines(`refs/heads/x ${A} refs/heads/x ${B}`);
    expect(resolveRanges(lines, { ...git, isAncestor: () => false })).toEqual([`${C}..${A}`]);
  });
  it('rejects a malformed stdin line', async () => {
    const { parsePushLines } = await scan();
    expect(() => parsePushLines('garbage')).toThrow(/40-character/);
  });
});

/** Throwaway repo: main + branch x that adds `content` to `file`. */
function repo(content: string, { file = 'a.txt', gitleaksConfig = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'spscan-'));
  const g = (...a: string[]) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'a.txt'), 'start\n');
  if (gitleaksConfig) copyFileSync(join(ROOT, '.gitleaks.toml'), join(dir, '.gitleaks.toml'));
  g('add', '.');
  g('commit', '-qm', 'base');
  const base = g('rev-parse', 'HEAD').stdout.trim();
  g('checkout', '-qb', 'x');
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), file === 'a.txt' ? `start\n${content}\n` : content);
  g('add', '.');
  g('commit', '-qm', 'change');
  const head = g('rev-parse', 'HEAD').stdout.trim();
  return { dir, g, input: `refs/heads/x ${head} refs/heads/x ${base}\n` };
}
const run = (
  { dir, input }: { dir: string; input: string },
  env: Record<string, string> = { SKIP_SECRET_SCAN: '1' },
) =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

describe('end to end in a throwaway repo', () => {
  it('passes a clean push', () => {
    const r = repo('hello world');
    const out = run(r);
    rmSync(r.dir, { recursive: true, force: true });
    expect(out.status, out.stderr).toBe(0);
  });
  it('fails a push that adds an email, without printing it', () => {
    const r = repo('mail jane.doe@acme-roofing.com'); // pii-allow
    const out = run(r);
    rmSync(r.dir, { recursive: true, force: true });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/email .*a\.txt/);
    expect(out.stdout + out.stderr).not.toContain('jane.doe');
  });
});

describe('job-hunt fixtures through gitleaks + .gitleaks.toml', () => {
  // The hook fails closed without gitleaks, so anyone who can push has it.
  // CI must not skip: there a missing binary fails this suite.
  const needsGitleaks = HAS_GITLEAKS || process.env.CI ? it : it.skip;
  const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

  it('the violating fixture holds an obviously fake token, not a real one', () => {
    expect(fixture('violating.example.txt')).toMatch(/ghp_FAKEfake/);
  });
  it('.gitleaks.toml allowlists the fixture dir (and only it)', () => {
    const toml = readFileSync(join(ROOT, '.gitleaks.toml'), 'utf8');
    expect(toml).toMatch(/useDefault = true/);
    expect(toml).toContain("'''^scripts\\/fixtures\\/secret-pii-scan\\/'''");
    const paths = toml.match(/^\s*'''.*'''/gm) ?? [];
    expect(paths.map((p) => p.trim())).toEqual(["'''^scripts\\/fixtures\\/secret-pii-scan\\/'''"]);
  });
  needsGitleaks('blocks a push that adds the fake-secret fixture, redacted', () => {
    const r = repo(fixture('violating.example.txt'), { file: 'leak.txt', gitleaksConfig: true });
    const out = run(r, { SKIP_SECRET_SCAN: '' });
    rmSync(r.dir, { recursive: true, force: true });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/FAIL secrets in [0-9a-f]{40}\.\.[0-9a-f]{40}/);
    expect(out.stdout + out.stderr).not.toContain('ghp_FAKEfake');
  });
  needsGitleaks('passes a push that adds the clean fixture', () => {
    const r = repo(fixture('passing.example.txt'), { file: 'ok.txt', gitleaksConfig: true });
    const out = run(r, { SKIP_SECRET_SCAN: '' });
    rmSync(r.dir, { recursive: true, force: true });
    expect(out.stderr).not.toContain('FAIL');
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('1 range(s) clean');
  });
  needsGitleaks('the allowlist keeps the fixture itself pushable from its own path', () => {
    const r = repo(fixture('violating.example.txt'), {
      file: 'scripts/fixtures/secret-pii-scan/violating.example.txt',
      gitleaksConfig: true,
    });
    const out = run(r, { SKIP_SECRET_SCAN: '' });
    rmSync(r.dir, { recursive: true, force: true });
    expect(out.stderr).not.toContain('FAIL');
    expect(out.status).toBe(0);
  });
  it('fails closed with the install command when gitleaks is missing', () => {
    const r = repo(fixture('passing.example.txt'), { file: 'ok.txt' });
    const bin = mkdtempSync(join(tmpdir(), 'spscan-bin-'));
    symlinkSync(process.execPath, join(bin, 'node'));
    const git = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    symlinkSync(git, join(bin, 'git'));
    const out = spawnSync(join(bin, 'node'), [SCRIPT], {
      cwd: r.dir,
      input: r.input,
      encoding: 'utf8',
      env: { ...process.env, PATH: bin, SKIP_SECRET_SCAN: '' },
    });
    rmSync(r.dir, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/gitleaks is not installed.*brew install gitleaks/);
  });
});

describe('.husky/pre-push wiring', () => {
  const hook = () => readFileSync(HOOK, 'utf8');

  it('runs the scan as the first stage, with nothing that can swallow its exit', () => {
    const cmds = hook()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('echo') && l !== 'set -e');
    expect(cmds[0]).toBe('node scripts/hooks/secret-pii-scan.mjs');
    expect(hook()).toMatch(/^set -e$/m);
    expect(hook()).not.toMatch(/secret-pii-scan\.mjs[^\n]*(\|\||&|\|)/);
  });

  it('install activates the hooks (prepare → husky)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.prepare).toBe('husky');
  });

  /**
   * Real `git push` through husky into a bare remote: proves husky hands git's
   * pre-push stdin straight to the scan (a hook that lost stdin would pass).
   */
  function huskyPush(
    content: string,
    { file = 'a.txt', gitleaksConfig = false, skipSecrets = true } = {},
  ) {
    const r = repo(content, { file, gitleaksConfig });
    const remote = mkdtempSync(join(tmpdir(), 'spscan-remote-'));
    spawnSync('git', ['init', '-q', '--bare', remote]);
    r.g('remote', 'add', 'origin', remote);
    r.g('push', '-q', 'origin', 'main'); // before husky is installed: no hook yet
    r.g('fetch', '-q', 'origin');
    mkdirSync(join(r.dir, '.husky'));
    mkdirSync(join(r.dir, 'scripts', 'hooks'), { recursive: true });
    copyFileSync(HOOK, join(r.dir, '.husky', 'pre-push'));
    copyFileSync(SCRIPT, join(r.dir, 'scripts', 'hooks', 'secret-pii-scan.mjs'));
    // Install husky the way `npm install` (prepare → husky) does.
    const inst = spawnSync(process.execPath, [HUSKY_BIN], { cwd: r.dir, encoding: 'utf8' });
    const out = spawnSync('git', ['push', 'origin', 'x'], {
      cwd: r.dir,
      encoding: 'utf8',
      env: { ...process.env, SKIP_SECRET_SCAN: skipSecrets ? '1' : '' },
    });
    const pushed =
      spawnSync('git', ['rev-parse', '-q', '--verify', 'refs/heads/x'], {
        cwd: remote,
        encoding: 'utf8',
      }).status === 0;
    const hooksPath = r.g('config', 'core.hooksPath').stdout.trim();
    rmSync(r.dir, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
    return { inst, out, pushed, hooksPath };
  }

  const needsHusky = existsSync(HUSKY_BIN) ? it : it.skip;
  needsHusky('a real push that adds PII is blocked by the husky hook', () => {
    const { inst, out, pushed, hooksPath } = huskyPush('mail jane.doe@acme-roofing.com'); // pii-allow
    expect(inst.status, inst.stderr).toBe(0);
    expect(hooksPath).toBe('.husky/_');
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/FAIL email in a\.txt/);
    expect(out.stdout + out.stderr).not.toContain('jane.doe');
    expect(pushed).toBe(false);
  });
  const needsBoth = existsSync(HUSKY_BIN) && (HAS_GITLEAKS || process.env.CI) ? it : it.skip;
  needsBoth('a real push that adds the fake-token fixture is blocked by gitleaks', () => {
    const violating = readFileSync(join(FIXTURES, 'violating.example.txt'), 'utf8');
    const { out, pushed } = huskyPush(violating, {
      file: 'leak.txt',
      gitleaksConfig: true,
      skipSecrets: false,
    });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/FAIL secrets in/);
    expect(out.stdout + out.stderr).not.toContain('ghp_FAKEfake');
    expect(pushed).toBe(false);
  });
  needsHusky('a real clean push goes through and the scan saw one range', () => {
    const { out, pushed } = huskyPush('hello world');
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout + out.stderr).toContain('secret-pii-scan: 1 range(s) clean');
    expect(pushed).toBe(true);
  });
});

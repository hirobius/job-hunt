#!/usr/bin/env node
/**
 * scripts/hooks/secret-pii-scan.mjs — portable pre-push secret + PII scan (ops#943).
 *
 * One file, Node built-ins only, so fleet repos (site-engine, job-hunt, lilac, …)
 * can vendor it as-is. Wire it as the first line of a pre-push hook:
 *   husky:            .husky/pre-push      →  node scripts/hooks/secret-pii-scan.mjs
 *   simple-git-hooks: "pre-push": "node scripts/hooks/secret-pii-scan.mjs"
 * It reads git's pre-push stdin and, per pushed ref, scans only what the push
 * adds: remote..local, or merge-base(local, base)..local for a new branch or
 * after the base was merged in (base = SCAN_BASE_REF, else origin/HEAD,
 * origin/main, origin/master, main, master). Deletions are skipped.
 *
 *   secrets  gitleaks over the range (--redact; .gitleaks.toml when present).
 *            gitleaks missing FAILS with the install command. One push without
 *            it: SKIP_SECRET_SCAN=1 (printed; PII still runs).
 *   PII      added lines + commit messages: emails (not example.*, noreply,
 *            localhost), US phones (not 555-01xx), SSN-shaped numbers. A line
 *            containing `pii-allow` is exempt. Output names rule, file and match
 *            length, never the value.
 *
 * Canonical copy lives in hirobius/ops; vendored copies should not diverge.
 * Exit: 0 clean · 1 a finding, a missing gitleaks, or a bad stdin line.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ZERO = /^0{40}$/;
const INSTALL =
  'Install gitleaks 8.30.1: `brew install gitleaks` (macOS) · `winget install gitleaks` (Windows) · ' +
  'https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1';

/** The oldest gitleaks that reads `.gitleaks.toml` right: `[[allowlists]]` with `targetRules` needs
 * 8.25. An older one ignores those allowlists and blocks clean pushes (#806). CI pins 8.30.1. */
export const MIN_GITLEAKS = [8, 25, 0];

/** `gitleaks version` prints `8.30.1` (or `v8.30.1`); anything else reads as unknown (null). */
export function parseGitleaksVersion(out) {
  const m = /v?(\d+)\.(\d+)\.(\d+)/.exec(String(out ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function versionAtLeast(v, min) {
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i] > min[i];
  return true;
}

/** 'ok', 'missing', or 'old' (installed, but older than MIN_GITLEAKS or of unknown version). */
export function gitleaksStatus() {
  const r = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return 'missing';
  const v = parseGitleaksVersion(r.stdout);
  return v && versionAtLeast(v, MIN_GITLEAKS) ? 'ok' : 'old';
}

export function parsePushLines(stdin) {
  return stdin
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/);
      if (!SHA.test(localSha ?? '') || !SHA.test(remoteSha ?? '')) {
        throw new Error(`pre-push line "${l}" does not carry two 40-character SHAs.`);
      }
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

/** @returns {string[]} git ranges to scan */
export function resolveRanges(lines, { commitExists, mergeBase, isAncestor }) {
  const out = [];
  for (const { localSha, remoteSha } of lines) {
    if (ZERO.test(localSha)) continue;
    const base = mergeBase(localSha);
    const remote = !ZERO.test(remoteSha) && commitExists(remoteSha) ? remoteSha : null;
    const from = remote && (!base || isAncestor(base, remote)) ? remote : base;
    if (from && from !== localSha) out.push(`${from}..${localSha}`);
    else if (!from) out.push(`${localSha}~1..${localSha}`);
  }
  return out;
}

const RULES = [
  {
    rule: 'email',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    skip: (m) =>
      /@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|localhost)$/i.test(m) ||
      /noreply|no-reply/i.test(m),
  },
  {
    rule: 'phone',
    re: /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g,
    skip: (m) => /555[ .-]01\d\d$/.test(m),
  },
  { rule: 'ssn', re: /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g, skip: () => false },
];

/** Scan a unified diff (added lines) or plain text. Never returns the value. */
export function findPii(text, { plain = false, label = 'commit message' } = {}) {
  const findings = [];
  let file = label;
  for (let line of text.split('\n')) {
    if (!plain) {
      if (line.startsWith('+++ ')) {
        file = line.replace(/^\+\+\+ (?:b\/)?/, '');
        continue;
      }
      if (!line.startsWith('+')) continue;
      line = line.slice(1);
    }
    if (line.includes('pii-allow')) continue;
    for (const { rule, re, skip } of RULES) {
      for (const m of line.matchAll(re)) {
        if (!skip(m[0])) findings.push({ rule, file, length: m[0].length });
      }
    }
  }
  return findings;
}

function main() {
  const git = (...a) => spawnSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const ok = (...a) => git(...a).status === 0;
  const baseRef = [
    process.env.SCAN_BASE_REF,
    'origin/HEAD',
    'origin/main',
    'origin/master',
    'main',
    'master',
  ]
    .filter(Boolean)
    .find((r) => ok('rev-parse', '--verify', '-q', `${r}^{commit}`));
  let ranges;
  try {
    ranges = resolveRanges(parsePushLines(readFileSync(0, 'utf8')), {
      commitExists: (s) => ok('cat-file', '-e', `${s}^{commit}`),
      mergeBase: (s) => {
        if (!baseRef) return null;
        const r = git('merge-base', s, baseRef);
        return r.status === 0 ? r.stdout.trim() : null;
      },
      isAncestor: (a, b) => ok('merge-base', '--is-ancestor', a, b),
    });
  } catch (e) {
    console.error(`secret-pii-scan: ${e.message}`);
    return 1;
  }
  let failed = false;
  let leaks;
  for (const range of ranges) {
    if (process.env.SKIP_SECRET_SCAN === '1') {
      console.log('secret-pii-scan: ⚠ SKIP_SECRET_SCAN=1, secrets NOT scanned for this push.');
    } else if ((leaks ??= gitleaksStatus()) !== 'ok') {
      const why =
        leaks === 'missing'
          ? 'gitleaks is not installed, so secrets cannot be scanned.'
          : `gitleaks is older than ${MIN_GITLEAKS.join('.')}, so it misreads .gitleaks.toml.`;
      console.error(`secret-pii-scan: ${why} ${INSTALL}`);
      console.error('  One push without it: SKIP_SECRET_SCAN=1 git push');
      failed = true;
    } else {
      const args = [
        'git',
        '--redact',
        '--no-banner',
        '--exit-code',
        '1',
        `--log-opts=${range}`,
        '.',
      ];
      if (existsSync('.gitleaks.toml')) args.splice(1, 0, '--config', '.gitleaks.toml');
      if (spawnSync('gitleaks', args, { stdio: 'inherit' }).status !== 0) {
        console.error(`secret-pii-scan: FAIL secrets in ${range}`);
        failed = true;
      }
    }
    const diff = git('log', '-p', '--no-color', '--format=', range).stdout ?? '';
    const msgs = git('log', '--format=%B', range).stdout ?? '';
    const pii = [...findPii(diff), ...findPii(msgs, { plain: true })];
    for (const f of pii)
      console.error(`secret-pii-scan: FAIL ${f.rule} in ${f.file} (${f.length} chars)`);
    if (pii.length) failed = true;
  }
  if (failed) {
    console.error(
      'secret-pii-scan: push blocked. Secrets: rotate at the provider, then rewrite the branch. ' +
        'PII: remove it, or mark a reviewed false positive with `pii-allow` on the line.',
    );
    return 1;
  }
  console.log(`secret-pii-scan: ${ranges.length} range(s) clean`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

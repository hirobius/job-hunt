#!/usr/bin/env node
/**
 * scripts/check-exact-pins.mjs
 *
 * Dependency-policy gate, ported from hirobius/ops scripts/check-exact-pins.mjs (ops#939) by way of
 * folio#184 (the npm variant); rollout issue hirobius/ops#1081. job-hunt installs with npm, so the
 * pnpm-only parts (pnpm-workspace.yaml release age / trust policy, pnpm-lock.yaml) are replaced by
 * their npm equivalents. Fails when:
 *  - package.json dependencies/devDependencies/optionalDependencies use a range
 *    (^, ~, >, <, *, x, a tag) instead of an exact version (a registry tarball URL counts as exact);
 *  - package-lock.json resolves any package from git, a local path, or a tarball host other than
 *    registry.npmjs.org / npm.pkg.github.com;
 *  - .npmrc lacks `save-exact=true`.
 *
 * Usage: node scripts/check-exact-pins.mjs [--root <dir>]   (npm run check:exact-pins)
 * Fixture mode (proof of firing): FIXTURE_FILE=<json> with
 * `{ "packageJson": {...}, "lockfile": {...}, "npmrc": "..." }` replaces the files
 * (fixtures in scripts/fixtures/check-exact-pins/, tests in src/exactPins.test.ts).
 * Exit codes: 0 pass · 1 violation.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const TRUSTED_TARBALL_HOSTS = new Set(['registry.npmjs.org', 'npm.pkg.github.com']);

function isTrustedTarball(spec) {
  try {
    const u = new URL(spec);
    return u.protocol === 'https:' && TRUSTED_TARBALL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Direct deps whose spec is not an exact version or a trusted registry tarball. */
export function findRangeSpecs(pkg) {
  const out = [];
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (EXACT.test(spec) || isTrustedTarball(spec)) continue;
      out.push({ field, name, spec });
    }
  }
  return out;
}

/** package-lock.json entries resolved from git, a path, or an untrusted tarball host. */
export function findExoticResolutions(lock) {
  const out = [];
  for (const [pkg, entry] of Object.entries(lock?.packages ?? {})) {
    if (!pkg || entry.link) continue; // root and workspace links
    const r = entry.resolved;
    if (r && !isTrustedTarball(r)) out.push({ pkg, why: r });
  }
  return out;
}

/** Missing settings in .npmrc text. */
export function findNpmrcGaps(npmrcText) {
  return /^save-exact\s*=\s*true\s*$/m.test(npmrcText) ? [] : ['save-exact=true'];
}

function main() {
  const i = process.argv.indexOf('--root');
  const root = resolve(i > -1 ? process.argv[i + 1] : process.cwd());
  const read = (f) => (existsSync(resolve(root, f)) ? readFileSync(resolve(root, f), 'utf8') : '');
  const fx = process.env.FIXTURE_FILE
    ? JSON.parse(readFileSync(process.env.FIXTURE_FILE, 'utf8'))
    : null;
  const pkg = fx ? fx.packageJson : JSON.parse(read('package.json') || '{}');
  const lock = fx ? fx.lockfile : JSON.parse(read('package-lock.json') || '{}');
  const npmrc = fx ? (fx.npmrc ?? 'save-exact=true') : read('.npmrc');
  const errors = [];
  for (const v of findRangeSpecs(pkg))
    errors.push(
      `package.json ${v.field}.${v.name} = "${v.spec}" is a range; pin the exact version (save-exact=true is set).`,
    );
  for (const v of findExoticResolutions(lock))
    errors.push(
      `package-lock.json ${v.pkg} resolves from an exotic source (${v.why}); use a registry version.`,
    );
  for (const g of findNpmrcGaps(npmrc)) errors.push(`.npmrc is missing \`${g}\`.`);
  if (errors.length) {
    console.error(`check-exact-pins: ${errors.length} violation(s) (ops#939 / ops#1081)`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('check-exact-pins: OK — exact pins, registry-only lockfile, save-exact set.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

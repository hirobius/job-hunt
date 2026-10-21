// HDS freshness record (redesign-mobile guardrail). Reads the latest published
// @hirobius/design-system from the registry (the one network read), writes it to
// hds-version.json, and exits 1 when the installed HDS trails it by more than one minor.
// src/hdsFreshness.test.ts holds the build to the same rule offline. See docs/guardrails.md.
//
//   npm run hds:check
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PKG = '@hirobius/design-system';
const RECORD = 'hds-version.json';

// `npm view` follows .npmrc, which maps @hirobius to GitHub Packages (needs HDS_PACKAGES_TOKEN).
const latest = execFileSync('npm', ['view', PKG, 'dist-tags.latest'], { encoding: 'utf8' }).trim();
if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error(`unexpected latest version: ${latest}`);
const installed = JSON.parse(readFileSync(`node_modules/${PKG}/package.json`, 'utf8')).version;

let previous;
try {
  previous = JSON.parse(readFileSync(RECORD, 'utf8'));
} catch {
  /* first run */
}
// Keep the file unchanged when nothing moved, so a re-run leaves no diff.
if (previous?.latest !== latest) {
  const record = { package: PKG, latest, checkedAt: new Date().toISOString().slice(0, 10) };
  writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
}

const [iMaj, iMin] = installed.split('.').map(Number);
const [lMaj, lMin] = latest.split('.').map(Number);
const behind = lMaj !== iMaj ? (lMaj > iMaj ? Infinity : 0) : lMin - iMin;
console.log(
  `HDS installed ${installed}, latest ${latest} (${RECORD}${previous?.latest !== latest ? ' updated' : ''})`,
);
if (behind > 1) {
  console.error(`HDS is ${behind} minors behind: npx ${PKG}@latest upgrade`);
  process.exit(1);
}

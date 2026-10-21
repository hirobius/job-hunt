// HDS freshness record (redesign-mobile guardrail). Reads the latest published
// @hirobius/design-system from the registry (the one network read), writes it to
// hds-version.json, and exits 1 when the installed HDS trails it by more than one minor.
// src/hdsFreshness.test.ts holds the build to the same rule offline. See docs/guardrails.md.
//
//   npm run hds:check
import { readFileSync, writeFileSync } from 'node:fs';

const PKG = '@hirobius/design-system';
const RECORD = 'hds-version.json';

// HDS publishes to public npm. Read it there directly: `npm view` follows .npmrc, which maps
// @hirobius to GitHub Packages (it stops at 0.26.2), and caches answers. The query string busts
// any proxy or registry cache, so a fresh publish is seen at once.
const res = await fetch(`https://registry.npmjs.org/${PKG.replace('/', '%2F')}?t=${Date.now()}`, {
  headers: { accept: 'application/json', 'cache-control': 'no-cache' },
});
if (!res.ok) throw new Error(`registry answered ${res.status}`);
const latest = String((await res.json())['dist-tags']?.latest ?? '').trim();
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

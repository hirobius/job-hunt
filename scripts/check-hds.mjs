// HDS conformance (Adrian 2026-11-10): stops drift away from @hirobius/design-system without
// blocking the redesign (job-hunt#564). Four rules over src/**/*.{ts,tsx,css} (tests excluded):
//   colour   no raw hex / rgb() / hsl() colour literals: HDS tokens and CSS variables only.
//   px       no raw px for spacing, radius or font size (0 and 1px hairlines are fine).
//   dup      no local component that re-implements one HDS exports (component-api.json).
//   gap      every stand-in in src/hds-gaps/ carries `// hds-gap: hirobius/hds#NNNN`; with
//            --online (CI) that issue must still be open on GitHub.
//   version  installed HDS == package.json pin == hds-version.json, and .npmrc must not map
//            @hirobius to a registry that trails public npm (GitHub Packages stops at 0.26.2).
// Known violations live in hds-baseline.json; each entry names the redesign issue
// (job-hunt#534-#564) that removes it. The check fails on any violation not in the baseline,
// and on a baseline entry that is now fixed (so the baseline only shrinks).
//
//   npm run check:hds                 offline (format checks only)
//   npm run check:hds -- --online     CI: also asks the GitHub REST API if each hds-gap is open
//   npm run check:hds -- --write-baseline   re-record (new entries get issue "TODO")
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PKG = '@hirobius/design-system';
const BASELINE = 'hds-baseline.json';
// Registries known to trail public npm for @hirobius (GitHub Packages stops at 0.26.2).
const BEHIND_REGISTRIES = ['npm.pkg.github.com'];
// Files allowed raw colours / px, as { rule: { file: why } }. Out of scope by design: SVG asset
// files (src/brand/flame.svg, src/account/google-g.svg; .svg is not scanned), tests, src/test/.
// Single lines carry `/* hds-allow: <why> */` (or `// hds-allow: <why>`) instead.
// The flame engine (src/brand/flameEngine.ts) takes its three fills as arguments, read from HDS
// primitives by src/hdsColor.ts (Node-only, icons and share image), so it needs no exception today.
export const EXCEPTIONS = {
  colour: {},
  px: {},
};
export const GAP_ISSUES = [
  ...range(1425, 1430), // known gaps
  ...range(1432, 1442), // redesign gaps G1-G11
];
function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// ---------- source text helpers ----------

/** Blank out comments (keep newlines) so issue refs like `#133` never read as colours. */
export function stripComments(src, css = false) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (!css && c === '/' && n === '/' && src[i - 1] !== ':') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    // A regex literal (a `/` where an expression starts): blank it too, so its quotes don't count.
    if (
      !css &&
      c === '/' &&
      /[(,=:[!&|?{};]\s*$|return\s*$|^\s*$/.test(out.slice(-40).split('\n').pop())
    ) {
      const m = /^\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/.exec(src.slice(i));
      if (m) {
        out += ' '.repeat(m[0].length);
        i += m[0].length;
        continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

/** String literal bodies in TS/TSX (after comments are stripped), with their line numbers. */
export function stringLiterals(code) {
  const out = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs;
  let m;
  while ((m = re.exec(code))) {
    out.push({ text: m[2], line: code.slice(0, m.index).split('\n').length });
  }
  return out;
}

const COLOUR_RE =
  /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g;
const PX_PROPS =
  /^(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|font|font-size|line-height|letter-spacing|border(?:-[a-z]+)*-radius|border-radius|scroll-padding|scroll-margin)(?:-[a-z]+)*$/;
const TW_PX =
  /(?:^|[\s:])(-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|rounded(?:-[a-z]{1,2})?|text|leading|tracking|inset(?:-[xy])?|top|left|right|bottom)-\[(-?[\d.]+px)\])/g;
const STYLE_PX =
  /\b(padding\w*|margin\w*|gap|rowGap|columnGap|borderRadius|border\w*Radius|fontSize|lineHeight|letterSpacing)\s*:\s*(['"`]?)([^,}\n]*?\b\d[\d.]*px\b[^,}\n]*?)\2\s*[,}\n]/g;

function badPx(value) {
  // A fallback inside an HDS token (`var(--primitive-radius-full, 999px)`) is the token, not a literal.
  value = value.replace(
    /var\(\s*--(?:primitive|semantic|role|component)-[\w-]+\s*,[^()]*\)/g,
    'var()',
  );
  return (value.match(/-?\b\d*\.?\d+px\b/g) ?? []).filter((v) => !/^-?(0|1)(\.0+)?px$/.test(v));
}

/** Colour and px violations in one file. Returns [{rule, line, match}]. */
export function scanFile(rel, src) {
  const css = rel.endsWith('.css');
  const code = stripComments(src, css);
  const found = [];
  const push = (rule, line, match) => found.push({ rule, line, match: match.trim() });
  if (css) {
    code.split('\n').forEach((text, idx) => {
      for (const m of text.matchAll(COLOUR_RE)) push('colour', idx + 1, m[0]);
      for (const decl of text.matchAll(/(?:^|[;{\s])(-?-?[a-z][a-z-]*)\s*:\s*([^;{}]+)/g)) {
        const prop = decl[1];
        if (
          prop.startsWith('--')
            ? !/(space|gap|pad|radius|font|size|text|inset)/.test(prop)
            : !PX_PROPS.test(prop)
        )
          continue;
        for (const v of badPx(decl[2])) push('px', idx + 1, `${prop}: ${v}`);
      }
    });
  } else {
    for (const s of stringLiterals(code)) {
      const lines = s.text.split('\n');
      lines.forEach((text, k) => {
        for (const m of text.matchAll(COLOUR_RE)) push('colour', s.line + k, m[0]);
        for (const m of text.matchAll(TW_PX)) if (badPx(m[2]).length) push('px', s.line + k, m[1]);
      });
    }
    for (const m of code.matchAll(STYLE_PX)) {
      for (const v of badPx(m[3]))
        push('px', code.slice(0, m.index).split('\n').length, `${m[1]}: ${v}`);
    }
  }
  // A line marked `hds-allow: <why>` in a comment is a reviewed exception (see EXCEPTIONS above).
  const lines = src.split('\n');
  return found.filter(
    (f) => !EXCEPTIONS[f.rule]?.[rel] && !/hds-allow:\s*\S/.test(lines[f.line - 1] ?? ''),
  );
}

// ---------- rule 2: duplicates of HDS components ----------

export function hdsComponents(root) {
  const p = join(root, 'node_modules', PKG, 'src/app/data/component-api.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const c = j.components ?? j;
  return Array.isArray(c) ? c.map((x) => x.name) : Object.keys(c);
}

// Leaf parts a role suffix can copy (StatusBadge, ApplyPager). Containers such as Page, Card,
// List or Field are left out: JobPage is a route and TitlesField composes HDS Input.
const SUFFIX_PARTS = new Set([
  'Alert',
  'Avatar',
  'Badge',
  'Breadcrumb',
  'Button',
  'Callout',
  'Combobox',
  'Dialog',
  'Divider',
  'Kbd',
  'Menu',
  'Pagination',
  'Popover',
  'Progress',
  'SegmentedControl',
  'Sheet',
  'Skeleton',
  'Spinner',
  'Tabs',
  'Tag',
  'Timestamp',
  'Toggle',
  'Tooltip',
]);
const SUFFIX_ALIASES = ['Pager', 'Chip', 'Pill', 'Modal', 'Drawer', 'Loader', 'Dropdown'];
const GENERIC_PREFIX = /^(?:App|Local|My|Rjb|Custom|Simple|Base|Basic|Plain|Hds)(?=[A-Z])/;
// Local names whose role is an HDS component under another name.
export const ROLE_ALIASES = {
  Modal: 'Dialog',
  Drawer: 'Sheet',
  Chip: 'Tag',
  Pill: 'Tag',
  Toast: 'ToastProvider',
  Loader: 'Spinner',
  Pager: 'Pagination',
  Tooltip: 'Tooltip',
  Dropdown: 'Menu',
  Skeletons: 'Skeleton',
  EmptyView: 'EmptyState',
  Panel: 'Card',
  ItemList: 'List',
  ItemRow: 'ListItem',
};

/** Exported PascalCase components declared in a file. */
export function localComponents(src) {
  const code = stripComments(src);
  const names = new Set();
  for (const m of code.matchAll(
    /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g,
  ))
    names.add(m[1]);
  return [...names];
}

/** Names imported from HDS in a file (a local Sheet that wraps HDS Sheet composes, not copies). */
export function hdsImports(src) {
  const out = new Set();
  for (const m of src.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@hirobius\/design-system[^'"]*['"]/g,
  )) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) out.add(name);
    }
  }
  return out;
}

/** The HDS component a local one re-implements, or null: same name, a generic prefix, an alias,
 *  or a role suffix (StatusBadge, ApplyPager) when the file does not build on that HDS part. */
export function duplicateOf(name, hds, imported = new Set()) {
  // A file that imports any HDS part of that family (AlertDialog, ListItem, CardBody) composes it.
  const hit = (n) => (n && ![...imported].some((i) => i.includes(n) || n.includes(i)) ? n : null);
  const exact = rawDuplicate(name, hds);
  if (exact) return name === exact ? exact : hit(exact);
  const suffix = [...hds]
    .filter(
      (h) =>
        SUFFIX_PARTS.has(h) &&
        h.length > 3 &&
        name.endsWith(h) &&
        /[a-z]$/.test(name.slice(0, -h.length)),
    )
    .sort((a, b) => b.length - a.length)[0];
  const aliasSuffix = SUFFIX_ALIASES.find((a) => name.endsWith(a) && name !== a);
  return hit(suffix ?? (aliasSuffix ? ROLE_ALIASES[aliasSuffix] : null));
}

function rawDuplicate(name, hds) {
  const set = new Set(hds);
  const bare = name.replace(GENERIC_PREFIX, '');
  if (set.has(name)) return name;
  if (set.has(bare)) return bare;
  if (bare.endsWith('s') && set.has(bare.slice(0, -1))) return bare.slice(0, -1);
  if (ROLE_ALIASES[bare] && set.has(ROLE_ALIASES[bare])) return ROLE_ALIASES[bare];
  return null;
}

// ---------- rule 3: hds-gap tags ----------

const GAP_TAG = /(?:\/\/|\/\*)\s*hds-gap:\s*hirobius\/hds#(\d+)\b/g;
export function gapTags(src) {
  return [...src.matchAll(GAP_TAG)].map((m) => Number(m[1]));
}

// ---------- rule 4: version guard ----------

export function checkVersion(root) {
  const out = [];
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const pin = JSON.parse(read('package.json')).dependencies?.[PKG];
  let installed = null;
  try {
    installed = JSON.parse(read(`node_modules/${PKG}/package.json`)).version;
  } catch {
    out.push({ rule: 'version', match: 'HDS not installed' });
  }
  let record = null;
  try {
    record = JSON.parse(read('hds-version.json')).latest;
  } catch {
    out.push({ rule: 'version', match: 'hds-version.json missing' });
  }
  if (!/^\d+\.\d+\.\d+$/.test(pin ?? ''))
    out.push({ rule: 'version', match: `package.json pin is not exact: ${pin}` });
  if (installed && pin && installed !== pin)
    out.push({ rule: 'version', match: `installed ${installed} != package.json ${pin}` });
  if (record && pin && record !== pin)
    out.push({ rule: 'version', match: `hds-version.json ${record} != package.json ${pin}` });
  if (existsSync(join(root, '.npmrc'))) {
    const rc = stripComments(read('.npmrc').replace(/^\s*[#;].*$/gm, ''), true);
    for (const m of rc.matchAll(/^\s*@hirobius:registry\s*=\s*(\S+)/gm)) {
      if (BEHIND_REGISTRIES.some((h) => m[1].includes(h)))
        out.push({
          rule: 'version',
          match: `.npmrc maps @hirobius to ${m[1]} (behind public npm)`,
        });
    }
  }
  return out.map((v) => ({ ...v, file: v.file ?? 'package.json', line: 0 }));
}

// ---------- walk + run ----------

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (
      /\.(tsx?|css)$/.test(name) &&
      !/\.(test|spec)\.tsx?$/.test(name) &&
      !name.endsWith('.d.ts')
    )
      acc.push(p);
  }
  return acc;
}

export function collect(root) {
  const hds = hdsComponents(root);
  const all = [];
  for (const abs of walk(join(root, 'src'))) {
    const rel = relative(root, abs).split('\\').join('/');
    if (rel.startsWith('src/test/')) continue; // test helpers
    const src = readFileSync(abs, 'utf8');
    for (const v of scanFile(rel, src)) all.push({ ...v, file: rel });
    const tags = gapTags(src);
    const isGap = rel.startsWith('src/hds-gaps/');
    for (const n of tags) {
      if (!GAP_ISSUES.includes(n))
        all.push({
          rule: 'gap',
          file: rel,
          line: 0,
          match: `hds#${n} is not a known HDS gap issue`,
        });
    }
    if (isGap && !tags.length)
      all.push({ rule: 'gap', file: rel, line: 0, match: 'stand-in has no hds-gap tag' });
    if (rel.endsWith('.tsx')) {
      for (const name of localComponents(src)) {
        const dup = duplicateOf(name, hds, hdsImports(src));
        if (dup && !tags.length)
          all.push({ rule: 'dup', file: rel, line: 0, match: `${name} duplicates HDS ${dup}` });
      }
    }
  }
  all.push(...checkVersion(root));
  return all;
}

export const keyOf = (v) => `${v.rule}|${v.file}|${v.match}`;

/** Compare violations with the baseline. Returns {fresh, fixed}. */
export function compare(violations, baseline) {
  const allowed = new Map();
  for (const e of baseline.entries) allowed.set(keyOf(e), e.count ?? 1);
  const seen = new Map();
  const fresh = [];
  for (const v of violations) {
    const k = keyOf(v);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > (allowed.get(k) ?? 0)) fresh.push(v);
  }
  const fixed = baseline.entries.filter((e) => (seen.get(keyOf(e)) ?? 0) < (e.count ?? 1));
  return { fresh, fixed };
}

export function validateBaseline(baseline) {
  const bad = [];
  for (const e of baseline.entries) {
    const m = /^job-hunt#(\d+)$/.exec(e.issue ?? '');
    if (!m || Number(m[1]) < 534 || Number(m[1]) > 564) bad.push(e);
  }
  return bad;
}

async function openState(numbers) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const closed = [];
  await Promise.all(
    numbers.map(async (n) => {
      const res = await fetch(`https://api.github.com/repos/hirobius/hds/issues/${n}`, {
        headers: {
          accept: 'application/vnd.github+json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status} for hds#${n}`);
      if ((await res.json()).state !== 'open') closed.push(n);
    }),
  );
  return closed;
}

async function main(argv) {
  const t0 = performance.now();
  const arg = (f) => argv.includes(f);
  const ri = argv.indexOf('--root');
  const root = resolve(ri >= 0 ? argv[ri + 1] : process.cwd());
  const violations = collect(root);
  const bpath = join(root, BASELINE);
  const baseline = existsSync(bpath) ? JSON.parse(readFileSync(bpath, 'utf8')) : { entries: [] };

  if (arg('--write-baseline')) {
    const old = new Map(baseline.entries.map((e) => [keyOf(e), e]));
    const counts = new Map();
    for (const v of violations) counts.set(keyOf(v), [v, (counts.get(keyOf(v))?.[1] ?? 0) + 1]);
    const entries = [...counts.values()].map(([v, count]) => ({
      rule: v.rule,
      file: v.file,
      match: v.match,
      count,
      issue: old.get(keyOf(v))?.issue ?? 'TODO',
      ...(old.get(keyOf(v))?.why ? { why: old.get(keyOf(v)).why } : {}),
    }));
    entries.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    writeFileSync(bpath, `${JSON.stringify({ note: baseline.note, entries }, null, 2)}\n`);
    console.log(`check:hds wrote ${entries.length} baseline entries`);
    return 0;
  }

  let fail = false;
  const badEntries = validateBaseline(baseline);
  for (const e of badEntries) {
    console.error(`baseline entry needs a redesign issue (job-hunt#534-#564): ${keyOf(e)}`);
    fail = true;
  }
  const { fresh, fixed } = compare(violations, baseline);
  for (const v of fresh)
    console.error(`NEW ${v.rule}: ${v.file}${v.line ? `:${v.line}` : ''}  ${v.match}`);
  for (const e of fixed) console.error(`FIXED (remove from ${BASELINE}): ${keyOf(e)} [${e.issue}]`);
  if (fresh.length || fixed.length) fail = true;

  if (arg('--online')) {
    const tagged = new Set();
    for (const abs of walk(join(root, 'src')))
      for (const n of gapTags(readFileSync(abs, 'utf8'))) tagged.add(n);
    const closed = await openState([...tagged]);
    for (const n of closed)
      console.error(`hds-gap hirobius/hds#${n} is closed: adopt HDS and delete the stand-in`);
    if (closed.length) fail = true;
  }
  const per = {};
  for (const e of baseline.entries) per[e.rule] = (per[e.rule] ?? 0) + (e.count ?? 1);
  console.log(
    `check:hds ${fail ? 'FAILED' : 'ok'}: ${violations.length} known violations (baseline ${JSON.stringify(per)}), ${fresh.length} new, ${fixed.length} fixed, ${Math.round(performance.now() - t0)} ms`,
  );
  return fail ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}

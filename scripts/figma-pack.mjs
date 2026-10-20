// Packs scripts/figma-extract.mjs output into use_figma scripts (each under the 50k-char cap):
// dedupes text-run styles, drops raw SVG where the HDS library has the icon, and splits big
// screens into jobs that fill a named frame ("#ref-N") left by an earlier job.
//
//   node scripts/figma-pack.mjs --in=<extract dir> --out=<code dir> --page="job-hunt · light"
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return [a.slice(2, i), a.slice(i + 1)];
  }),
);
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'figma-build.js'), 'utf8');
const known = new Set([...source.matchAll(/'?([a-z0-9-]+)'?: '[0-9a-f]{40}'/g)].map((m) => m[1]));
// minify as a function body (the script uses top-level await/return), then unwrap it
const min = transformSync(`async function __b(){${source}}`, {
  minifyWhitespace: true,
  minifySyntax: true,
  format: 'esm',
}).code;
const builder = min.slice(min.indexOf('{') + 1, min.lastIndexOf('}'));
const LOADER = `const AF=Object.getPrototypeOf(async function(){}).constructor;const B=figma.root.getSharedPluginData('f2f','builder');if(!B)throw new Error('Run 000-install.js first');return await new AF('D','S','P','META',B)(D,S,P,META);`;
const LIMIT = 49000 - LOADER.length - 400;
const manifest = JSON.parse(readFileSync(join(args.in, 'manifest.json'), 'utf8'));
mkdirSync(args.out, { recursive: true });
// installs the builder into the file once; every screen script then only carries its data
writeFileSync(
  join(args.out, '000-install.js'),
  `figma.root.setSharedPluginData('f2f','builder',${JSON.stringify(builder)});return {installed:${builder.length}};`,
);

// layout: one row per width, screens left to right in manifest order
const COLS = { 1440: 0, 390: 1 };
const GAP = 200;
const xs = {};
const plan = [];
for (const m of manifest) {
  const row = COLS[m.width] ?? 0;
  xs[row] ??= 0;
  const D = JSON.parse(readFileSync(join(args.in, m.file), 'utf8'));
  const name = `${m.name} · ${m.width}`;
  const S = [],
    idx = new Map();
  let ref = 0;
  const clean = (svg) =>
    svg
      .replace(/\s(style|class|aria-hidden|data-[a-z-]+)="[^"]*"/g, '')
      .replace(/var\(--[^)]*\)/g, '#000000');
  const prep = (n) => {
    if (n.svg) n.svg = clean(n.svg);
    if (n.svgs) n.svgs = n.svgs.map(clean);
    if (n.k === 'text')
      n.r = n.r.map(([s, st]) => {
        const k = JSON.stringify(st);
        if (!idx.has(k)) {
          idx.set(k, S.length);
          S.push(st);
        }
        return [s, idx.get(k)];
      });
    if (n.k === 'icon' && n.ic && known.has(n.ic)) delete n.svg;
    if (n.k === 'button') {
      if ([n.li, n.ti, n.ic].filter(Boolean).every((i) => known.has(i))) delete n.svgs;
      if (!n.ic) delete n.ic;
      if (!n.li) delete n.li;
      if (!n.ti) delete n.ti;
    }
    for (const c of n.c || []) prep(c);
  };
  D.c.forEach(prep);
  const size = (x) => JSON.stringify(x).length;
  // split: each job takes as much of the tree as fits; what doesn't fit goes to a later job that
  // fills the frame by its "#ref-N" name.
  const jobs = [];
  const take = (n, budget) => {
    if (size(n) <= budget) return { node: n, rest: [] };
    if (!n.c || !n.c.length) return null;
    const r = `ref-${++ref}`;
    const shell = { ...n, c: [], n: `${n.n} #${r}` };
    let left = budget - size(shell) - 40;
    if (left < 0) return null;
    const rest = [],
      over = [];
    for (const c of n.c) {
      const got = over.length ? null : take(c, left);
      if (!got) {
        over.push(c);
        continue;
      }
      shell.c.push(got.node);
      left -= size(got.node) + 1;
      rest.push(...got.rest);
    }
    if (!over.length) shell.n = n.n;
    else rest.push([over, r]);
    return { node: shell, rest };
  };
  // jobs: [[parentRef, nodes], ...] parts packed together while they fit
  const queue = [[D.c, null]];
  let job = [],
    left = LIMIT - size(S) - 200;
  const close = () => {
    if (job.length) jobs.push(job);
    job = [];
    left = LIMIT - size(S) - 200;
  };
  while (queue.length) {
    const [nodes, parentRef] = queue.shift();
    let part = [],
      over = [];
    for (const c of nodes) {
      const got = over.length ? null : take(c, left - 30);
      if (!got) {
        over.push(c);
        continue;
      }
      part.push(got.node);
      left -= size(got.node) + 1;
      queue.push(...got.rest);
    }
    if (part.length) job.push([parentRef, part]);
    if (over.length) {
      if (!part.length && !job.length) throw new Error(`cannot fit a node in ${name}`);
      close();
      queue.unshift([over, parentRef]);
    }
  }
  close();
  const y = row * 3600;
  jobs.forEach((j, i) => {
    const more = [
      ...new Set(
        jobs
          .slice(i + 1)
          .flatMap((jj) => jj.map((pp) => pp[0]))
          .filter(Boolean),
      ),
    ];
    const META = { page: args.page, name, x: xs[row], y, first: i === 0, more };
    const code = `const D=${JSON.stringify({ w: D.w, h: D.h, bg: D.bg })};const P=${JSON.stringify(j)};const S=${JSON.stringify(S)};const META=${JSON.stringify(META)};\n${LOADER}`;
    const file = `${String(plan.length + 1).padStart(3, '0')}-${m.width}-${m.file.replace(/^\d+-|\.json$/g, '')}-${i}.js`;
    writeFileSync(join(args.out, file), code);
    plan.push({ file, screen: name, part: i, of: jobs.length, chars: code.length });
  });
  xs[row] += m.width + GAP;
}
writeFileSync(join(args.out, 'plan.json'), JSON.stringify(plan, null, 1));
console.log(plan.map((p) => `${p.file} ${p.chars}`).join('\n'));

// Bundle size budget (the `size-budget` plugin in vite.config.ts): `vite build` fails when the
// JS a phone downloads before first paint, or any one chunk, grows past its limit. Sizes are
// gzip (what the wire carries; Vercel serves brotli, a little smaller). Raise a limit only on
// purpose, in the same PR that needs it, and say why. Pure, so the test can check it without a
// build.
import { gzipSync } from 'node:zlib';

export const BUDGET = {
  /** The entry chunk and every chunk it imports statically (index.html modulepreloads them). */
  initialJsGzip: 285_000,
  /** All CSS index.html links (render-blocking). */
  initialCssGzip: 27_000,
  /** Any single lazy chunk. supabase-js is the largest (~56 kB) and loads only to sign in. */
  lazyChunkGzip: 70_000,
};

export interface BuiltFile {
  fileName: string;
  /** Chunk code or asset source. */
  code: string | Uint8Array;
  isEntry?: boolean;
  /** Static imports, for chunks. */
  imports?: string[];
}

export const gzipSize = (code: string | Uint8Array) => gzipSync(code, { level: 9 }).length;

/** Sizes of what the budget covers, and every limit they break (empty when within budget). */
export function checkBudget(files: BuiltFile[], budget = BUDGET) {
  const byName = new Map(files.map((f) => [f.fileName, f]));
  const initial = new Set<string>();
  const visit = (n: string) => {
    if (initial.has(n)) return;
    initial.add(n);
    for (const i of byName.get(n)?.imports ?? []) visit(i);
  };
  for (const f of files) if (f.isEntry) visit(f.fileName);
  const js = files.filter((f) => f.fileName.endsWith('.js'));
  const size = new Map(js.map((f) => [f.fileName, gzipSize(f.code)]));
  const initialJs = [...initial].reduce((s, n) => s + (size.get(n) ?? 0), 0);
  // Vite emits the entry's CSS (incl. CSS of chunks it imports statically) as linked files; lazy
  // chunks' CSS is named after them. Count CSS whose name is not a lazy view's.
  const lazyNames = new Set(
    js.filter((f) => !initial.has(f.fileName)).map((f) => baseName(f.fileName)),
  );
  const initialCss = files
    .filter((f) => f.fileName.endsWith('.css') && !lazyNames.has(baseName(f.fileName)))
    .reduce((s, f) => s + gzipSize(f.code), 0);
  const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;
  const over: string[] = [];
  if (initialJs > budget.initialJsGzip)
    over.push(`initial JS ${kb(initialJs)} gzip > ${kb(budget.initialJsGzip)}`);
  if (initialCss > budget.initialCssGzip)
    over.push(`initial CSS ${kb(initialCss)} gzip > ${kb(budget.initialCssGzip)}`);
  for (const [n, s] of size)
    if (!initial.has(n) && s > budget.lazyChunkGzip)
      over.push(`${n} ${kb(s)} gzip > ${kb(budget.lazyChunkGzip)}`);
  return { initialJs, initialCss, over };
}

/** `assets/JobPage-C2aFgckg.css` → `JobPage`. */
const baseName = (f: string) =>
  f
    .split('/')
    .pop()!
    .replace(/-[\w-]{8}\.\w+$/, '');

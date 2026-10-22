// Node-only: an HDS primitive colour token's literal value, read from the shipped variables.css
// (light :root block). For files that can't read CSS variables: the app icons and the share image
// (scripts/make-icons.mjs) and the test that pins them. Never import this from app code.
import { readFileSync } from 'node:fs';

let root: string | undefined;

/** `cobalt-500` → `#2a5bf8`. Throws on an unknown token, so a renamed primitive fails loudly. */
export function hdsColor(token: string): string {
  root ??= readFileSync('node_modules/@hirobius/design-system/dist/variables.css', 'utf8').split(
    /\n\[data-theme/,
  )[0];
  const m = new RegExp(`--primitive-color-${token}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(root);
  if (!m) throw new Error(`No HDS primitive colour --primitive-color-${token}`);
  return m[1].toLowerCase();
}

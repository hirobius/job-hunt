// HDS motion tokens only (the action-feedback rule, docs/agent/shell.md), and motion that stops
// for reduced motion and for the Account menu's Pause animations. No test read either before the
// motion pass (2026-11-18), which found a raw `0.15s cubic-bezier(…)` on the Apply list's rows and
// app motion that ran while paused.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname);

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p, ext);
    return ext.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}
const rel = (f: string) =>
  f
    .slice(SRC.length + 1)
    .split('\\')
    .join('/');
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');

/** A length of time or a curve written out, in a CSS value. */
const RAW = /(?<![\w-])\d*\.?\d+m?s\b|cubic-bezier\(|\bease(?:-in|-out|-in-out)?\b|\blinear\(/;
/** The settle-at-once length of the reduced-motion and Pause rules. */
const SETTLE = /^0\.01ms( !important)?$/;

/** Brand motion with its own lengths and curves (docs/agent/brand.md): the sign-in screen's brand
 *  move. Everything else in CSS is on HDS motion tokens. Only shorten this list. */
const CSS_ALLOWED = ['account/SignInDialog.css'];

/** `transition` and `animation` declarations of a stylesheet: [property, value]. */
function motionDeclarations(css: string): [string, string][] {
  const out: [string, string][] = [];
  const re =
    /(?<![\w-])((?:transition|animation)(?:-duration|-timing-function|-delay)?)\s*:\s*([^;}]+)/g;
  for (const m of strip(css).matchAll(re)) out.push([m[1], m[2].trim().replace(/\s+/g, ' ')]);
  return out;
}

describe('HDS motion tokens only, in CSS (motion pass 2026-11-18)', () => {
  it('no stylesheet writes out a length of time or a curve', () => {
    const bad: string[] = [];
    for (const f of files(SRC, /\.css$/)) {
      if (CSS_ALLOWED.includes(rel(f))) continue;
      for (const [prop, value] of motionDeclarations(readFileSync(f, 'utf8'))) {
        // `linear` beside a token length is a curve keyword HDS has no token for (a fade).
        const rest = value
          .replace(/var\(--hds-motion-[a-zA-Z-]+\)/g, '')
          .replace(/\blinear\b(?!\()/g, '');
        if (SETTLE.test(value) || !RAW.test(rest)) continue;
        bad.push(`${rel(f)}: ${prop}: ${value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('bites: the pattern catches raw values and passes tokens', () => {
    const raw = (v: string) => RAW.test(v.replace(/var\(--hds-motion-[a-zA-Z-]+\)/g, ''));
    expect(raw('background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1)')).toBe(true);
    expect(raw('transform 300ms ease-out')).toBe(true);
    expect(raw('opacity .2s')).toBe(true);
    expect(
      raw(
        'background-color var(--hds-motion-productive-duration) var(--hds-motion-productive-easing)',
      ),
    ).toBe(false);
    expect(raw('rjb-flash calc(var(--hds-motion-spatial-duration) * 3) forwards')).toBe(false);
    expect(raw('none')).toBe(false);
  });

  it('the allowed file still needs its place on the list', () => {
    for (const f of CSS_ALLOWED) {
      const raws = motionDeclarations(readFileSync(join(SRC, f), 'utf8')).filter(([, v]) =>
        RAW.test(v.replace(/var\(--hds-motion-[a-zA-Z-]+\)/g, '')),
      );
      expect(raws.length, f).toBeGreaterThan(0);
    }
  });
});

describe('App motion stops for reduced motion and for Pause animations', () => {
  // base.css is the first-load sheet; late.css (it loads with the app bar's logo) holds the overlay
  // enter and HDS's rules, off the first-load CSS budget.
  const base =
    strip(readFileSync(join(SRC, 'theme/base.css'), 'utf8')) +
    strip(readFileSync(join(SRC, 'theme/late.css'), 'utf8'));
  const PAUSED = ":root[data-rjb-motion='paused']";

  it('every keyframe animation of base.css and late.css is switched off in both', () => {
    // The classes and attributes that start a keyframe animation in base.css.
    const starters = [
      ...base.matchAll(/([^{}]+)\{[^{}]*\banimation:\s*rjb-[^;]+;[^{}]*\}/g),
    ].flatMap((m) => m[1].split(',').map((s) => s.trim()));
    expect(starters.length).toBeGreaterThan(3);
    const reduced = [
      ...base.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
    ]
      .map((m) => m[1])
      .join('\n');
    for (const full of starters) {
      // The page scope is no part of the off rule's selector.
      const sel = full.replace(/^\[data-hds\] /, '').replace(/\s+/g, ' ');
      expect(reduced.replace(/\s+/g, ' '), `reduced motion: ${sel}`).toContain(sel);
      expect(base.replace(/\s+/g, ' '), `Pause animations: ${sel}`).toContain(`${PAUSED} ${sel}`);
    }
  });

  it('Pause settles every transition at once, as reduced motion does', () => {
    expect(base).toMatch(
      /:root\[data-rjb-motion='paused'\] \*::after \{\s*transition-duration: 0\.01ms !important;/,
    );
  });

  it("HDS's own reduced-motion rules are repeated under the Pause attribute", () => {
    const hds = readFileSync(
      resolve(SRC, '../node_modules/@hirobius/design-system/dist/styles.css'),
      'utf8',
    );
    // Each class HDS gives `animation: none` under reduced motion, in the pinned version.
    const off = [
      ...hds.matchAll(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^{}]*)\{[^{}]*animation:\s*none/g,
      ),
    ]
      .flatMap((m) => m[1].split(','))
      .map((sel) => sel.trim())
      .filter((sel) => /^\.hds-[a-z-]+$/.test(sel));
    expect(off.length).toBeGreaterThan(2);
    for (const sel of new Set(off)) expect(base, sel).toContain(`${PAUSED} ${sel}`);
  });

  it('the boot script sets the attribute before the first paint', () => {
    const boot = readFileSync(resolve(SRC, '../public/theme-init.js'), 'utf8');
    expect(boot).toContain("localStorage.getItem('rjb_ui_pause_motion') === '1'");
    expect(boot).toContain("setAttribute('data-rjb-motion', 'paused')");
  });
});

// The same rule in script (coordinator follow-up 2026-11-18): feedback.ts held FLASH_MS = 1200
// and COLLAPSE_MS = 180, copies of the CSS lengths that a token change would leave behind.
describe('HDS motion tokens only, in script', () => {
  const scripts = files(SRC, /\.tsx?$/);
  const code = (f: string) => strip(readFileSync(f, 'utf8')).replace(/\/\/.*$/gm, '');

  /** Brand motion with its own lengths and curves (docs/agent/brand.md): the flame, the theme
   *  burn and save flight, the sign-in brand move. Only shorten this list. */
  const BRAND = ['account/LinkConfirmScreen.tsx', 'brand/RoleFlame.tsx', 'burn/burn.ts'];

  /** True when a file starts a Web Animation, or writes a `transition` / `animation` value with a
   *  length or a curve of its own (one on HDS variables passes). */
  const ownMotion = (text: string) => {
    if (/\.animate\(/.test(text)) return true;
    for (const m of text.matchAll(/\b(?:transition|animation)\s*:([^;}]{0,200})/g)) {
      const value = m[1].replace(/var\(--hds-motion-[a-zA-Z-]+\)/g, '');
      if (/[`'"]/.test(value) && RAW.test(value)) return true;
    }
    return false;
  };

  it('only brand motion starts an animation or writes its own lengths in script', () => {
    const found = scripts.filter((f) => ownMotion(code(f))).map(rel);
    expect(found.sort()).toEqual(BRAND);
  });

  it('bites: a raw transition in script is caught, one on tokens passes', () => {
    expect(ownMotion("style={{ transition: 'opacity 200ms ease-out' }}")).toBe(true);
    expect(ownMotion('el.animate(frames, { duration: 300 })')).toBe(true);
    expect(
      ownMotion(
        "transition: 'opacity var(--hds-motion-productive-duration) var(--hds-motion-productive-easing)',",
      ),
    ).toBe(false);
  });

  it('feedback.ts waits by token (motionMs), with no length of its own', () => {
    const text = code(join(SRC, 'feedback.ts'));
    expect(text).toContain("motionMs('spatial')");
    expect(text).toContain("motionMs('productive')");
    expect(text).not.toMatch(/_MS\s*=\s*\d/);
    expect(text).not.toMatch(/setTimeout\([^)]*,\s*\d+\s*\)/);
  });
});

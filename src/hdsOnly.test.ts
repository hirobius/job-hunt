// Guard for epic #89: the app renders with @hirobius/design-system only. src/ui (the local
// Box/Stack/Typography + sx engine and Reveal) is retired; this fails if a local UI primitive
// layer, or an import of one, comes back.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('HDS-only UI (epic #89)', () => {
  it('has no local UI primitive layer', () => {
    expect(existsSync(join(SRC, 'ui'))).toBe(false);
  });

  it('imports no local UI primitives', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /from ['"]\.{1,2}\/(?:.*\/)?ui\//.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('sets no text in ALL CAPS (HDS never does)', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /textTransform:\s*['"]uppercase['"]/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('HDS default theme (graphite, Adrian 2026-10-15)', () => {
  it('ships no local accent override: no brand CSS file and no import of one', () => {
    const theme = join(SRC, 'theme');
    const css = existsSync(theme) ? readdirSync(theme).filter((f) => f.endsWith('.css')) : [];
    expect(css.filter((f) => f.startsWith('brand-'))).toEqual([]);
    expect(readFileSync(join(SRC, 'main.tsx'), 'utf8')).not.toMatch(/brand-[a-z]+\.css/);
  });

  it('remaps no HDS accent token in its own CSS', () => {
    const theme = join(SRC, 'theme');
    for (const f of existsSync(theme) ? readdirSync(theme).filter((x) => x.endsWith('.css')) : [])
      expect(readFileSync(join(theme, f), 'utf8'), f).not.toMatch(
        /--(semantic-accent|semantic-color-[a-z]+-accent|semantic-color-content-onAccent|role-accent)[\w-]*\s*:/,
      );
  });
});

describe('HDS version pin (#115 Phase 0)', () => {
  it('pins HDS to an exact version — upgrades go through the HDS upgrade tool only', () => {
    const pkg = JSON.parse(readFileSync(resolve(SRC, '../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@hirobius/design-system']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// Discover redesign (#131): the new Discover parts add no inline `style={{` beyond what they have
// today (HDS gaps and one-off type tweaks only). Lower a ceiling when you remove one; raising it
// means a Stack, Box sx or token would have done.
describe('Discover inline style ceilings (#131)', () => {
  const CEILINGS: Record<string, number> = {
    'DiscoverView.tsx': 9,
    'DiscoverHeader.tsx': 1,
    'LocationControl.tsx': 3,
    'TileGrid.tsx': 5,
    'LiveFeedPanel.tsx': 19,
    'FeedFit.tsx': 5,
    'hds-gaps/AsyncState.tsx': 0,
  };
  it.each(Object.entries(CEILINGS))('%s stays at or under %i', (file, max) => {
    const n = (readFileSync(join(SRC, file), 'utf8').match(/style=\{\{/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(max);
  });
});

// Design polish (#133): one global ratchet on inline `style={{` in non-test .tsx. It only goes
// down: lower MAX_INLINE_STYLES when you remove one; raising it means a Stack, Box sx, a
// token or a hds-gaps stand-in would have done.
describe('Inline style ratchet (#133)', () => {
  // equals the count on main (92); lower it as styles are burned down, never raise it
  const MAX_INLINE_STYLES = 91;
  const tsx = sourceFiles(SRC).filter((f) => f.endsWith('.tsx'));
  const count = tsx.reduce(
    (sum, f) => sum + (readFileSync(f, 'utf8').match(/style=\{\{/g) ?? []).length,
    0,
  );

  it('counts style={{ in src/**/*.tsx and fails above MAX_INLINE_STYLES', () => {
    expect(count).toBeLessThanOrEqual(MAX_INLINE_STYLES);
  });

  it('fails when MAX_INLINE_STYLES is set one lower', () => {
    // the count must equal the constant, so a removed style forces lowering it
    expect(count).toBeGreaterThan(MAX_INLINE_STYLES - 1);
  });

  it('sets no raw font size or weight inline', () => {
    const offenders = tsx.filter((f) =>
      /style=\{\{[^}]*\bfont(Size|Weight)\s*:/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([]);
  });
});

// #193: no decoration that adds noise. Left accent bars and status dots are out; state is text or
// a Tag/Badge, pinned is a star. The Account trigger's unsynced dot is a sync signal, not a row
// status dot, so it is the one allowlisted dot.
export const ACCENT_BAR =
  /border-?left(?!-?(?:width|style)\b)|borderInlineStart|border-inline-start/i;
export const STATUS_DOT = /StatusListItem|(?<![\w-])[\w-]*-dot\b|\bdot\b\s*[:=]|borderRadius:\s*['"]50%['"]/;
const DOT_ALLOWLIST = ['account/AccountMenu.tsx', 'theme/base.css'];

function styleFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return styleFiles(p);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('No accent bars or status dots (#193)', () => {
  it('sets no left accent bar in code or CSS', () => {
    const offenders = styleFiles(SRC).filter((f) => ACCENT_BAR.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('draws no status dot in a row (only the allowlisted sync dot)', () => {
    const offenders = styleFiles(SRC)
      .filter((f) => !DOT_ALLOWLIST.some((a) => f.endsWith(a)))
      .filter((f) => STATUS_DOT.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('bites: the patterns catch a bad sample and pass a clean one', () => {
    expect(ACCENT_BAR.test("sx={{ borderLeft: '3px solid red' }}")).toBe(true);
    expect(ACCENT_BAR.test('border-left: 3px solid var(--x);')).toBe(true);
    expect(ACCENT_BAR.test("sx={{ border: '1px solid' }}")).toBe(false);
    expect(STATUS_DOT.test('<StatusListItem tone="warning" />')).toBe(true);
    expect(STATUS_DOT.test('<span className="row-status-dot" />')).toBe(true);
    expect(STATUS_DOT.test("sx={{ width: 8, borderRadius: '50%', bgcolor: 'feedback.warning' }}")).toBe(true);
    expect(STATUS_DOT.test('<Badge tone="warning">Due</Badge>')).toBe(false);
  });
});

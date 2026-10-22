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

  // Sentence case everywhere (rev-3): the legal pages the Account menu opens were the last Title
  // Case names. The headings, the cross-links and any page title read from legal.ts.
  it('names the legal pages in sentence case, not Title Case', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /Privacy Policy|Terms of Use/.test(readFileSync(f, 'utf8')),
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

// Inline styles (#93, #133): every `style={{` in non-test src/**/*.tsx is on this allowlist, each
// count with the reason HDS can't express it yet. Anything else is an HDS prop, a layout primitive
// or `Box sx` with token keys. Lower a count when you remove one; never add a file or raise one.
// Named style constants (`style={SECONDARY}`) are the hds-gaps idiom, not counted.
describe('Inline style allowlist (#93)', () => {
  const ALLOWED: Record<string, number> = {
    // HDS TabsList hard-codes mb-6 and has no prop to drop it
    'App.tsx': 1,
    // HDS Dialog.Content has no size prop; portalled, so a wrapper can't size it
    'ManageTrackDialog.tsx': 1,
    'account/DataToolsProvider.tsx': 1,
    // "Saved" fade: opacity follows state at runtime
    'JobOverview.tsx': 1,
    // TileGrid: set-aside opacity (runtime); its clamps are base.css classes since slice 4
    'TileGrid.tsx': 1,
  };
  const tsx = sourceFiles(SRC).filter((f) => f.endsWith('.tsx'));
  const counts = Object.fromEntries(
    tsx
      .map(
        (f) =>
          [
            f.slice(SRC.length + 1),
            (readFileSync(f, 'utf8').match(/style=\{\{/g) ?? []).length,
          ] as const,
      )
      .filter(([, n]) => n > 0),
  );

  it('has no inline style outside the allowlist, and none above its count', () => {
    for (const [file, n] of Object.entries(counts))
      expect([file, n]).toEqual([file, Math.min(n, ALLOWED[file] ?? 0)]);
  });

  it('lists each file at its exact count, so a removed style forces lowering it', () => {
    expect(counts).toEqual(ALLOWED);
  });

  // The ratchet (#172): the total `style={{` in non-test src/**/*.tsx. Lower it as styles are
  // burned down, never raise it.
  const MAX_INLINE_STYLES = 5;
  it(`has at most ${MAX_INLINE_STYLES} inline styles in all`, () => {
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    expect(total).toBeLessThanOrEqual(MAX_INLINE_STYLES);
  });

  it('sets no raw font size or weight inline', () => {
    const offenders = tsx.filter((f) =>
      /style=\{\{[^}]*\bfont(Size|Weight)\s*:/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => f.replace(SRC, ''))).toEqual([]);
  });
});

// No raw letter-spacing (#191): tracking comes from HDS type tokens, never hand-set. Covers .ts,
// .tsx and .css under src/ and e2e/, which includes inline `style` and `sx` (camelCase) and CSS.
const RAW_LETTER_SPACING = /letter-?spacing\s*:/i;
const hasRawLetterSpacing = (text: string) => RAW_LETTER_SPACING.test(text);

function guardedFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : guardedFiles(p);
    return /\.(ts|tsx|css)$/.test(name) ? [p] : [];
  });
}

describe('No raw letter-spacing (#191)', () => {
  it('catches camelCase, kebab-case, inline style and sx samples', () => {
    expect(hasRawLetterSpacing(`<Box style={{ ${'letter' + 'Spacing'}: '0.05em' }} />`)).toBe(true);
    expect(hasRawLetterSpacing(`<Box sx={{ ${'letter' + 'Spacing'}: 1 }} />`)).toBe(true);
    expect(hasRawLetterSpacing(`h1 { ${'letter' + '-spacing'} : 0.1em; }`)).toBe(true);
    expect(hasRawLetterSpacing('<Text variant="caption">Spacing</Text>')).toBe(false);
  });

  it('finds none in src/ or e2e/', () => {
    const self = join(SRC, 'hdsOnly.test.ts');
    const files = [...guardedFiles(SRC), ...guardedFiles(resolve(SRC, '..', 'e2e'))].filter(
      (f) => f !== self,
    );
    const offenders = files.filter((f) => hasRawLetterSpacing(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.replace(resolve(SRC, '..'), ''))).toEqual([]);
  });
});

// #193: no decoration that adds noise. Left accent bars and status dots are out; state is text or
// a Tag/Badge, pinned is a star. No dot anywhere, the Account trigger included.
export const ACCENT_BAR =
  /border-?left(?!-?(?:width|style)\b)|borderInlineStart|border-inline-start/i;
export const STATUS_DOT =
  /StatusListItem|(?<![\w-])[\w-]*-dot\b|\bdot\b\s*[:=]|borderRadius:\s*['"]50%['"]/;

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

  it('draws no status dot anywhere', () => {
    const offenders = styleFiles(SRC).filter((f) => STATUS_DOT.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('bites: the patterns catch a bad sample and pass a clean one', () => {
    expect(ACCENT_BAR.test("sx={{ borderLeft: '3px solid red' }}")).toBe(true);
    expect(ACCENT_BAR.test('border-left: 3px solid var(--x);')).toBe(true);
    expect(ACCENT_BAR.test("sx={{ border: '1px solid' }}")).toBe(false);
    expect(STATUS_DOT.test('<StatusListItem tone="warning" />')).toBe(true);
    expect(STATUS_DOT.test('<span className="row-status-dot" />')).toBe(true);
    expect(
      STATUS_DOT.test("sx={{ width: 8, borderRadius: '50%', bgcolor: 'feedback.warning' }}"),
    ).toBe(true);
    expect(STATUS_DOT.test('<Badge tone="warning">Due</Badge>')).toBe(false);
  });
});

// #146: a workaround goes when its HDS fix ships. 0.26.2 gave `sx` a `base` key (hds#652), so the
// old "base on the key, override nested under '&'" pattern must not come back.
describe('Retired HDS workarounds (#146)', () => {
  it("uses sx's base key, not a nested '&' breakpoint override (hds#652)", () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /'&':\s*\{[^}]*\{\s*(?:xs|sm|md|lg|xl):/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('colours secondary Text with tone, not style={SECONDARY} (hds#655)', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /<Text\b[^>]*style=\{SECONDARY\}/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

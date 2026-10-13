// Guard for #93 (epic #89): layout, spacing and sizing come from HDS — component props, `Stack` /
// `Grid` / `Switcher` gaps, `Box sx` — never an inline `style={{…}}`. What HDS cannot take as a prop
// yet is on the allowlist below, one entry per CSS property, each with the reason it stays inline.
// Everything else in a `style` attribute fails, so `marginTop: 8`, `width: '100%'` or `'85vh'`
// cannot drift back.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const SRC = resolve(__dirname);

/** Inline style properties HDS has no prop for yet: the value each may take, and why. */
const ALLOWED: Record<string, { value: RegExp; why: string }> = {
  color: {
    value: /^var\(--semantic-(color-(content|feedback)|accent)-[\w-]+\)$/,
    why: 'Text, Icon, Button and Menu.Item have no tone prop for text colour yet (hds#655)',
  },
  fontWeight: {
    value: /^600$/,
    why: 'Text has no weight prop and the HDS ramp has no semibold body step (tile and section names)',
  },
  overflowWrap: {
    value: /^anywhere$/,
    why: 'Text has no wrap prop; long URLs and company names must break inside a card',
  },
  opacity: {
    value: /^(0(\.\d+)?|1)$/,
    why: 'runtime state (archived, set aside, the saved flash) on Card and Text, which take no sx',
  },
  transition: {
    value: /^opacity [\d.]+s$/,
    why: 'fades the saved flash above',
  },
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : [];
  });
}

/** Every leaf of an expression, through parentheses and ternaries. */
function leaves(e: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(e)) return leaves(e.expression);
  if (ts.isConditionalExpression(e)) return [...leaves(e.whenTrue), ...leaves(e.whenFalse)];
  return [e];
}

const isUndefined = (e: ts.Expression) => ts.isIdentifier(e) && e.text === 'undefined';

function violations(file: string, src = readFileSync(file, 'utf8')): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const at = (n: ts.Node) =>
    `${relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'style') {
      const expr =
        n.initializer && ts.isJsxExpression(n.initializer) ? n.initializer.expression : undefined;
      if (!expr || !ts.isObjectLiteralExpression(expr)) {
        out.push(`${at(n)} style is not an object literal`);
      } else {
        for (const p of expr.properties) {
          if (!ts.isPropertyAssignment(p)) {
            out.push(`${at(p)} ${p.getText(sf)}`);
            continue;
          }
          const key = p.name.getText(sf);
          const rule = ALLOWED[key];
          if (!rule) {
            out.push(`${at(p)} ${key}: ${p.initializer.getText(sf)}`);
            continue;
          }
          for (const leaf of leaves(p.initializer)) {
            const text =
              ts.isStringLiteral(leaf) || ts.isNumericLiteral(leaf) ? leaf.text : undefined;
            if (isUndefined(leaf) || (text !== undefined && rule.value.test(text))) continue;
            out.push(`${at(leaf)} ${key}: ${leaf.getText(sf)}`);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('inline styles stay on the allowlist (#93)', () => {
  it('every style={{…}} property is allowlisted, with an allowed value', () => {
    expect(files(SRC).flatMap((f) => violations(f))).toEqual([]);
  });

  it('flags layout values and passes allowlisted ones', () => {
    const probe = [
      `const a = <div style={{ marginTop: 8 }} />;`,
      `const b = <div style={{ width: '100%' }} />;`,
      `const c = <div style={{ color: '#fff' }} />;`,
      `const d = <div style={{ color: 'var(--semantic-color-content-secondary)' }} />;`,
      `const e = <div style={{ opacity: x ? 0.6 : 1, transition: 'opacity 0.2s' }} />;`,
      `const f = <div style={s} />;`,
    ].join('\n');
    expect(violations(join(SRC, 'probe.tsx'), probe).map((v) => v.replace(/^\S+ /, ''))).toEqual([
      'marginTop: 8',
      "width: '100%'",
      "color: '#fff'",
      'style is not an object literal',
    ]);
  });

  it('gives every allowlist entry a reason', () => {
    for (const [prop, { why }] of Object.entries(ALLOWED))
      expect(why.trim().length, prop).toBeGreaterThan(10);
  });
});

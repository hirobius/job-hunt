import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * docs/figma/FIGMA-RULES.md is pasted into the Figma agent's prompt. It drifts when the rules it
 * summarizes change, so each rule below must still be true in CLAUDE.md and in the code it names.
 */
const RULES = fs.readFileSync('docs/figma/FIGMA-RULES.md', 'utf8');
const CLAUDE = fs.readFileSync('CLAUDE.md', 'utf8');
const PKG = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('FIGMA-RULES.md', () => {
  it('names the design system the app really uses', () => {
    expect(PKG.dependencies['@hirobius/design-system']).toBeTruthy();
    expect(RULES).toContain('@hirobius/design-system');
  });

  it.each([
    ['No cards within cards', /one card level max|No cards within cards/i],
    ['No outlines on surfaces', /No outlines on surfaces/i],
    ['No ALL CAPS', /No ALL CAPS/i],
    ['compact density', /Compact density is the app's only density/i],
    ['graphite accent', /graphite/i],
  ])('keeps "%s" in step with CLAUDE.md', (_name, claude) => {
    expect(CLAUDE).toMatch(claude);
  });

  it("names today's screens as CLAUDE.md does, and marks Find / Apply as planned", () => {
    // Today's top tabs, as CLAUDE.md states them.
    expect(CLAUDE).toMatch(/two top tabs, \*\*Today\*\*[\s\S]{0,200}?\*\*Jobs\*\*/);
    expect(CLAUDE).toMatch(/page head "Pipeline"/);
    expect(RULES).toMatch(/\*\*Today\*\*/);
    expect(RULES).toMatch(/\*\*Jobs\*\*/);
    expect(RULES).toMatch(/page head "Pipeline"/);
    // Find / Apply are named only as planned until CLAUDE.md describes them as built.
    if (!/Two screens: Find and Apply/.test(CLAUDE)) expect(RULES).toMatch(/Planned \(#471/);
  });

  it('pins the page gutter: one value in the code, CLAUDE.md and the rules', () => {
    const css = fs.readFileSync('src/hds-gaps/PageShell.css', 'utf8');
    expect(css).toContain('--rjb-shell-gutter: clamp(1.25rem, 5vw, 4rem);');
    expect(CLAUDE).toContain('clamp(1.25rem, 5vw, 4rem)');
    expect(CLAUDE).toMatch(/20 on a phone/);
    expect(CLAUDE).not.toMatch(/gutter is 16/i);
    expect(RULES).toMatch(/Page gutter 20 on a phone/);
  });
});

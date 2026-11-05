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

  it('names the two screens', () => {
    expect(RULES).toMatch(/\*\*Find\*\*/);
    expect(RULES).toMatch(/\*\*Apply\*\*/);
  });
});

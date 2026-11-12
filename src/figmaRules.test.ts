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
    ['Selected is a fill', /Selected is a fill, never an\s+edge/i],
    ['compact density', /Compact density is the app's only density/i],
    ['graphite accent', /graphite/i],
  ])('keeps "%s" in step with CLAUDE.md', (_name, claude) => {
    expect(CLAUDE).toMatch(claude);
  });

  it('keeps the sign-in words as the code says them (#555)', () => {
    const COPY = fs.readFileSync('src/account/signInCopy.ts', 'utf8');
    for (const line of [
      'Sign in to see your jobs on any device.',
      'We email you a sign-in link. No password needed.',
    ]) {
      expect(RULES).toContain(line);
      expect(CLAUDE).toContain(line);
      expect(COPY).toContain(line);
    }
    expect(RULES).toMatch(/centred by the flame's mass/);
  });

  it('names the views as CLAUDE.md and pipelineView.ts do (#541)', () => {
    const VIEW = fs.readFileSync('src/pipelineView.ts', 'utf8');
    for (const name of ['To apply', 'Follow up', 'Interviewing', 'Applied', 'Recently closed']) {
      expect(RULES).toContain(name);
      expect(CLAUDE).toContain(`**${name}**`);
      expect(VIEW).toContain(`'${name}'`);
    }
    expect(RULES).toMatch(/no Status select/i);
    expect(CLAUDE).toMatch(/the Status select is gone/);
  });

  it('pins the walk control (#542)', () => {
    expect(RULES).toMatch(/\*\*The walk control \(#542\)\.\*\*/);
    expect(RULES).toMatch(/view name truncates, never the pager/);
    expect(CLAUDE).toMatch(/view name truncates, never the pager/);
    const walk = fs.readFileSync('src/ApplyWalk.tsx', 'utf8');
    expect(walk).toContain('All jobs and filters');
    expect(walk).toContain('rjb-menu-sheet');
  });

  it('names the two screens as CLAUDE.md does', () => {
    // The top tabs, as CLAUDE.md states them (#471, #475).
    expect(CLAUDE).toMatch(/Two screens: Find and Apply/);
    expect(CLAUDE).toMatch(/two top tabs, \*\*Find\*\*[\s\S]{0,200}?\*\*Apply\*\*/);
    expect(RULES).toMatch(/\*\*Two screens: Find and Apply\*\*/);
    // The old names are gone from the rules (they stay in CLAUDE.md only as history).
    expect(RULES).not.toMatch(/\*\*Today\*\*|\*\*Jobs\*\*|page head "Pipeline"/);
    // CLAUDE.md keeps "Today · Jobs" only in the one history note that says it was renamed.
    const old = CLAUDE.split('\n').filter((l) => /Today · Jobs/.test(l));
    expect(old.every((l) => /renamed Find · Apply/.test(l))).toBe(true);
  });

  it('pins the exit style (#537): underlined text, the one way out', () => {
    const exit = fs.readFileSync('src/hds-gaps/ExitButton.tsx', 'utf8');
    expect(exit).toContain('variant="link"');
    expect(exit).toContain('hds-touch-target');
    expect(RULES).toMatch(/An exit is underlined text/);
    expect(CLAUDE).toMatch(/An exit is underlined text/);
  });

  it('pins the title block (#538): title first, facts, amber only for a date', () => {
    expect(RULES).toMatch(/A job leads with its title/);
    expect(RULES).toMatch(/No fit chips, no Saved chip, no blue/);
    expect(fs.readFileSync('src/JobHeader.tsx', 'utf8')).toContain('<Card.Facts');
  });

  it('pins the action dock (#535, #536)', () => {
    expect(RULES).toMatch(/The action dock/);
    expect(RULES).toMatch(/Marked not a fit: <title> · Undo/);
    expect(fs.readFileSync('src/applyActions.ts', 'utf8')).toContain("verb = 'Marked not a fit'");
    expect(fs.readFileSync('src/theme/base.css', 'utf8')).not.toContain('rjb-dock');
    expect(RULES).toMatch(/A job with no link\s+never shows Open application/);
    expect(fs.readFileSync('src/dockKeys.ts', 'utf8')).toContain(
      "{ id: 'addLink', rank: 'secondary' }",
    );
  });

  it('pins the keys by state (#540)', () => {
    expect(RULES).toMatch(/The filled key follows the state/);
    const keys = fs.readFileSync('src/dockKeys.ts', 'utf8');
    expect(keys).toContain("{ id: 'copyFollowUp', rank: 'primary' }");
    expect(keys).toContain("{ id: 'closeOut', rank: 'exit' }");
    // One table of keys per state: no second module.
    expect(fs.existsSync('src/editLinkRequest.ts')).toBe(false);
    expect(fs.existsSync('src/templatesOpen.ts')).toBe(false);
    // Copy follow-up copies; only Mark followed up and Close out have an Undo (#593).
    expect(RULES).toMatch(/Close out; the last two with Undo/);
    expect(RULES).not.toMatch(/Close out, each with Undo/);
    // No Undo ever navigates (Adrian 2026-11-11, #593 item 8).
    expect(RULES).toMatch(/Undo never navigates/);
    expect(CLAUDE).toMatch(/Undo never navigates/);
    expect(CLAUDE).not.toMatch(/Undo reopens/);
    expect(CLAUDE).not.toMatch(/fit first/);
  });

  it('pins Copy into the form (#539)', () => {
    expect(RULES).toMatch(/Copy into the form/);
    const base = fs.readFileSync('src/theme/base.css', 'utf8');
    expect(base).not.toMatch(/^\.rjb-blank \{/m);
    expect(base).not.toContain('.rjb-template-row');
  });

  it('pins the one saved list (#534)', () => {
    expect(RULES).toMatch(/One saved list/);
    expect(fs.readFileSync('src/JobRowParts.tsx', 'utf8')).toContain('Remove from Apply');
    expect(fs.readFileSync('src/JobRowParts.tsx', 'utf8')).not.toContain('StarButton');
  });

  it('pins the page gutter: one value in the code, CLAUDE.md and the rules', () => {
    const css = fs.readFileSync('src/hds-gaps/PageShell.css', 'utf8');
    expect(css).toContain('--rjb-shell-gutter: clamp(1.25rem, 5vw, 4rem);');
    expect(CLAUDE).toContain('clamp(1.25rem, 5vw, 4rem)');
    expect(CLAUDE).toMatch(/20 on a phone/);
    expect(CLAUDE).not.toMatch(/gutter is 16/i);
    expect(RULES).toMatch(/Page gutter 20 on a phone/);
  });

  it('pins the lg Apply list header (#614) and the automatic liveness check (#602)', () => {
    expect(RULES).toContain('Apply list column header at 1440 (#614)');
    expect(CLAUDE).toMatch(/lg list\s+column header \(#614/);
    for (const doc of [RULES, CLAUDE]) expect(doc).not.toMatch(/with `LivenessCheck`/);
    const rail = fs.readFileSync('src/JobRail.tsx', 'utf8');
    expect(rail).toContain('<RemoteOnlySwitch />');
    expect(rail).toContain('<PipelineMenus size="sm" compact />');
    expect(rail).not.toContain('LivenessCheck');
    expect(rail).not.toContain('Not in this filter');
  });
});

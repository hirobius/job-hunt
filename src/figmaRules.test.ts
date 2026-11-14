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

  it('keeps the states on the page background, and the done state, as the code does (#553, #554)', () => {
    const EMPTY = fs.readFileSync('src/hds-gaps/EmptyState.tsx', 'utf8');
    const DONE =
      fs.readFileSync('src/ApplyDone.tsx', 'utf8') + fs.readFileSync('src/applyDone.ts', 'utf8');
    expect(RULES).toMatch(/states sit on the page background/);
    expect(CLAUDE).toMatch(/states sit on the page background/);
    expect(EMPTY).toContain('onPage');
    for (const words of ['That is the list', 'Find more jobs', 'All jobs']) {
      expect(RULES).toContain(words);
      expect(DONE).toContain(words);
    }
  });

  it('names the views as CLAUDE.md and pipelineView.ts do (#541)', () => {
    const VIEW = fs.readFileSync('src/pipelineView.ts', 'utf8');
    for (const name of [
      'To apply',
      'Follow up',
      'This week',
      'Interviewing',
      'Applied',
      'Recently closed',
    ]) {
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

  it('pins Documents (#552): groups by use, one New menu, a blanks count', () => {
    expect(RULES).toMatch(
      /\*\*Documents \(#552\): grouped lists, one New menu, a blanks count\.\*\*/,
    );
    expect(CLAUDE).toMatch(
      /\*\*Grouped lists, one New menu, a blanks count \(redesign §5\.10, #552\):\*\*/,
    );
    const lib = fs.readFileSync('src/DocumentsLibrary.tsx', 'utf8');
    expect(lib).toContain("['outreach', 'cover', 'resume', 'note']");
    expect(lib).toContain('label="New document"');
    expect(lib).not.toContain('className="rjb-chip"');
    expect(fs.readFileSync('src/theme/base.css', 'utf8')).not.toContain('.rjb-docs-');
  });

  it('names the two screens as CLAUDE.md does', () => {
    // The top tabs, as CLAUDE.md states them (#471, #475).
    expect(CLAUDE).toMatch(/Two screens: Review and Apply/);
    expect(CLAUDE).toMatch(/two top tabs, \*\*Review\*\*[\s\S]{0,200}?\*\*Apply\*\*/);
    expect(RULES).toMatch(/\*\*Two screens: Review and Apply\*\*/);
    // The old names are gone from the rules (they stay in CLAUDE.md only as history).
    expect(RULES).not.toMatch(/\*\*Today\*\*|\*\*Jobs\*\*|page head "Pipeline"/);
    // CLAUDE.md keeps "Today · Jobs" only in the one history note that says it was renamed.
    const old = CLAUDE.split('\n').filter((l) => /Today · Jobs/.test(l));
    expect(old.every((l) => /renamed Find · Apply/.test(l))).toBe(true);
  });

  it('pins the Account menu (#549): 8 items in 4 groups, toggles that show their state', () => {
    expect(RULES).toMatch(
      /\*\*The Account menu \(#549\): 8 items in 4 groups \(9 signed out\)\.\*\*/,
    );
    expect(CLAUDE).toMatch(/8 items in 4 groups, redesign §5\.9, #549/);
    const menu = fs.readFileSync('src/account/AccountMenuRows.tsx', 'utf8');
    for (const name of ['SIGN_IN_LABEL', 'SIGN_IN_ITEM', 'Pause animations'])
      expect(menu).toContain(name);
    // The signed-out group: a short label with the benefit, then the key "Sign in".
    const COPY = fs.readFileSync('src/account/signInCopy.ts', 'utf8');
    for (const line of [
      'On this device only. Sign in to sync across devices.',
      "SIGN_IN_ITEM = 'Sign in'",
    ])
      expect(COPY).toContain(line);
    for (const doc of [RULES, CLAUDE])
      expect(doc).toContain('"On this device only. Sign in to sync across devices."');
    expect(menu).toContain('<MenuToggleItem');
    expect(menu).not.toMatch(/>\s*Scan details\s*</);
    expect(fs.readFileSync('src/hds-gaps/MenuToggleItem.tsx', 'utf8')).toContain(
      'role="menuitemcheckbox"',
    );
    expect(fs.readFileSync('src/SearchProfileDialog.tsx', 'utf8')).toContain(
      'label="Scan details"',
    );
  });

  it('pins the Data dialog (#550): one lazy dialog for the data actions', () => {
    expect(RULES).toMatch(/\*\*The Data dialog \(#550\)\.\*\*/);
    expect(CLAUDE).toMatch(/\*\*Data dialog \(redesign §5\.9, #550\):\*\*/);
    const dialog = fs.readFileSync('src/account/DataDialog.tsx', 'utf8');
    expect(dialog).toContain('rjb-bottom-sheet');
    for (const name of ['Your data', 'This device', 'Back up', 'Reset local data…'])
      expect(dialog).toContain(name);
    expect(fs.readFileSync('src/lazyDialogs.ts', 'utf8')).toContain(
      "import('./account/DataDialog')",
    );
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
    expect(fs.readFileSync('src/DetailHeader.tsx', 'utf8')).toContain(
      '<Card.Facts className="p-0" items={facts} />',
    );
    expect(fs.readFileSync('src/JobHeader.tsx', 'utf8')).toContain('<DetailTitleBlock');
  });

  it('pins one detail template for a posting and a job (#546)', () => {
    expect(RULES).toContain('One detail template at 1440 (#546)');
    expect(CLAUDE).toContain('One detail template at 1440 (#546');
    for (const file of ['src/JobHeader.tsx', 'src/ReviewView.tsx']) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toContain('<DetailHeader');
      expect(src).toContain('<DetailTitleBlock');
    }
    expect(RULES).toContain('Review at 1440\n  opens with the first posting selected');
    // At lg a Find list card carries no keys: the detail column has them.
    expect(fs.readFileSync('src/ReviewView.tsx', 'utf8')).toContain('keys={!onOpen}');
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

  it('pins Find as one list (2026-11-13): no Deck, no switch, the phone pager, no filter row', () => {
    expect(RULES).toMatch(/Review is one list \(2026-11-13\)/);
    expect(RULES).toMatch(
      /with no source or New\s+badge \(#557\)|carry no source or New\s+badge \(#557\)/,
    );
    expect(CLAUDE).not.toMatch(/\*\*Find Deck \(#545/);
    expect(fs.existsSync('src/FindDeck.css')).toBe(false);
    const review = fs.readFileSync('src/ReviewView.tsx', 'utf8');
    expect(review).not.toMatch(/\bDeck\b|ActionDock|SwipeArea|Checkbox|remoteOnly/);
    expect(review).not.toContain('<Badge tone="info">');
    expect(review).toContain('aria-label="Postings in the list"');
    expect(fs.readFileSync('src/FindHeader.tsx', 'utf8')).not.toContain('Pagination');
    // The Apply job still swipes.
    expect(fs.readFileSync('src/JobPage.tsx', 'utf8')).toContain('<SwipeArea');
  });

  it("pins Find's Review (2026-11-12): no visible heading, no Sort", () => {
    expect(RULES).toMatch(/No visible "Review" heading \(2026-11-12\)/);
    // No Sort on Find (Adrian 2026-11-13): newest first, always.
    expect(fs.existsSync('src/FindSortMenu.tsx')).toBe(false);
    expect(RULES).toMatch(/No Sort on Review \(2026-11-13\)/);
    expect(fs.readFileSync('src/FindHeader.tsx', 'utf8')).not.toContain('Menu.RadioGroup');
    expect(fs.readFileSync('src/ReviewView.tsx', 'utf8')).toContain('titleHidden');
  });

  it("pins the top tabs: Review's count, equal segments (2026-11-13)", () => {
    expect(RULES).toMatch(/The Review tab shows its count of postings still to decide/);
    expect(fs.readFileSync('src/TopTabCount.tsx', 'utf8')).toContain('<CountBadge');
    expect(fs.readFileSync('src/CountBadge.tsx', 'utf8')).toContain(
      '<Badge count={count} max={COUNT_MAX}',
    );
    expect(fs.readFileSync('src/theme/base.css', 'utf8')).toContain(
      'grid-template-columns: 1fr 1fr;',
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

  it('pins no Application kit on a job (2026-11-13)', () => {
    expect(RULES).toMatch(/No Application kit on a job/);
    const base = fs.readFileSync('src/theme/base.css', 'utf8');
    expect(base).not.toMatch(/^\.rjb-blank \{/m);
    expect(base).not.toContain('.rjb-template-row');
  });

  it('pins the one saved list (#534)', () => {
    expect(RULES).toMatch(/One saved list/);
    expect(fs.readFileSync('src/JobRowParts.tsx', 'utf8')).toContain('Remove from Apply');
    expect(fs.readFileSync('src/JobRowParts.tsx', 'utf8')).not.toContain('StarButton');
  });

  it('pins found companies in the Companies dialog, not on Find (#618)', () => {
    expect(RULES).toContain('under **Found** (Follow / Ignore), never on Review');
    expect(CLAUDE).toContain('New companies\n  left Find (#618');
    expect(fs.readFileSync('src/Today.tsx', 'utf8')).not.toContain('NewCompanies');
    expect(fs.readFileSync('src/CompaniesDialog.tsx', 'utf8')).toContain('<NewCompanies />');
  });

  it('pins the page gutter: one value in the code, CLAUDE.md and the rules', () => {
    const css = fs.readFileSync('src/hds-gaps/PageShell.css', 'utf8');
    expect(css).toContain('--rjb-shell-gutter: clamp(1.25rem, 5vw, 4rem);');
    expect(CLAUDE).toContain('clamp(1.25rem, 5vw, 4rem)');
    expect(CLAUDE).toMatch(/20 on a phone/);
    expect(CLAUDE).not.toMatch(/gutter is 16/i);
    expect(RULES).toMatch(/Page gutter 20 on a phone/);
  });

  it('pins the All jobs sheet and the one job list (#543)', () => {
    expect(RULES).toContain('**The All jobs sheet (#543).**');
    expect(RULES).toMatch(/One job list, sheet and 1440 column alike/);
    expect(CLAUDE).toMatch(/One job list, sheet and lg column alike/);
    const list = fs.readFileSync('src/TrackerView.tsx', 'utf8');
    expect(list).toContain('<PipelineMenus chip />');
    expect(list).toContain('<JobRowList');
    expect(list).not.toContain('<Card');
    const rail = fs.readFileSync('src/JobRail.tsx', 'utf8');
    expect(rail).toContain('<JobRowList');
    expect(rail).not.toContain('JobPostingLink');
    const page = fs.readFileSync('src/JobPage.tsx', 'utf8');
    expect(page).not.toMatch(/ApplyFilterBar|RemoteOnlySwitch|AddJobButton|SampleBanner/);
    for (const gone of ['ApplyFilterBar', 'ApplyQueueSummary', 'JobListCard'])
      expect(fs.existsSync(`src/${gone}.tsx`)).toBe(false);
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

  it('pins Add job (#551): one filled key, a grey key, no Cancel', () => {
    expect(RULES).toMatch(/\*\*Add job \(#551\): one field and one filled key\.\*\*/);
    expect(CLAUDE).toMatch(/\*\*Add job \(redesign §5\.10, #551\)/);
    const dialog = fs.readFileSync('src/AddJobDialog.tsx', 'utf8');
    expect(dialog).toContain("'Type a company or title instead'");
    expect(dialog).toContain('rjb-bottom-sheet');
    expect(dialog).not.toMatch(/>\s*Cancel\s*</);
  });

  it("pins a posting's facts, one per line (#616)", () => {
    expect(RULES).toMatch(/A posting's facts, one per line \(#616\)/);
    expect(CLAUDE).toMatch(/\*\*one fact per line\*\* \(#616/);
    const review = fs.readFileSync('src/ReviewView.tsx', 'utf8');
    expect(review).toContain('<Card.Facts');
    expect(review).toContain('{ icon: MapPin, label: placeOf(r) }');
    // Left out when the place already says remote (2026-11-12, reversing "once, also then").
    expect(review).toContain('placeSaysRemote(placeOf(r))');
    expect(RULES).toMatch(/work-mode\s+line is left out when the place already says remote/);
    // Icon on the first text line: HDS Card.Facts' stacked layout (0.43), never `inline` here.
    expect(review).not.toMatch(/layout="inline"/);
    expect(fs.readFileSync('src/DailyPicks.tsx', 'utf8')).toContain('<Card.Facts');
    expect(fs.existsSync('src/hds-gaps/FactLines.tsx')).toBe(false);
  });

  it('pins the compact Find card and the short header (#544)', () => {
    expect(RULES).toMatch(/\*\*The compact Review card \(#544\)\.\*\*/);
    expect(RULES).toMatch(/\*\*Review's short header \(#544\)\.\*\*/);
    expect(CLAUDE).toMatch(/A Browse card is compact \(#544/);
    const review = fs.readFileSync('src/ReviewView.tsx', 'utf8');
    expect(review).toContain('lineClamp={3}');
    expect(review).toContain('openKey={!compact}');
    const head = fs.readFileSync('src/FindHeader.tsx', 'utf8');
    // No More menu on Find (#694): Scan now and Search profile are the Account menu's.
    expect(head).not.toContain('Menu');
    // No visible "Find" title: the h1 is .sr-only; nothing in the page bar since the Deck went.
    expect(head).toContain('className="sr-only"');
    expect(head).not.toContain('<InPageBar>');
    expect(RULES).toMatch(/\*\*The page bar \(2026-11-12\)\.\*\*/);
    expect(CLAUDE).toMatch(/\*\*The page bar \(2026-11-12/);
  });

  it('pins no duplicate counts at the top of Find: the chips hold them', () => {
    expect(RULES).toContain('"Scanned 2 h ago" lives only in Scan details');
    expect(RULES).not.toContain('4 new · scanned');
    expect(CLAUDE).not.toContain('4 new · scanned');
    const review = fs.readFileSync('src/ReviewView.tsx', 'utf8');
    expect(review).not.toContain('countLabel={`${listed.length} postings`}');
    expect(review).toContain('role="status" aria-live="polite"');
  });

  it('pins the one-row app bar (#548) and the logo home link (#620)', () => {
    expect(RULES).toMatch(/\*\*One app-bar row \(#548\)\.\*\*/);
    expect(RULES).toMatch(/\*\*The logo is the home link \(#620\)\.\*\*/);
    expect(CLAUDE).toMatch(/one app-bar row at every width \(#548\)/);
    expect(CLAUDE).toMatch(/The logo is the home link \(#620\)/);
    const app = fs.readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('className="rjb-segs"');
    expect(app).toContain('className="rjb-page-bar"');
    expect(app).not.toContain('rjb-segs-full');
    expect(app).toContain('rjb-logo-link');
    const base = fs.readFileSync('src/theme/base.css', 'utf8');
    expect(base).toContain('border-radius: var(--seg-inner-radius);');
    expect(base).toContain('padding: var(--seg-rail-pad);');
  });
});

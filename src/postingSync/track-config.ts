// Track config (Muse handoff, 2026-10-24): what the scorer (score.ts) reads for one track. Ported
// as given; a track is tuned here, never in the scorer. Pure, so the client and the sync edge
// function (supabase/functions/sync-postings) share it.
import { NOT_UI_DESIGN_SOURCE, UI_TITLE_SOURCE } from './designRoleGuard.ts';

export interface DescriptionSignal {
  pattern: string;
  label: string;
  weight: number;
}

export interface TrackConfig {
  slug: string;
  name: string;
  titleStrong: string[];
  titleAdjacent: string[];
  titleNegative: string[];
  descriptionSignals: DescriptionSignal[];
  adjacentSignalsToQueue: number;
  adjacentSignalsToReview: number;
  aggregatorQueries: string[];
}

/** Design engineering (Adrian 2026-11-11): a design engineer or UX engineer title with a UI word
 *  in it (UX, UI, web, front-end, design system, React, interface; Adrian 2026-11-17) is strong,
 *  unless the title names hardware, physical-product, civil or exhibit work (the shared guard,
 *  designRoleGuard.ts, which the Feed and the keyless feeds use too). The guard sits inside the
 *  pattern because a strong title overrides titleNegative. */
export const DESIGN_ENGINEER_STRONG = `^(?!.*${NOT_UI_DESIGN_SOURCE})(?=.*${UI_TITLE_SOURCE}).*\\b(design|ux) engineers?\\b`;
/** A plain design engineer title ("Design Engineer", "Senior Design Engineer"; Adrian 2026-11-17:
 *  "Senior Railway Yard Drainage Design Engineer" and "Exhibit Design Engineer" queued on the title
 *  alone): adjacent, so the description has to show design-systems work, as a product-design
 *  title's does. */
export const DESIGN_ENGINEER_ADJACENT = `^(?!.*${NOT_UI_DESIGN_SOURCE}).*\\bdesign engineers?\\b`;
/** Design Technologist titles, with the same guard. */
export const DESIGN_TECHNOLOGIST_STRONG = `^(?!.*${NOT_UI_DESIGN_SOURCE}).*\\bdesign technologists?\\b`;

/** Product-design titles that count when the description confirms design-systems work (Adrian
 *  2026-11-15): Product, UX, UI, Visual or Interaction Designer. Adjacent in the scorer (two body
 *  signals queue it, one holds it for review, none rejects it), and the Feed's inclusion check
 *  lets the same titles in on the same evidence (feed/include.ts `bodyConfirms`). */
export const PRODUCT_DESIGN_TITLE = '(product|ux|ui|visual|interaction) designer';
/** Body signals a product-design title needs for the Feed to list it: the scorer's queue bar. */
export const BODY_SIGNALS_TO_LIST = 2;

export const designSystemsTrack: TrackConfig = {
  slug: 'design-systems',
  name: 'Design Systems',
  titleStrong: [
    'design systems?',
    'design infrastructure',
    'design platform',
    'design tokens?',
    'token (architect|engineer|designer)',
    'component (library|platform|systems?) (engineer|designer|developer|lead)',
    'design systems? (engineer|designer|developer|lead|manager|architect|specialist|consultant)',
    '(engineer|designer|developer|lead|manager|architect) — design systems?',
    // Adrian 2026-11-11: design engineering roles are searched as well (this replaces the
    // 2026-10-23 tune that left "design engineer" out).
    DESIGN_ENGINEER_STRONG,
    DESIGN_TECHNOLOGIST_STRONG,
  ],
  // Creative technologist stays adjacent: it is often an agency or marketing role, so the body
  // has to show design-system work.
  titleAdjacent: [
    DESIGN_ENGINEER_ADJACENT,
    'creative technologist',
    'ui engineer',
    // "Frontend" too (2026-11-15: "Frontend Engineer, UI Platform" matched nothing).
    'front[- ]?end (engineer|developer).*(design|ui|component)',
    '(software|web|platform) engineer.*(ui platform|design infrastructure|component librar)',
    PRODUCT_DESIGN_TITLE,
    'design.*foundations',
    'foundations (designer|engineer)',
    'pattern library',
    'design ops',
    'prototyp(e|ing) engineer',
  ],
  titleNegative: [
    'mechanical',
    'electrical',
    'industrial design engineer',
    'hvac',
    'controls? (engineer|systems)',
    'embedded systems',
    'systems administrator',
    'systems analyst',
    'it systems',
    'network systems',
    'security systems',
    'game.*systems designer',
    'systems designer.*game',
    'design verification',
    'chip|silicon|hardware',
    'manufacturing',
    'plumbing|electrical systems design',
    'sales|solutions engineer.*systems',
  ],
  descriptionSignals: [
    { pattern: 'design systems?', label: 'design system', weight: 3 },
    { pattern: 'component librar(y|ies)', label: 'component library', weight: 3 },
    { pattern: 'design tokens?', label: 'design tokens', weight: 3 },
    {
      pattern: 'figma (variables|tokens|library|libraries)',
      label: 'Figma library/variables',
      weight: 2,
    },
    { pattern: 'storybook', label: 'Storybook', weight: 2 },
    {
      pattern: '(multi[- ]brand|theming|themes) (support|system|architecture)',
      label: 'theming/multi-brand',
      weight: 2,
    },
    {
      pattern: 'design infrastructure|design platform team',
      label: 'design infra/platform team',
      weight: 2,
    },
    {
      pattern:
        '(wcag|accessibility) (standards|system|compliance) (for|across) (components|products)',
      label: 'system-level a11y',
      weight: 1,
    },
    {
      pattern: 'tokens? (pipeline|architecture|governance)',
      label: 'token pipeline/governance',
      weight: 2,
    },
    {
      pattern: 'codemods?|deprecat(ion|ed) (components|api)',
      label: 'codemods/deprecation',
      weight: 1,
    },
  ],
  adjacentSignalsToQueue: BODY_SIGNALS_TO_LIST,
  adjacentSignalsToReview: 1,
  aggregatorQueries: [
    '"design systems" engineer remote',
    '"design systems" designer remote',
    '"design system" "product designer" remote',
    '"design technologist" remote',
    '"design engineer" "design systems" remote',
    '"design engineer" remote',
    '"ux engineer" remote',
    '"front-end design engineer" remote',
    '"component library" engineer remote',
  ],
};

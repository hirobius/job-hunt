// Track config (Muse handoff, 2026-10-24): what the scorer (score.ts) reads for one track. Ported
// as given; a track is tuned here, never in the scorer. Pure, so the client and the sync edge
// function (supabase/functions/sync-postings) share it.
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
  ],
  // One tune (Adrian 2026-10-23): "design engineer" is left out. Design Engineer roles come in only
  // when the title is clearly a design-system one (titleStrong).
  titleAdjacent: [
    'design technologist',
    'creative technologist',
    'ui engineer',
    'ux engineer',
    'front[- ]end (engineer|developer).*(design|ui|component)',
    '(product|ux|ui) designer.*(platform|infrastructure|systems|foundations|core)',
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
  adjacentSignalsToQueue: 2,
  adjacentSignalsToReview: 1,
  aggregatorQueries: [
    '"design systems" engineer remote',
    '"design systems" designer remote',
    '"design system" "product designer" remote',
    '"design technologist" remote',
    '"design engineer" "design systems" remote',
    '"component library" engineer remote',
  ],
};

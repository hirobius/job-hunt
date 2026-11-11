// Design engineer guard (Adrian 2026-11-11: "add design-engineer titles AND keep the false-positive
// filters"). "Design Engineer" is also a hardware, building and physical-product title, so the
// related-title pass (feed/mustInclude.ts), the keyless server feeds (feeds/dsRole.ts) and the
// scorer (track-config.ts) all ask this one module whether a design engineer, UX engineer or design
// technologist title names non-UI work. Pure and import-free, so the app and the Deno sync function
// both load it (`./designRoleGuard.ts` from tracks code).
//
// Word rules, never bare substrings: each entry is a whole word or phrase (words joined by spaces or
// hyphens). A few carry exceptions, so UI roles stay in: "Design Engineer, Design Process" (process
// only as manufacturing), "Design Engineer, Developer Tooling" (only a lone "tool", as in tool and
// die), "UI Product Design Engineer" (product design engineer only without a UI word), "Design
// Systems Engineer" (a lone "system design engineer" only).

const S = '[\\s-]+';
const UI = `(?:ui|ux|web|front(?:${S})?end|frontend|design${S}systems?|react|interface)`;

/** Non-UI words and phrases, as regex sources (case-insensitive, `\b` added around each). */
const NOT_UI_TERMS = [
  // Electronics and silicon.
  'hardware',
  'electrical',
  'electronics?',
  `electro(?:${S})?mechanical`,
  'mechanical',
  'rf',
  'rfic',
  'mmic',
  'asic',
  'fpga',
  'analog',
  `mixed${S}signal`,
  `(?:physical|digital|circuit|layout|logic)${S}design`,
  'circuits?',
  'pcba?',
  `ic${S}(?:design|layout)`,
  'soc',
  'semiconductors?',
  'silicon',
  'chips?',
  'rtl',
  'vlsi',
  'verilog',
  'noc',
  'firmware',
  'embedded',
  'verification',
  'power',
  'battery',
  'batteries',
  'thermal',
  'mechatronics?',
  'robotics',
  'actuators?',
  'sensors?',
  'motors?',
  'powertrain',
  'drivetrain',
  'antennas?',
  'optics',
  'optical',
  'photonics?',
  'cad',
  // Vehicles, buildings and infrastructure.
  'aerospace',
  'avionics',
  'automotive',
  'vehicles?',
  'propulsion',
  'satellites?',
  'civil',
  'structural',
  'substations?',
  'hvac',
  'mep',
  'plumbing',
  'piping',
  'water',
  'wastewater',
  'transportation',
  'highways?',
  'bridges?',
  'geotechnical',
  `data${S}cent(?:er|re)s?`,
  'utility',
  'utilities',
  'telecom',
  'nuclear',
  'solar',
  `fire${S}protection`,
  'lighting',
  'interior',
  'landscape',
  // Physical products and manufacturing.
  `medical${S}devices?`,
  'industrial',
  'manufacturing',
  'packaging',
  'molds?',
  'molding',
  'enclosures?',
  `sheet${S}metal`,
  'fixtures?',
  'tool', // "Tool Design Engineer", tool and die; never "tools" or "tooling"
  'dies?',
  `(?<!design${S})process`, // "Process Design Engineer"; "Design Process" is UI work
  // A mechanical-sense product design engineer: no UI word on either side.
  `(?<!${UI}${S})product${S}design${S}engineers?(?!.*\\b${UI}\\b)`,
  // System design is not design systems ("Design System Design Engineer" aside).
  `(?<!design${S})systems?${S}design${S}engineers?`,
];

/** One regex source for the whole list: the scorer puts it in a lookahead (track-config.ts). */
export const NOT_UI_DESIGN_SOURCE = `\\b(?:${NOT_UI_TERMS.join('|')})\\b`;
const NOT_UI_RE = new RegExp(NOT_UI_DESIGN_SOURCE, 'i');

/** The title names hardware, building or physical-product work: as a design engineer (or UX
 *  engineer, design technologist) title, never a UI role. */
export const notUiDesignTitle = (title: string): boolean => NOT_UI_RE.test(title);

/** The scorer's intern rule (score.ts `fitRejectReason`). */
const INTERN_RE = /\b(?:intern|internship|apprentice)\b/i;

/** A title a related-title rule may let in: not non-UI work, not an internship. */
export const relatedTitleOk = (title: string): boolean =>
  !notUiDesignTitle(title) && !INTERN_RE.test(title);

// Display only (Find's Browse excerpt, 2026-11-12): a run of ALL CAPS words reads title-cased,
// "ABOUT RAMP" → "About Ramp". Short all-caps words alone (UX, API, US) are acronyms and stay.
// The stored text never changes.

const RUN = /\b[A-Z][A-Z'’&-]*(?:[ \t]+[A-Z][A-Z'’&-]*)+\b|\b[A-Z][A-Z'’&-]{4,}\b/g;

/** "ABOUT RAMP" → "About Ramp": each word of an all-caps run title-cased. */
export function capsToSentence(text: string): string {
  return text.replace(RUN, (run) =>
    run.replace(/[A-Z][A-Z'’&-]*/g, (w) =>
      w.length <= 3 && run === w ? w : w[0] + w.slice(1).toLowerCase(),
    ),
  );
}

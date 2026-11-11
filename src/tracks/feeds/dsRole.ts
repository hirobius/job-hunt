// The keyless server feeds (Arbeitnow, Remote OK, We Work Remotely) hand back whole lists, mostly
// not design-systems work. Only roles that could be are kept, so each user's postings table never
// fills with rows the scorer would reject anyway; the scorer still makes the call on what is kept.
// Whole words: "ecosystem" and "system design" never count. Pure, `.ts`-free imports for Deno.
const DS = /\bdesign[\s-]+systems?\b/i;
const TECHNOLOGIST = /\bdesign[\s-]+technologists?\b/i;
const DESIGN_ENGINEER = /\b(design|ux)[\s-]+engineers?\b/i;

/** The title says design system(s), design technologist, design engineer or UX engineer, or the
 *  description says design system. The scorer drops hardware design engineers. */
export const isDsRole = (title: string, text = ''): boolean =>
  DS.test(title) || TECHNOLOGIST.test(title) || DESIGN_ENGINEER.test(title) || DS.test(text);

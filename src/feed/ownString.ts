// A string of its own (sign-in memory, 2026-11-12). In V8 a slice of a long string is a "sliced
// string" that points into its parent, so a 200-character snippet or a 1,500-character stored body
// kept the whole description (often 10-25 kB, plus the whitespace-flattened copy it was cut from)
// alive for as long as the posting was held. Joining the characters builds a new flat string.
export const ownString = (s: string): string => (s.length < 64 ? s : s.split('').join(''));

/** The first `max` characters, as a string of their own. */
export const cutText = (s: string, max: number): string =>
  s.length > max ? ownString(s.slice(0, max)) : s;

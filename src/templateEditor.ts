// Editing helpers for the Templates editor (#132). HDS `Textarea` has no insert-at-cursor API, so
// the editor reads the element's selection and writes the new text back through the snippet.

/** The five tokens the editor offers: the four a job fills, and the user's own name. */
export const TOKEN_CHIPS = [
  { token: '[Company]', hint: "Fills from the job's company" },
  { token: '[Role]', hint: "Fills from the job's title" },
  { token: '[Contact]', hint: "Fills from the job's contact" },
  { token: '[Angle]', hint: "Fills from the job's angle (why you fit)" },
  { token: '[Your name]', hint: 'Stays as written: add your own name before you send' },
] as const;

/** Put `text` at the caret (or over the selection); with no caret it goes on the end. */
export function insertAt(
  value: string,
  start: number | null,
  end: number | null,
  text: string,
): { value: string; caret: number } {
  const from = start ?? value.length;
  const to = end ?? from;
  return { value: value.slice(0, from) + text + value.slice(to), caret: from + text.length };
}

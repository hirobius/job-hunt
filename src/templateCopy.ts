// One copy helper for Templates (#132): the editor's Copy button and the job page's Use template
// dialog both write the filled text to the clipboard and report what happened for a toast.
export type CopyResult = { ok: true } | { ok: false; reason: string };

export async function copyFilled(text: string): Promise<CopyResult> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "Your browser wouldn't copy it. Select the text and copy it by hand.",
    };
  }
}

/** A copy that failed (no clipboard permission): the toast holds the text itself, to select and
 *  copy by hand (interaction review 2026-11-11). */
export function copyFailed(label: string, value: string) {
  return {
    title: `Couldn’t copy ${label}. Select the text and copy it by hand.`,
    description: value,
    tone: 'warning' as const,
    duration: 20000,
  };
}

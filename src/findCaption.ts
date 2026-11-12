// Find's one caption (#544): "Scanned 2 h ago". The new count left it (the New chip shows it, and
// the list's polite status says it). Each part is its own item (MetaCaption puts
// the separator between them); a part that is not known yet is left out, never guessed.

/** The caption's items: when the sources were last scanned ("2 h ago", from `agoPhrase`), or that a scan runs. */
export function findCaption(scannedAgo: string | null, scanning = false): string[] {
  const parts: string[] = [];
  if (scanning) parts.push('scanning…');
  else if (scannedAgo) parts.push(`scanned ${scannedAgo}`);
  // A caption starts with a capital, whichever part leads.
  if (parts[0]) parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts;
}

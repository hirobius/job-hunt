// Find's one caption (#544): "4 new · scanned 2 h ago". Each part is its own item (MetaCaption puts
// the separator between them); a part that is not known yet is left out, never guessed.

/** The caption's items: the new count (postings first seen today, as the New chip counts them),
 *  then when the sources were last scanned ("2 h ago", from `agoPhrase`), or that a scan runs. */
export function findCaption(
  newCount: number | null,
  scannedAgo: string | null,
  scanning = false,
): string[] {
  const parts: string[] = [];
  if (newCount !== null) parts.push(newCount > 0 ? `${newCount} new` : 'Nothing new');
  if (scanning) parts.push('scanning…');
  else if (scannedAgo) parts.push(`scanned ${scannedAgo}`);
  // A caption starts with a capital, whichever part leads.
  if (parts[0]) parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts;
}

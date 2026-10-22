/** The letter an item card's round avatar shows (ItemCard): the first letter or digit of its
 *  name, upper case, or nothing when the name has none. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name);
  return m ? m[0].toUpperCase() : '';
}

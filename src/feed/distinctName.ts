// Is a company name distinct enough that a board answering for it is probably that company's?
// "Close", "Promise" or "Toast" are slugs many strangers' boards answer for; "Figmatic" is not.
// Pure, with `.ts` specifiers: the seed (feed/seed/resolve.ts) and the server's board suggestions
// (tracks/boardSuggest.ts, Deno) share it.

/** A name folded for comparison: accents, legal suffixes, "the", "labs" and punctuation dropped. */
export const normName = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|group|the|hq|labs?)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Shortest name a description alone ("At <Name>", "<Name> is a") can confirm. */
export const DISTINCT_NAME = 7;

/** Ordinary English words seen as company names: "At Promise" or "Instrument is a" in a stranger's
 *  description says nothing about whose board it is. Lower case, letters only. */
export const COMMON_WORDS: ReadonlySet<string> = new Set(
  (
    'ability abstract academy account advance advisor airline alliance amplify analyst anchor ' +
    'anthem archive arrival athlete balance barrier battery beacon benefit billion blossom ' +
    'booking bracket brigade cabinet calendar capital caravan careful catalyst central century ' +
    'champion channel chapter charter circuit citizen classic climate cluster collect college ' +
    'compass complete concept conduct connect console contact content context control convert ' +
    'cooking counsel country courage crystal culture current curious customer default delight ' +
    'deliver density digital diploma discord display distant element embassy emerald empower ' +
    'endless engine evident example excited expanse explore express factory faithful fashion ' +
    'feature finance fitness forward freedom frontier gallery general genuine glimpse harbor ' +
    'harvest heritage history holiday homebase horizon imprint instrument journey justice kindred kingdom ' +
    'kitchen landing lantern largest lattice leading lecture liberty library license lighthouse ' +
    'machine mailbox mammoth mansion measure meridian message million mission monarch morning ' +
    'motion natural network neutral notable notion nucleus observe offline opinion orchard ' +
    'outcome outlook outside overture package passage passport pathway pattern payment percent ' +
    'persona picture pilgrim pioneer pivotal planner plateau popular portion premium present ' +
    'primary printer private problem process product program progress project promise prospect ' +
    'protect purpose quantum quarter railway rainbow reality receipt recover reflect relevant ' +
    'remote request reserve resolve respect revenue routine scholar science seasons section ' +
    'segment service shelter signal silicon society soldier speaker spectrum station steward ' +
    'storage strategy studio subject success summary summit support surface sustain teacher ' +
    'thought tonight traffic transit treasure triangle trinity triumph trouble trusted uniform ' +
    'universe upgrade utility venture verdict village virtual visible volume voyage weather ' +
    'welcome western whisper wildfire witness wonder workshop'
  ).split(/\s+/),
);

/** A name a description pattern can safely confirm: long enough and not an everyday word. */
export function distinctName(name: string): boolean {
  const bare = normName(name);
  return bare.length >= DISTINCT_NAME && !COMMON_WORDS.has(bare);
}

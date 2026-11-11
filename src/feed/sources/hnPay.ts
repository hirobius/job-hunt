// Yearly pay from the free text of a Hacker News "Who is hiring?" post (#576 item 2). HN posts
// carry pay as prose: "$180k–220k", "180-220K USD", "€90k", "£70,000 - £85,000 + equity",
// "$200k OTE", "CA$150k". Only a figure or range that names a currency (a symbol or a code) counts,
// so a bare "401k", a "10k users" or a year never does. Each currency keeps its own code (CA$ is
// CAD, never USD): the pay floor compares USD only (targeting.ts) and keeps any other currency.
//
// Conservative on purpose: a wrong low figure would hide a posting under the pay floor, while no
// figure lets it through (unknown pay passes, as before). So:
// - only yearly pay: an hourly / daily / monthly rate, or a figure under 20k or over 1M, is skipped;
// - a figure whose nearby words say it is not base pay ("$50k sign-on bonus", "$40k equity",
//   "raised $750k pre-seed", "$300k MRR") is skipped;
// - figures near salary words ("Salary:", "base", "OTE", "comp") or written as a range are
//   preferred; several left in one currency give their whole span ("Up to $90k for juniors,
//   $180k for seniors" is 90k–180k); two currencies left, or none, give no pay. Pure.

export interface Pay {
  salaryMin: number;
  salaryMax: number;
  currency: string;
}

const SYMBOL: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };
/** The letters before a "$" that name its dollar: US$, CA$ / C$, AU$ / A$, NZ$, S$, HK$. */
const DOLLAR: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  C: 'CAD',
  AU: 'AUD',
  A: 'AUD',
  NZ: 'NZD',
  S: 'SGD',
  HK: 'HKD',
};
const CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'CHF', 'SEK', 'NOK', 'DKK'];
const CODE = `(?:${CODES.join('|')})`;
const PRE = `(?:(${Object.keys(DOLLAR).join('|')})?([$€£])|(${CODE})\\s?)`;
const NUM = `(\\d{1,3}(?:[,.]\\d{3})+|\\d{1,7}(?:\\.\\d+)?)\\s?([kK])?`;
const SEP = `\\s?(?:-|–|—|to)\\s?`;
const PAY = new RegExp(
  `(?<![\\w$€£.,])${PRE}?${NUM}(?:${SEP}${PRE}?${NUM})?(?:\\s?(${CODE})\\b)?`,
  'g',
);
/** Words right after a figure that make it a rate, not a yearly salary. */
const RATE = /^\s*(?:\/|per\s+|an?\s+)?\s*(?:h|hr|hrs|hour|hourly|day|daily|d|wk|week|month|mo)\b/i;
/** Words beside a figure that say it is not base pay. */
const NOT_BASE =
  /\b(?:bonus(?:es)?|sign[- ]?on|signing|equity|stock|rsus?|options?|relocation|stipends?|budgets?|revenue|arr|mrr|raised|raising|funding|funded|seed|series|valuation|grants?|perks?|match(?:ing)?|credits?)\b|\b401\s?\(?k/i;
/** Words beside a figure that say it is pay. */
const SALARY = /\b(?:salary|salaries|base|comp|compensation|pay|paying|pays|ote|range|tc)\b/i;
/** Where the words beside a figure stop: a clause break or a joining word ("$170k + equity"). */
const BREAK = /[;,.()|\n•+&]|\b(?:plus|and|with)\b/gi;
const WORDS = 3;
const MIN_YEARLY = 20_000;
const MAX_YEARLY = 1_000_000;

const value = (digits: string, k: string | undefined) => {
  const n = /^\d{1,3}(?:[,.]\d{3})+$/.test(digits)
    ? Number(digits.replace(/[,.]/g, ''))
    : Number(digits);
  return k ? n * 1000 : n;
};

const words = (s: string) => s.trim().split(/\s+/);

/** Up to three words after a figure, up to the first clause break. */
function wordsAfter(rest: string): string {
  const stop = [...rest.matchAll(BREAK)][0];
  return words(stop ? rest.slice(0, stop.index) : rest)
    .slice(0, WORDS)
    .join(' ');
}

/** Up to three words before a figure, back to the last clause break. */
function wordsBefore(head: string): string {
  const stop = [...head.matchAll(BREAK)].pop();
  return words(stop ? head.slice((stop.index ?? 0) + stop[0].length) : head)
    .slice(-WORDS)
    .join(' ');
}

/** The one currency a figure names: a code or a lettered dollar wins over a bare "$"; two that
 *  disagree name none. */
function currencyOf(
  syms: (string | undefined)[],
  prefixes: (string | undefined)[],
  codes: (string | undefined)[],
): string {
  const named = new Set<string>(codes.filter((c): c is string => !!c));
  let bareDollar = false;
  syms.forEach((sym, i) => {
    const prefix = prefixes[i];
    if (!sym) return;
    if (sym === '$' && !prefix) bareDollar = true;
    else named.add(sym === '$' ? DOLLAR[prefix!] : SYMBOL[sym]);
  });
  if (named.size > 1) return '';
  if (named.size === 1) return [...named][0];
  return bareDollar ? 'USD' : '';
}

interface Figure extends Pay {
  /** A range, or a figure beside a salary word. */
  preferred: boolean;
}

/** The post's yearly pay, or null when it states none this can read with confidence. */
export function parseHnPay(text: string): Pay | null {
  const figures: Figure[] = [];
  for (const m of text.matchAll(PAY)) {
    const [whole, pre1, sym1, code1, n1, k1, pre2, sym2, code2, n2, k2, codeAfter] = m;
    const currency = currencyOf([sym1, sym2], [pre1, pre2], [code1, code2, codeAfter]);
    if (!currency) continue;
    const start = m.index ?? 0;
    const rest = text.slice(start + whole.length);
    if (RATE.test(rest)) continue;
    // "180-220K": the k on the top figure counts for the bottom one too.
    let lo = value(n1, k1 ?? (n2 && !k1 && k2 && Number(n1) < 1000 ? k2 : undefined));
    let hi = n2 ? value(n2, k2) : lo;
    if (lo > hi) [lo, hi] = [hi, lo];
    if (lo < MIN_YEARLY || hi > MAX_YEARLY) continue;
    const beside = `${wordsBefore(text.slice(0, start))} ${wordsAfter(rest)}`;
    if (NOT_BASE.test(beside)) continue;
    figures.push({
      salaryMin: lo,
      salaryMax: hi,
      currency,
      preferred: !!n2 || SALARY.test(beside),
    });
  }
  const preferred = figures.filter((f) => f.preferred);
  const pick = preferred.length ? preferred : figures;
  if (!pick.length || new Set(pick.map((f) => f.currency)).size > 1) return null;
  return {
    salaryMin: Math.min(...pick.map((f) => f.salaryMin)),
    salaryMax: Math.max(...pick.map((f) => f.salaryMax)),
    currency: pick[0].currency,
  };
}

// Yearly pay from the free text of a Hacker News "Who is hiring?" post (#576 item 4). HN posts
// carry pay as prose: "$180k–220k", "180-220K USD", "€90k", "£70,000 - £85,000 + equity",
// "$200k OTE". This reads the first figure or range that names a currency (a symbol or a code), so
// a bare "401k", a "10k users" or a year never counts. It keeps only yearly pay: an hourly or
// daily rate, a figure under 20k or over 1M (funding, "$5M ARR") is skipped. Pure.

export interface Pay {
  salaryMin: number;
  salaryMax: number;
  currency: string;
}

const SYMBOL: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };
const CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK'];
const CODE = `(?:${CODES.join('|')})`;
const PRE = `(?:(?:US|CA|AU)?([$€£])|(${CODE})\\s?)`;
const NUM = `(\\d{1,3}(?:[,.]\\d{3})+|\\d{1,7}(?:\\.\\d+)?)\\s?([kK])?`;
const SEP = `\\s?(?:-|–|—|to)\\s?`;
const PAY = new RegExp(
  `(?<![\\w$€£.,])${PRE}?${NUM}(?:${SEP}${PRE}?${NUM})?(?:\\s?(${CODE})\\b)?`,
  'g',
);
/** Words right after a figure that make it a rate, not a yearly salary. */
const RATE = /^\s*(?:\/|per\s+|an?\s+)?\s*(?:h|hr|hrs|hour|hourly|day|daily|d|wk|week|month|mo)\b/i;
const MIN_YEARLY = 20_000;
const MAX_YEARLY = 1_000_000;

const value = (digits: string, k: string | undefined) => {
  const n = /^\d{1,3}(?:[,.]\d{3})+$/.test(digits)
    ? Number(digits.replace(/[,.]/g, ''))
    : Number(digits);
  return k ? n * 1000 : n;
};

/** The post's yearly pay, or null when it states none this can read. */
export function parseHnPay(text: string): Pay | null {
  for (const m of text.matchAll(PAY)) {
    const [whole, sym1, code1, n1, k1, sym2, code2, n2, k2, codeAfter] = m;
    const currency =
      (sym1 && SYMBOL[sym1]) || code1 || (sym2 && SYMBOL[sym2]) || code2 || codeAfter || '';
    if (!currency) continue;
    if (RATE.test(text.slice((m.index ?? 0) + whole.length))) continue;
    // "180-220K": the k on the top figure counts for the bottom one too.
    let lo = value(n1, k1 ?? (n2 && !k1 && k2 && Number(n1) < 1000 ? k2 : undefined));
    let hi = n2 ? value(n2, k2) : lo;
    if (lo > hi) [lo, hi] = [hi, lo];
    if (lo < MIN_YEARLY || hi > MAX_YEARLY) continue;
    return { salaryMin: lo, salaryMax: hi, currency };
  }
  return null;
}

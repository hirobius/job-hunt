// YC companies hiring now, as auto-scan's lead source reads them (feed/autoScan.ts): the YC
// mirror's list, matched to the profile's terms as phrases. No new hosts: the YC mirror is already
// in CSP.
import { termRegex } from './match';
import { parseYcCompany, YC_BASE, type YcCompany } from './yc';

/** The YC mirror's companies hiring now (the same file the company type-ahead reads). */
export const YC_HIRING_URL = `${YC_BASE}companies/hiring.json`;
/** YC companies probed per run: each is up to a few ATS lookups. */
export const MAX_YC = 15;

/** YC companies hiring now whose one-liner, tags or industries mention one of the terms as a
 *  phrase ("design system", not "design" alone), at most `limit`. */
export function ycMatches(body: unknown, terms: string[], limit = MAX_YC): YcCompany[] {
  const res = terms.map(termRegex).filter((r): r is RegExp => !!r);
  if (!res.length || !Array.isArray(body)) return [];
  const out: YcCompany[] = [];
  const seen = new Set<string>();
  for (const raw of body) {
    const c = parseYcCompany(raw);
    if (!c || seen.has(c.name.toLowerCase())) continue;
    const text = [c.oneLiner, ...c.tags, ...c.industries].join(' | ');
    if (!res.some((r) => r.test(text))) continue;
    seen.add(c.name.toLowerCase());
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

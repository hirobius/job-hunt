// The board probe's identity check (#417): a slug that answers is not proof the board is the
// company's. "Forward" (a YC company) matched three strangers' boards (Greenhouse, SmartRecruiters
// and Personio), because every live board under a candidate slug counted as a hit. The auto-scan
// watches what it finds with no review step, so it only trusts a hit this check confirms:
//
// - a board given outright (a pasted board link) is the company's;
// - more than one ATS answering for the same company is a common-word slug: unconfirmed;
// - one hit is confirmed only when the company's known website confirms the slug: its domain's
//   name (`acme` of `careers.acme.com`, `acme` of `acme.co.uk`) is the slug or the company's name
//   run together. No website, no confirmation.
//
// Unconfirmed boards are shown for the user to Follow or Ignore and are never read into Review on
// their own. Pure.
import type { BoardHit } from './probe';
import type { Board } from './sources/ats';

export interface IdentityInput {
  name: string;
  /** The company's own website, when the lead names one (YC, a GitHub org, Adele's site). */
  website?: string;
  hits: BoardHit[];
  /** The board was given outright (a pasted board link), not guessed from the name. */
  given?: boolean;
}

export interface IdentityResult {
  board: Board;
  jobs?: number;
  confirmed: boolean;
}

const alnum = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

/** The name part of a website's domain: `acme` for `https://careers.acme.com/x`, `acme.co.uk` and
 *  `www.acme.io`. Empty when it isn't a web address. */
export function domainStem(website: string | undefined): string {
  if (!website) return '';
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname;
  } catch {
    return '';
  }
  const parts = host.toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return '';
  // `acme.co.uk`, `acme.com.au`: a two-letter country code under a short second level.
  const n = parts.length;
  const cc = n >= 3 && parts[n - 1].length === 2 && parts[n - 2].length <= 3;
  return alnum(parts[n - (cc ? 3 : 2)]);
}

/** The company's board, and whether the check trusts it. Null when the probe found none. */
export function confirmBoard({ name, website, hits, given }: IdentityInput): IdentityResult | null {
  if (!hits.length) return null;
  const first = hits[0];
  const out = (confirmed: boolean): IdentityResult => ({
    board: first.board,
    ...(first.jobs !== undefined && { jobs: first.jobs }),
    confirmed,
  });
  if (given) return out(true);
  if (new Set(hits.map((h) => h.board.kind)).size > 1) return out(false);
  const stem = domainStem(website);
  if (!stem) return out(false);
  return out(stem === alnum(first.board.slug) || stem === alnum(name));
}

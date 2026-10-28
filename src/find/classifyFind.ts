// The Find box's reading of one pasted line (Simplify 3/9, #384; docs/specs/simplify.html §7):
// a job link (a posting: saved as a Job), a board link (a company board on one of the eight
// systems feed/sources/ats.ts reads: watched), a company (a name, or a bare company site: looked
// up through the board probe), or search words (a title: added to the track's titles). Pure and
// table-tested; what each reading does lives in FindBox.tsx, through the existing actions.
import { canonicalBoardUrl, parseBoardUrl, type Board } from '../feed/sources/ats';

export type FindResult =
  | { kind: 'empty' }
  | { kind: 'job'; url: string }
  | { kind: 'board'; board: Board }
  | { kind: 'company'; name: string }
  | { kind: 'words'; words: string };
export type FindKind = FindResult['kind'];

/** Words that make a line a job title rather than a company name. Whole words, any case. */
const ROLE_WORDS =
  /\b(designer|engineer|engineering|developer|programmer|manager|director|lead|head|architect|analyst|consultant|specialist|technician|technologist|scientist|researcher|writer|strategist|administrator|coordinator|associate|intern|apprentice|apprenticeship|welder|welding|machinist|fabricator|fabrication|operator|electrician|plumber|carpenter|mechanic|installer|estimator|inspector|foreman|supervisor|assistant|representative|recruiter|accountant|nurse|teacher|tutor|vp|cto|ceo|ux|ui|frontend|front-end|backend|back-end|fullstack|full-stack|design system|design systems)\b/i;

/** No spaces, a dot between labels, optional path: a link even without its scheme. */
const BARE_LINK = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

function toUrl(text: string): URL | null {
  const hasScheme = /^https?:\/\//i.test(text);
  if (!hasScheme && !BARE_LINK.test(text)) return null;
  try {
    return new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return null;
  }
}

const segments = (path: string) => path.split('/').filter(Boolean);

/** A board URL that points past the board, at one posting on it. */
function isPosting(u: URL, board: Board): boolean {
  const seg = segments(u.pathname);
  if (board.kind === 'greenhouse') {
    if (u.hostname.toLowerCase() === 'boards-api.greenhouse.io') {
      const i = seg.indexOf('jobs');
      return i >= 0 && !!seg[i + 1];
    }
    if (seg[0] === 'embed') return seg[1] === 'job_app';
  }
  // Deeper than the board's own page (canonicalBoardUrl) is a posting on it.
  return seg.length > segments(new URL(canonicalBoardUrl(board)).pathname).length;
}

export function classifyFind(input: string): FindResult {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return { kind: 'empty' };
  const u = toUrl(text);
  if (u) {
    // Greenhouse's posting id rides on a company's own careers page too.
    if (u.searchParams.has('gh_jid')) return { kind: 'job', url: text };
    const board = parseBoardUrl(text);
    if (board) return isPosting(u, board) ? { kind: 'job', url: text } : { kind: 'board', board };
    // A company's own site with no page and no query: the company, by its site's name.
    if (!segments(u.pathname).length && !u.search) {
      const labels = u.hostname
        .toLowerCase()
        .replace(/^www\./, '')
        .split('.');
      // The label before the suffix: figma.com → figma, acme.co.uk → acme.
      const short =
        labels.length > 2 && /^(co|com|org|net|ac|gov)$/.test(labels[labels.length - 2]);
      return { kind: 'company', name: labels[Math.max(0, labels.length - (short ? 3 : 2))] };
    }
    return { kind: 'job', url: text };
  }
  return ROLE_WORDS.test(text) ? { kind: 'words', words: text } : { kind: 'company', name: text };
}

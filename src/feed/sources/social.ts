// Shared rules for the social sources (Bluesky, Mastodon, Reddit): a post is free text, not a job
// record, so these decide whether it is someone hiring (not someone looking for work) and turn its
// text into a title. Pure and table-tested in social.test.ts.
import { matchTerm } from '../match';
import type { Posting } from '../types';

/** Someone offering a job: "We're hiring", "#hiring", "[Hiring]", "open role", "join our team". */
const HIRING_RE =
  /(?:^|[^\w#])(?:#?hiring|#?nowhiring|#?jobopening|#getfedihired|job opening|open (?:role|position)s?|we(?:'|’)?re looking for an?\b|join (?:our|the) team|apply (?:here|now|at)\b|is looking for an?\b)/i;
/** Someone looking for work (the other half of every hiring tag): never a posting. */
const SEEKING_RE =
  /(?:^|[^\w#])(?:\[for hire\]|#?opentowork|#?forhire\b|open to work|looking for (?:work|a (?:new )?(?:job|role|position))|seeking (?:work|a (?:new )?(?:job|role|position))|hire me\b)/i;

/** True when the post reads as an employer hiring, not a person looking for work. */
export function isHiringPost(text: string): boolean {
  return HIRING_RE.test(text) && !SEEKING_RE.test(text);
}

const TITLE_MAX = 120;

/** The first line with words in it, links dropped and hashtags trimmed off both its ends, cut on
 *  a word at 120. A line of hashtags only ("#hiring #designsystems") is skipped. */
export function postTitle(text: string): string {
  const clean =
    text
      .split('\n')
      .map((l) =>
        l
          .replace(/https?:\/\/\S+/g, '')
          .replace(/^(?:\s*#\w+)+\s*/, '')
          .replace(/(?:\s*#\w+)+\s*$/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .find(Boolean) ?? '';
  if (clean.length <= TITLE_MAX) return clean;
  const cut = clean.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(' ');
  return `${space > 60 ? cut.slice(0, space) : cut}…`;
}

/** "design systems" → "designsystems": the hashtag a term is written as. Null when it has no
 *  letters or runs past three words (a long phrase is never a tag). */
export function termTag(term: string): string | null {
  const words = term
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!words.length || words.length > 3) return null;
  const tag = words.join('').replace(/[^a-z0-9]/g, '');
  return /[a-z]/.test(tag) ? tag : null;
}

/** The hashtags a term may be written as, singular and plural: "design systems" →
 *  designsystems, designsystem. Empty when the term has no tag (termTag). */
export function termTags(term: string): string[] {
  const tag = termTag(term);
  if (!tag) return [];
  return [tag, tag.endsWith('s') ? tag.slice(0, -1) : `${tag}s`];
}

/** The hashtags written in a post's text, lower-cased ("#DesignSystems" → designsystems). */
export function hashtagsIn(text: string): string[] {
  return [...text.matchAll(/(?<![\w#])#(\w+)/g)].map((m) => m[1].toLowerCase());
}

/** A social post is a posting for the term only when it says the term as a phrase (match.ts) or
 *  carries its hashtag (#DesignSystems, which the phrase rule never reads). Applied in the source:
 *  a scored track ranks every posting with no term gate, so the general #hiring / #jobs timelines
 *  would otherwise flood it. */
export function postMatchesTerm(p: Posting, tags: string[], term: string): boolean {
  const want = termTags(term);
  const have = [...tags.map((t) => t.toLowerCase()), ...hashtagsIn(p.text)];
  return want.some((t) => have.includes(t)) || !!matchTerm(p, term);
}

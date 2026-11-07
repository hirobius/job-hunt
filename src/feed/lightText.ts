// A Greenhouse posting's description, from its single-job endpoint (2026-11-07): a phone reads
// board lists without descriptions (lightBoards.ts), so the postings that can be listed get theirs
// read one by one, and the Feed ranks them exactly as it ranks a full read (#498 review). Also what
// an opened posting with no text uses (postingText.ts). Pure over an injected fetch.
import { greenhouseJobUrl } from './sources/ats';
import { decodeEntities, htmlToText } from './html';
import type { FetchJson } from './sources/http';
import type { Posting } from './types';

/** The Greenhouse board slug and job id a posting id names (`greenhouse:<slug>:<id>`), or null. */
export function greenhouseRef(id: string): { slug: string; job: string } | null {
  const m = /^greenhouse:([^:]+):([^:]+)$/.exec(id);
  return m ? { slug: m[1], job: m[2] } : null;
}

/** One Greenhouse job's text, '' when it is not a Greenhouse posting or can't be read. */
export async function greenhouseText(id: string, fetchJson: FetchJson): Promise<string> {
  const ref = greenhouseRef(id);
  if (!ref) return '';
  try {
    const body = (await fetchJson(greenhouseJobUrl(ref.slug, ref.job))) as { content?: unknown };
    return typeof body?.content === 'string' ? htmlToText(decodeEntities(body.content)) : '';
  } catch {
    return '';
  }
}

/** At most this many descriptions read per board on a light read (a board of design-system roles is
 *  a handful; the rest are never listed). */
export const MAX_TEXTS_PER_BOARD = 25;

/** Each posting `wanted` with no text gets its Greenhouse description (the rest as they are). */
export async function fillTexts(
  postings: Posting[],
  fetchJson: FetchJson,
  wanted: (p: Posting) => boolean,
  max = MAX_TEXTS_PER_BOARD,
): Promise<Posting[]> {
  const todo = new Set(
    postings
      .filter((p) => !p.text.trim() && greenhouseRef(p.id) && wanted(p))
      .slice(0, max)
      .map((p) => p.id),
  );
  if (!todo.size) return postings;
  const texts = new Map(
    await Promise.all(
      [...todo].map(async (id) => [id, await greenhouseText(id, fetchJson)] as const),
    ),
  );
  return postings.map((p) => (texts.get(p.id) ? { ...p, text: texts.get(p.id)! } : p));
}

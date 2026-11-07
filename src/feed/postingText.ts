// A posting's text, fetched when it is opened (2026-11-07): a phone reads Greenhouse boards without
// descriptions (lightBoards.ts), and the server's rows carry none (postingReader.ts), so a posting
// opened in Find may have no text yet. Greenhouse's single-job endpoint has it; other sources keep
// what they read (most list theirs anyway). Read once per page load, through the shared fetcher.
import { useEffect, useState } from 'react';
import { greenhouseRef, greenhouseText } from './lightText';
import { liveFetchJson } from './fetchFeed';
import type { FetchJson } from './sources/http';
import type { Posting } from './types';

const cache = new Map<string, string>();

/** The posting's text: its own when it has some, else Greenhouse's single job (empty when it can't
 *  be read). */
export async function loadPostingText(
  p: Pick<Posting, 'id' | 'text'>,
  fetchJson: FetchJson = liveFetchJson,
): Promise<string> {
  if (p.text.trim()) return p.text;
  const hit = cache.get(p.id);
  if (hit !== undefined) return hit;
  const text = await greenhouseText(p.id, fetchJson);
  if (text) cache.set(p.id, text);
  return text;
}

/** The text for an opened posting: what it has at once, the fetched text once it lands. */
export function usePostingText(p: Pick<Posting, 'id' | 'text'> | null): {
  text: string;
  loading: boolean;
} {
  const own = p?.text.trim() ? p.text : '';
  const [fetched, setFetched] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!p || own) return;
    let live = true;
    void loadPostingText(p).then((text) => live && setFetched({ id: p.id, text }));
    return () => {
      live = false;
    };
  }, [p?.id, own]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return { text: '', loading: false };
  if (own) return { text: own, loading: false };
  return fetched?.id === p.id
    ? { text: fetched.text, loading: false }
    : { text: '', loading: !!greenhouseRef(p.id) };
}

/** Tests: forget the fetched texts. */
export const resetPostingTexts = () => cache.clear();

export { greenhouseRef };

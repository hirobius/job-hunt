// A posting's FULL description for Find's detail (2026-11-13): the source's own HTML where its board
// API has one, so headings and lists survive and nothing is cut. The text a posting carries may be a
// cut (the auto-scan keeps 1500 characters, `TEXT_MAX`; the server's rows carry a match_text window;
// a phone's light read has none), so the detail reads the source again:
//   Greenhouse: the single-job endpoint (lightText.ts's, `content`, escaped once more).
//   Lever: the single-posting endpoint (description + each list + additional).
//   Ashby: the board's list (no single-job endpoint), shared with the Feed's 1 h cache.
// Every host is one the Feed already reads (CSP connect-src, legal.ts), so nothing new is contacted.
// Other sources keep the text they hold. Read once per page load; a failed read falls back to it.
import { useEffect, useState } from 'react';
import { greenhouseJobUrl } from './sources/ats';
import { decodeEntities } from './html';
import { liveFetchJson } from './fetchFeed';
import type { FetchJson } from './sources/http';
import type { Posting } from './types';

export type PostingBody = { html: string } | { text: string };

type Ref = { kind: 'greenhouse' | 'lever' | 'ashby'; slug: string; job: string };

/** The board and job a posting id names (`<kind>:<slug>:<id>`), when its source has a full body. */
export function bodyRef(id: string): Ref | null {
  const m = /^(greenhouse|lever|ashby):([^:]+):([^:]+)$/.exec(id);
  return m ? { kind: m[1] as Ref['kind'], slug: m[2], job: m[3] } : null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const enc = encodeURIComponent;

async function readHtml(
  p: Pick<Posting, 'id' | 'url'>,
  ref: Ref,
  fetchJson: FetchJson,
): Promise<string> {
  if (ref.kind === 'greenhouse') {
    const body = (await fetchJson(greenhouseJobUrl(ref.slug, ref.job))) as { content?: unknown };
    return decodeEntities(str(body?.content));
  }
  if (ref.kind === 'lever') {
    const eu = /\/\/jobs\.eu\.lever\.co\//.test(p.url) ? '.eu' : '';
    const o = (await fetchJson(
      `https://api${eu}.lever.co/v0/postings/${enc(ref.slug)}/${enc(ref.job)}?mode=json`,
    )) as Record<string, unknown>;
    const lists = (Array.isArray(o?.lists) ? o.lists : [])
      .map((l: unknown) => l as Record<string, unknown>)
      .map((l) => `<h3>${escapeText(str(l.text))}</h3><ul>${str(l.content)}</ul>`);
    return [str(o?.description), ...lists, str(o?.additional)].join('');
  }
  const board = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${enc(ref.slug)}`,
  )) as {
    jobs?: unknown;
  };
  const job = (Array.isArray(board?.jobs) ? board.jobs : []).find(
    (j: unknown) => str((j as Record<string, unknown>)?.id) === ref.job,
  ) as Record<string, unknown> | undefined;
  return str(job?.descriptionHtml);
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cache = new Map<string, string>();

/** The posting's full body: the source's HTML when it can be read, else the text it holds. */
export async function loadPostingBody(
  p: Pick<Posting, 'id' | 'url' | 'text'>,
  fetchJson: FetchJson = liveFetchJson,
): Promise<PostingBody> {
  const ref = bodyRef(p.id);
  if (!ref) return { text: p.text };
  let html = cache.get(p.id);
  if (html === undefined) {
    try {
      html = (await readHtml(p, ref, fetchJson)).trim();
    } catch {
      html = '';
    }
    if (html) cache.set(p.id, html);
  }
  return html ? { html } : { text: p.text };
}

/** Find's detail: the full body once read. Until then `loading` (a source with a body to read),
 *  so a cut text is never shown in its place. */
export function usePostingBody(p: Pick<Posting, 'id' | 'url' | 'text'> | null): {
  body: PostingBody | null;
  loading: boolean;
} {
  const [read, setRead] = useState<{ id: string; body: PostingBody } | null>(null);
  useEffect(() => {
    if (!p || !bodyRef(p.id)) return;
    let live = true;
    void loadPostingBody(p).then((body) => live && setRead({ id: p.id, body }));
    return () => {
      live = false;
    };
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return { body: null, loading: false };
  if (!bodyRef(p.id)) return { body: { text: p.text }, loading: false };
  return read?.id === p.id ? { body: read.body, loading: false } : { body: null, loading: true };
}

/** Tests: forget the read bodies. */
export const resetPostingBodies = () => cache.clear();

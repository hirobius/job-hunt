// Remote OK's public API, read by the sync (keyless). Server only: the browser's own Remote OK
// source (feed/sources/remoteok.ts) stays off; the browser never contacts it here.
// UNVERIFIED LIVE: remoteok.com is outside the build sandbox's network; the shape is the browser
// adapter's, pinned in keyless.test.ts.
//   GET https://remoteok.com/api  →  [ { legal, last_updated }, { id, slug, url, company, position,
//        description (HTML), location, tags, date (ISO), epoch, salary_min, salary_max }, ... ]
// Terms (remoteok.com/legal and the API's own `legal` field, read 2026-10-29 via search): "link back
// (with follow, and without nofollow!) to the URL on Remote OK and mention Remote OK as a source",
// else API access is suspended; the logo needs written permission. Kept as hard behaviour: every
// row links to the job's own Remote OK `url` as given, is credited "Remote OK" (SOURCE_LABEL), and
// the logo is never stored. The terms are CHECKED ON EVERY READ: the run reads nothing and fails
// loud (a sync_log line) when the first item's `legal` no longer asks for just that
// (`remoteOkTermsOk`), so a change of terms turns this source off by itself.
// Rate limit: none published; one request on the morning run, with a User-Agent naming us.
// The whole list is remote; only design-systems roles are kept (dsRole.ts).
import { htmlToText } from '../../feed/html.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { fetchKeyed, SourceHttpError, type FeedContext } from './context.ts';
import { USER_AGENT } from './dsjobsCatalog.ts';
import { isDsRole } from './dsRole.ts';

export const REMOTEOK_URL = 'https://remoteok.com/api';

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

/** The API's legal notice still asks for a link back and credit, and nothing we don't do. */
export function remoteOkTermsOk(json: unknown): boolean {
  if (!Array.isArray(json)) return false;
  const legal = str(obj(json[0]).legal).toLowerCase();
  return (
    /link back/.test(legal) && /remote ?ok/.test(legal) && !/(paid|partner|licen[cs]e)/.test(legal)
  );
}

export function parseRemoteOk(json: unknown): NormalizedPosting[] {
  if (!Array.isArray(json)) return [];
  const out: NormalizedPosting[] = [];
  for (const raw of json) {
    const j = obj(raw);
    if ('legal' in j) continue;
    const id = str(j.id);
    const title = htmlToText(str(j.position));
    const url = httpUrl(str(j.url));
    if (!id || !title || !url) continue;
    const tags = Array.isArray(j.tags) ? j.tags.map(str).filter(Boolean) : [];
    const text = htmlToText(str(j.description));
    if (!isDsRole(title, `${text} ${tags.join(' ')}`)) continue;
    const posted = Date.parse(str(j.date));
    out.push({
      source: 'remoteok',
      sourceId: `remoteok:${id}`,
      title,
      company: htmlToText(str(j.company)),
      location: str(j.location) || undefined,
      remote: true,
      url,
      descriptionText: text,
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
    });
  }
  return out;
}

export async function readRemoteOk(ctx: FeedContext): Promise<NormalizedPosting[]> {
  const r = await fetchKeyed(ctx, 'Remote OK', REMOTEOK_URL, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!r.ok) throw new SourceHttpError('Remote OK', r.status);
  const json = await r.json();
  if (!remoteOkTermsOk(json))
    throw new Error(
      'Remote OK: its API terms changed (the legal notice no longer asks only for a link back); read https://remoteok.com/api before reading it again',
    );
  return parseRemoteOk(json);
}

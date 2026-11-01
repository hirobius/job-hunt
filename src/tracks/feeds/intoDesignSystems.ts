// Into Design Systems jobs (jobs.intodesignsystems.com; docs/research/ds-job-sources.md, source
// 3): the largest curated design-systems list (225–259 roles, its Sept 2026 report). Server only;
// OFF (SOURCE_ENABLED.ids) until its operator says yes: the research doc's gate is "email the
// operator asking to read the job board from a server for a personal tracker, with a link back on
// every row; build only on a yes". This adapter is ready for that yes and reads nothing before it.
// UNVERIFIED LIVE: the host did not answer from the build sandbox, so the MCP tool names and result
// shapes are not known. The read finds them instead of guessing one name: `tools/list`, then the
// tool whose name says search (jobs/postings first), called with the design-systems phrase on its
// string query argument; postings are read from its structured or JSON text result by common field
// names. Pin the real shapes in intoDesignSystems.test.ts on the first live call.
//   POST https://jobs.intodesignsystems.com/mcp   (MCP streamable HTTP, JSON-RPC 2.0)
//   initialize → notifications/initialized → tools/list → tools/call
// Terms: not reachable from here; the MCP is keyless and read-only. Each row links to the posting
// as the board gives it and is credited "Into Design Systems" (SOURCE_LABEL.ids).
// Rate limit: unknown; one search a day on the morning run, four requests in all.
import { htmlToText } from '../../feed/html.ts';
import { inferMode } from '../../feed/mode.ts';
import { BRAND } from '../../brand.ts';
import { httpUrl } from '../../httpUrl.ts';
import type { NormalizedPosting } from '../score.ts';
import { SourceHttpError, type FeedContext } from './context.ts';

export const IDS_MCP = 'https://jobs.intodesignsystems.com/mcp';
export const IDS_QUERY = 'design system';
const PROTOCOL = '2025-06-18';

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
const first = (o: O, keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    if (obj(v).name) return str(obj(v).name);
  }
  return '';
};

/** A JSON-RPC answer from a JSON body or an SSE stream (`data:` lines), matched by id. */
export function rpcResult(body: string, id: number): O {
  const candidates = body.trimStart().startsWith('{')
    ? [body]
    : body
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
  for (const c of candidates) {
    let msg: O;
    try {
      msg = obj(JSON.parse(c));
    } catch {
      continue;
    }
    if (msg.id !== id) continue;
    if (msg.error)
      throw new Error(`Into Design Systems: ${str(obj(msg.error).message) || 'error'}`);
    return obj(msg.result);
  }
  throw new Error('Into Design Systems: no answer');
}

/** The search tool and its arguments, or null when the server offers none. */
export function pickSearch(tools: unknown): { name: string; args: O } | null {
  const list = (Array.isArray(tools) ? tools : []).map(obj).filter((t) => str(t.name));
  const score = (n: string) =>
    /search/i.test(n)
      ? /job|posting|role/i.test(n)
        ? 2
        : 1
      : /list.*(job|posting)/i.test(n)
        ? 1
        : 0;
  const tool = list
    .filter((t) => score(str(t.name)) > 0)
    .sort((a, b) => score(str(b.name)) - score(str(a.name)))[0];
  if (!tool) return null;
  const props = obj(obj(tool.inputSchema).properties);
  const args: O = {};
  const q = ['query', 'q', 'search', 'keywords', 'keyword', 'term', 'text'].find(
    (k) => obj(props[k]).type === 'string' || (k in props && !obj(props[k]).type),
  );
  if (q) args[q] = IDS_QUERY;
  if (obj(props.remote).type === 'boolean') args.remote = true;
  for (const k of ['limit', 'per_page', 'pageSize'])
    if (obj(props[k]).type === 'number' || obj(props[k]).type === 'integer') args[k] = 100;
  return { name: str(tool.name), args };
}

/** The posting objects in a tool result: structured content, else the first text part as JSON. */
function rowsOf(result: O): O[] {
  const fromText = (Array.isArray(result.content) ? result.content : [])
    .map(obj)
    .filter((c) => c.type === 'text')
    .map((c) => {
      try {
        return JSON.parse(str(c.text)) as unknown;
      } catch {
        return undefined;
      }
    })
    .find((v) => v !== undefined);
  for (const data of [result.structuredContent, fromText]) {
    if (Array.isArray(data)) return data.map(obj);
    const o = obj(data);
    for (const k of ['jobs', 'postings', 'results', 'items', 'data'])
      if (Array.isArray(o[k])) return (o[k] as unknown[]).map(obj);
  }
  return [];
}

export function parseIdsResult(result: O): NormalizedPosting[] {
  const out: NormalizedPosting[] = [];
  const seen = new Set<string>();
  for (const j of rowsOf(result)) {
    const title = htmlToText(first(j, ['title', 'job_title', 'jobTitle', 'role', 'name']));
    const url = httpUrl(first(j, ['url', 'link', 'job_url', 'jobUrl', 'apply_url', 'applyUrl']));
    if (!title || !url) continue;
    const id = first(j, ['id', 'slug', 'uuid']) || url;
    if (seen.has(id)) continue;
    seen.add(id);
    const location = htmlToText(first(j, ['location', 'locations', 'city', 'country']));
    const workplace = first(j, ['workplace', 'workplace_type', 'workplaceType', 'remote_type']);
    const posted = Date.parse(
      first(j, ['posted_at', 'postedAt', 'published_at', 'publishedAt', 'date', 'created_at']),
    );
    out.push({
      source: 'ids',
      sourceId: `ids:${id}`,
      title,
      company: htmlToText(first(j, ['company', 'company_name', 'companyName', 'organization'])),
      location: location || undefined,
      remote: j.remote === true || inferMode(`${workplace} ${location}`) === 'remote' || undefined,
      url,
      descriptionText: htmlToText(first(j, ['description', 'summary', 'snippet'])),
      postedAt: Number.isNaN(posted) ? undefined : new Date(posted).toISOString(),
    });
  }
  return out;
}

/** One search over MCP. Throws on a refusal or an answer with no search tool. */
export async function readIntoDesignSystems(ctx: FeedContext): Promise<NormalizedPosting[]> {
  let session = '';
  let id = 0;
  const send = async (method: string, params?: O, notify = false): Promise<O> => {
    const msg = notify
      ? { jsonrpc: '2.0', method, ...(params && { params }) }
      : { jsonrpc: '2.0', id: ++id, method, ...(params && { params }) };
    const r = await ctx.fetch(IDS_MCP, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': PROTOCOL,
        ...(session && { 'mcp-session-id': session }),
      },
      body: JSON.stringify(msg),
    });
    if (!r.ok) throw new SourceHttpError('Into Design Systems', r.status);
    session = r.headers.get('mcp-session-id') ?? session;
    return notify ? {} : rpcResult(await r.text(), id);
  };
  await send('initialize', {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: BRAND.name, version: '1.0' },
  });
  await send('notifications/initialized', undefined, true);
  const search = pickSearch((await send('tools/list')).tools);
  if (!search) throw new Error('Into Design Systems: no search tool');
  return parseIdsResult(await send('tools/call', { name: search.name, arguments: search.args }));
}

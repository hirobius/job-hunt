// Vercel Edge function: turn a job link (or pasted text) into a structured job
// entry using Claude Haiku, forcing a single structured tool call.
//
// Env: ANTHROPIC_API_KEY (server-side only — never shipped to the client).
// Without it the function returns `not_configured` and the app stays usable.
import Anthropic from '@anthropic-ai/sdk';
import {
  JOB_TOOL,
  SYSTEM_PROMPT,
  buildUserPrompt,
  htmlToText,
  isAllowedUrl,
  clampJd,
  type ExtractedJob,
} from '../src/ai/extract-core';

export const config = { runtime: 'edge' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(
      {
        error: 'not_configured',
        message: 'AI is not configured — set ANTHROPIC_API_KEY in Vercel.',
      },
      503,
    );
  }

  let payload: { url?: string; text?: string; skills?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const skills = (payload.skills ?? '').slice(0, 4000);

  // 1) Resolve the job-description text — from pasted text, or by fetching the link.
  let jd = (payload.text ?? '').trim();
  let source: 'text' | 'link' = 'text';
  if (!jd && payload.url) {
    source = 'link';
    if (!isAllowedUrl(payload.url)) return json({ error: 'bad_url' }, 400);
    try {
      const res = await fetch(payload.url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApplyBoard/1.0)', accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !(ct.includes('text/html') || ct.includes('text/plain'))) {
        return json({ error: 'fetch_failed', fallback: 'paste' });
      }
      jd = htmlToText((await res.text()).slice(0, 400_000));
    } catch {
      return json({ error: 'fetch_failed', fallback: 'paste' });
    }
  }

  if (!jd || jd.length < 80) {
    return json({
      error: 'thin_content',
      fallback: 'paste',
      message: "Couldn't read enough from that link — paste the description instead.",
    });
  }

  // 2) Extract with Claude, forcing one structured `save_job` tool call.
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  try {
    const msg = await client.messages.create(
      {
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [JOB_TOOL],
        tool_choice: { type: 'tool', name: JOB_TOOL.name },
        messages: [{ role: 'user', content: buildUserPrompt(clampJd(jd), skills) }],
      },
      { timeout: 20_000 },
    );
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') return json({ error: 'no_extraction' }, 502);
    return json({ ok: true, source, job: block.input as ExtractedJob });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401)
      return json({ error: 'auth', message: 'ANTHROPIC_API_KEY was rejected.' }, 502);
    if (status === 429) return json({ error: 'rate_limited' }, 429);
    return json({ error: 'ai_error', fallback: 'paste' }, 502);
  }
}

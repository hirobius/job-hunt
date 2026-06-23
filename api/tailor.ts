// Vercel serverless function (Node.js runtime): tailor an existing résumé to a
// target role using Claude, forcing a single structured tool call so the OUTPUT
// is grounded data we lay out ourselves (clean formatting, no fabrication).
//
// Runs on Node (not Edge) for the same reason as api/extract.ts — the Anthropic
// SDK references node:fs / node:path, which the Edge bundler rejects. maxDuration
// is raised in vercel.json to cover the model round-trip.
//
// Model: claude-opus-4-8 (strong instruction-following defends against the two
// classic résumé-rewrite failure modes: invented facts and messy formatting).
// Forced tool_choice + no `thinking` => the response is always the structured
// tool call, never stray prose. Env: ANTHROPIC_API_KEY (server-side only).
import Anthropic from '@anthropic-ai/sdk';
import {
  RESUME_TOOL,
  TAILOR_SYSTEM_PROMPT,
  buildTailorPrompt,
  clampResume,
  type TailoredResume,
} from '../src/ai/tailor-core';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function handler(req: Request): Promise<Response> {
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

  let payload: { resume?: string; job?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const resume = (payload.resume ?? '').trim();
  const jobContext = (payload.job ?? '').slice(0, 6000);
  if (resume.length < 120) {
    return json(
      {
        error: 'thin_resume',
        message: 'Add your résumé text first (a little more detail needed).',
      },
      400,
    );
  }

  // maxRetries 0 so a slow call can't blow past Vercel's maxDuration; timeout < it.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  try {
    const msg = await client.messages.create(
      {
        model: 'claude-opus-4-8',
        max_tokens: 4096,
        system: TAILOR_SYSTEM_PROMPT,
        tools: [RESUME_TOOL],
        tool_choice: { type: 'tool', name: RESUME_TOOL.name },
        messages: [{ role: 'user', content: buildTailorPrompt(clampResume(resume), jobContext) }],
      },
      { timeout: 50_000 },
    );
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') return json({ error: 'no_result' }, 502);
    return json({ ok: true, tailored: block.input as TailoredResume });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401)
      return json({ error: 'auth', message: 'ANTHROPIC_API_KEY was rejected.' }, 502);
    if (status === 429) return json({ error: 'rate_limited' }, 429);
    return json({ error: 'ai_error', message: 'The tailorer failed — try again.' }, 502);
  }
}

// Vercel Node.js runtime: web-standard handler exposed via the `fetch` export.
export default { fetch: handler };

// Vercel serverless function (Node.js runtime): AI drafting for Documents (#232, ADR 0009).
// The only place the Anthropic key lives. The logic is src/aiDraft/server.ts (tested with every
// dependency stubbed); this file wires the real ones: Supabase (verify the user's token, hold the
// monthly cap in the server-only ai_draft_usage table) and the Anthropic SDK.
//
// Env (Vercel → Settings → Environment Variables; never in the client or the repo):
//   ANTHROPIC_API_KEY          required
//   SUPABASE_SERVICE_ROLE_KEY  required (the cap's table is service-role only)
//   AI_MONTHLY_CAP_USD         optional, default 10
//   AI_USER_MONTHLY_CAP_USD    optional, default = the monthly cap
// With either required one missing, GET says not configured (the UI hides Draft) and POST answers
// "AI drafting is not set up".
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../src/config';
import {
  DRAFT_MODEL,
  MAX_OUTPUT_TOKENS,
  handleDraft,
  type DraftDeps,
  type ModelOutcome,
} from '../src/aiDraft/server';

const env = process.env;
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = () => createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '', NO_SESSION);
// Postgres "undefined function" / PostgREST "not found in schema cache": the migration isn't applied.
const isMissing = (e: { code?: string } | null) => e?.code === '42883' || e?.code === 'PGRST202';

const deps: DraftDeps = {
  env,
  log: (msg) => console.error(`[api/draft] ${msg}`),
  async verifyUser(token) {
    // Supabase checks the token (signature, expiry, a live session), not us.
    const { data, error } = await createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      NO_SESSION,
    ).auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },
  async reserve({ userId, capUsd, userCapUsd, estimateUsd }) {
    const { data, error } = await admin().rpc('ai_draft_reserve', {
      p_user: userId,
      p_cap: capUsd,
      p_user_cap: userCapUsd,
      p_estimate: estimateUsd,
    });
    if (isMissing(error)) return { status: 'missing' };
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
    const r = data as { status?: string; id?: string };
    if (r.status === 'ok' && r.id) return { status: 'ok', id: r.id };
    if (r.status === 'cap' || r.status === 'user_cap') return { status: r.status };
    throw new Error('unexpected reserve answer');
  },
  async settle({ id, costUsd, status, inputTokens, outputTokens, model }) {
    const { error } = await admin().rpc('ai_draft_settle', {
      p_id: Number(id),
      p_cost: costUsd,
      p_status: status,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_model: model,
    });
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
  },
  async callModel({ apiKey, system, prompt }): Promise<ModelOutcome> {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 50_000 });
    try {
      // Server-side fallback on a refusal (claude-api skill default); a fallback model is priced
      // at the ceiling rate in costOf, so the cap holds whichever model answers.
      const msg = await client.beta.messages.create({
        model: DRAFT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return {
        ok: true,
        text,
        stopReason: msg.stop_reason,
        model: msg.model,
        usage: {
          model: msg.model,
          input_tokens: msg.usage.input_tokens,
          output_tokens: msg.usage.output_tokens,
          cache_creation_input_tokens: msg.usage.cache_creation_input_tokens,
          cache_read_input_tokens: msg.usage.cache_read_input_tokens,
          iterations: msg.usage.iterations?.flatMap((u) =>
            'model' in u && typeof u.model === 'string'
              ? [{ ...u, model: u.model }]
              : [{ ...u, model: DRAFT_MODEL }],
          ),
        },
      };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError)
        return { ok: false, billed: false, detail: 'ANTHROPIC_API_KEY was rejected' };
      // A timeout or a dropped connection may have run on the provider: keep the reservation.
      if (e instanceof Anthropic.APIConnectionError)
        return { ok: false, billed: true, detail: `connection: ${e.message}` };
      if (e instanceof Anthropic.APIError)
        return { ok: false, billed: false, detail: `status ${e.status}: ${e.message}` };
      return { ok: false, billed: true, detail: String(e) };
    }
  },
};

// Vercel Node.js runtime: web-standard handler exposed via the `fetch` export.
export default { fetch: (req: Request) => handleDraft(req, deps) };

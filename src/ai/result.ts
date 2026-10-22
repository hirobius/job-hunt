// The one shape "Screen with AI" accepts back. The JSON schema is sent as response_format where
// the model supports it, but the model is never trusted to have followed it: parseScreen checks
// every field, cleans every string to plain text and clamps it, and refuses anything else.
import type { JobMode, Verdict } from '../types';
import { plainText } from './untrusted';

export const MAX_BLOCKERS = 5;
export const MAX_BLOCKER_CHARS = 80;
export const MAX_ANGLE_CHARS = 200;
/** A screen is a few hundred characters; a reply far past that is not one. */
export const MAX_REPLY_CHARS = 8_000;

export interface AiScreen {
  verdict: Verdict;
  blockers: string[];
  angle: string;
  mode?: JobMode;
}

export const SCREEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'blockers', 'angle'],
  properties: {
    verdict: { type: 'string', enum: ['match', 'stretch', 'reach'] },
    blockers: {
      type: 'array',
      maxItems: MAX_BLOCKERS,
      items: { type: 'string', maxLength: MAX_BLOCKER_CHARS },
    },
    angle: { type: 'string', maxLength: MAX_ANGLE_CHARS },
    mode: { type: 'string', enum: ['remote', 'hybrid', 'onsite'] },
  },
} as const;

const VERDICTS = new Set<string>(['match', 'stretch', 'reach']);
const MODES = new Set<string>(['remote', 'hybrid', 'onsite']);
const KEYS = new Set(['verdict', 'blockers', 'angle', 'mode']);

export type ParseResult = { ok: true; screen: AiScreen } | { ok: false; error: string };

const OFF_SCHEMA =
  'The AI’s answer wasn’t in the expected shape, so nothing was suggested. Try again or pick another model.';

/** Strict: the reply must be one JSON object (a single ```json fence is tolerated), with exactly
 *  our keys and types. Strings are cleaned and clamped, not trusted. */
export function parseScreen(reply: unknown): ParseResult {
  if (typeof reply !== 'string' || !reply.trim() || reply.length > MAX_REPLY_CHARS)
    return { ok: false, error: OFF_SCHEMA };
  const body = reply
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, error: OFF_SCHEMA };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { ok: false, error: OFF_SCHEMA };
  const o = data as Record<string, unknown>;
  if (Object.keys(o).some((k) => !KEYS.has(k))) return { ok: false, error: OFF_SCHEMA };
  if (typeof o.verdict !== 'string' || !VERDICTS.has(o.verdict))
    return { ok: false, error: OFF_SCHEMA };
  if (!Array.isArray(o.blockers) || o.blockers.some((b) => typeof b !== 'string'))
    return { ok: false, error: OFF_SCHEMA };
  if (typeof o.angle !== 'string') return { ok: false, error: OFF_SCHEMA };
  if (o.mode !== undefined && o.mode !== null && (typeof o.mode !== 'string' || !MODES.has(o.mode)))
    return { ok: false, error: OFF_SCHEMA };

  const blockers = Array.from(
    new Set((o.blockers as string[]).map((b) => plainText(b, MAX_BLOCKER_CHARS)).filter(Boolean)),
  ).slice(0, MAX_BLOCKERS);
  const screen: AiScreen = {
    verdict: o.verdict as Verdict,
    blockers,
    angle: plainText(o.angle, MAX_ANGLE_CHARS),
  };
  if (typeof o.mode === 'string') screen.mode = o.mode as JobMode;
  return { ok: true, screen };
}

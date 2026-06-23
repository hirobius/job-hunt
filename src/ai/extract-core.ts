// Pure, framework-agnostic logic for the AI job-intake feature.
// No SDK and no DOM here, so it's unit-testable and safe to import from the
// Edge function (api/extract.ts).

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  seniority: string;
  salary: string;
  requirements: string[];
  matched: string[];
  gaps: string[];
}

// The single tool we FORCE Claude to call (via tool_choice) so the response is
// always structured JSON rather than prose.
export const JOB_TOOL = {
  name: 'save_job',
  description:
    "Save the structured details extracted from a job description, plus which of the candidate's profile skills match the role and which are gaps.",
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Role title. Empty string if unknown.' },
      company: { type: 'string', description: 'Hiring company. Empty string if unknown.' },
      location: { type: 'string', description: 'Location or "Remote". Empty string if unknown.' },
      seniority: {
        type: 'string',
        description: 'Intern/Junior/Mid/Senior/Staff/Lead. Empty string if unclear.',
      },
      salary: {
        type: 'string',
        description: 'Stated salary/range, verbatim. Empty string if none.',
      },
      requirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'The 5-8 most important concrete requirements/skills the role asks for.',
      },
      matched: {
        type: 'array',
        items: { type: 'string' },
        description: 'Skills from the candidate profile that match this role. Only profile skills.',
      },
      gaps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Important role requirements NOT covered by the candidate profile.',
      },
    },
    required: [
      'title',
      'company',
      'location',
      'seniority',
      'salary',
      'requirements',
      'matched',
      'gaps',
    ],
    additionalProperties: false,
  },
};

export const SYSTEM_PROMPT =
  'You extract structured data from job descriptions for a job-application tracker. ' +
  'Use only information present in the description — never invent a company, title, salary, or requirement. ' +
  'Compare the role against the candidate skills profile: list matched skills (only those in the profile) ' +
  'and the most important gaps. Always answer by calling the save_job tool exactly once.';

export function buildUserPrompt(jd: string, skills: string): string {
  return `CANDIDATE SKILLS PROFILE:\n${skills.trim() || '(none provided)'}\n\n---\nJOB DESCRIPTION:\n${jd}`;
}

// Strip HTML to readable text — Edge-safe (no DOM/cheerio). Best-effort.
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n')
    .trim();
}

// SSRF guard: only public http(s). Blocks localhost, private/loopback/link-local
// ranges and non-http schemes. Best-effort (does not cover DNS rebinding).
export function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return false;
  }
  return true;
}

export const MAX_JD_CHARS = 24000;
export function clampJd(text: string): string {
  return text.length > MAX_JD_CHARS ? text.slice(0, MAX_JD_CHARS) : text;
}

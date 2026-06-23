// Pure, framework-agnostic logic for the résumé tailorer. No SDK/DOM here, so it
// is unit-testable and safe to import from the serverless function (api/tailor.ts).
//
// Design: the MODEL returns grounded STRUCTURE (via a forced tool call); this file
// renders that structure into clean Markdown. Layout lives in code, not in the
// model's free text — that's what keeps the output well-formatted, and the schema
// + system prompt are what keep it grounded (no invented experience).

export interface TailoredExperience {
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
}
export interface TailoredEducation {
  school: string;
  credential: string;
  dates: string;
}
export interface TailoredResume {
  name: string;
  contact: string;
  summary: string;
  skills: string[];
  experience: TailoredExperience[];
  education: TailoredEducation[];
  /** Role requirements NOT evidenced by the résumé — listed honestly, never faked. */
  unsupported: string[];
  /** One or two sentences on what was emphasized/reordered for this role. */
  emphasis: string;
}

export const RESUME_TOOL = {
  name: 'tailor_resume',
  description:
    "Return the candidate's EXISTING résumé, tailored to the target role — reordered, " +
    'rephrased, and re-emphasized — using ONLY facts present in the source résumé.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Candidate name exactly as in the source résumé. Empty string if absent.',
      },
      contact: {
        type: 'string',
        description:
          'One line of contact details that appear in the source (email, phone, location, links). Empty string if absent. Never invent.',
      },
      summary: {
        type: 'string',
        description:
          '2–3 sentence professional summary tailored to the role, grounded only in real experience.',
      },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Skills that appear in the source résumé, ordered by relevance to the role. Do not add skills the candidate does not list.',
      },
      experience: {
        type: 'array',
        description:
          'Work history from the source résumé (same employers/titles/dates), bullets rephrased and reordered for this role.',
        items: {
          type: 'object',
          properties: {
            company: { type: 'string' },
            title: { type: 'string' },
            dates: {
              type: 'string',
              description: 'As written in the source. Empty string if absent.',
            },
            location: { type: 'string', description: 'Empty string if absent.' },
            bullets: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Achievement bullets drawn ONLY from this role in the source résumé. Rephrase for impact; never invent metrics, tools, or duties.',
            },
          },
          required: ['company', 'title', 'dates', 'location', 'bullets'],
        },
      },
      education: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            school: { type: 'string' },
            credential: { type: 'string' },
            dates: { type: 'string', description: 'Empty string if absent.' },
          },
          required: ['school', 'credential', 'dates'],
        },
      },
      unsupported: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Important role requirements NOT supported by the source résumé. List them honestly here instead of fabricating experience.',
      },
      emphasis: {
        type: 'string',
        description: 'One or two sentences on what you emphasized/reordered for this role.',
      },
    },
    required: [
      'name',
      'contact',
      'summary',
      'skills',
      'experience',
      'education',
      'unsupported',
      'emphasis',
    ],
    additionalProperties: false,
  },
};

export const TAILOR_SYSTEM_PROMPT =
  'You tailor an existing résumé to a target role. You MAY select, reorder, rephrase, and ' +
  're-emphasize the candidate’s real content to fit the role. You MUST NOT invent or inflate: ' +
  'every employer, title, date, metric, achievement, skill, and credential must come from the ' +
  'SOURCE RÉSUMÉ. Do not add experience the candidate does not have. If the role needs something ' +
  'the résumé does not evidence, list it under "unsupported" rather than fabricating it. Keep ' +
  'bullets concrete, truthful, and achievement-oriented. Always answer by calling the ' +
  'tailor_resume tool exactly once.';

export function buildTailorPrompt(resume: string, jobContext: string): string {
  return `TARGET ROLE:\n${jobContext.trim() || '(no details provided)'}\n\n---\nSOURCE RÉSUMÉ (the only source of truth for facts):\n${resume.trim()}`;
}

export const MAX_RESUME_CHARS = 16000;
export function clampResume(text: string): string {
  return text.length > MAX_RESUME_CHARS ? text.slice(0, MAX_RESUME_CHARS) : text;
}

const clean = (s: string | undefined) => (s ?? '').trim();

/** Deterministic layout: the MODEL supplies grounded content; CODE owns formatting.
 *  This is what keeps the exported résumé clean and predictable. */
export function renderResumeMarkdown(t: TailoredResume): string {
  const lines: string[] = [];
  if (clean(t.name)) lines.push(`# ${clean(t.name)}`);
  if (clean(t.contact)) lines.push(clean(t.contact));
  if (clean(t.summary)) lines.push('', '## Summary', clean(t.summary));

  const skills = (t.skills ?? []).map(clean).filter(Boolean);
  if (skills.length) lines.push('', '## Skills', skills.join(' · '));

  const exp = (t.experience ?? []).filter((e) => e && (clean(e.company) || clean(e.title)));
  if (exp.length) {
    lines.push('', '## Experience');
    for (const e of exp) {
      const head = [clean(e.title), clean(e.company)].filter(Boolean).join(' — ');
      const meta = [clean(e.location), clean(e.dates)].filter(Boolean).join(' · ');
      lines.push('', `### ${head}`);
      if (meta) lines.push(`*${meta}*`);
      for (const b of (e.bullets ?? []).map(clean).filter(Boolean)) lines.push(`- ${b}`);
    }
  }

  const edu = (t.education ?? []).filter((e) => e && (clean(e.school) || clean(e.credential)));
  if (edu.length) {
    lines.push('', '## Education');
    for (const e of edu) {
      const head = [clean(e.credential), clean(e.school)].filter(Boolean).join(', ');
      const dates = clean(e.dates);
      lines.push(dates ? `- ${head} (${dates})` : `- ${head}`);
    }
  }

  return lines.join('\n').trim() + '\n';
}

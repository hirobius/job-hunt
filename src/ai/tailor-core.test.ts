import { describe, it, expect } from 'vitest';
import {
  renderResumeMarkdown,
  buildTailorPrompt,
  clampResume,
  MAX_RESUME_CHARS,
  type TailoredResume,
} from './tailor-core';

const full: TailoredResume = {
  name: 'Jane Doe',
  contact: 'jane@example.com · Spokane, WA',
  summary: 'Front-end engineer focused on design systems.',
  skills: ['React', 'TypeScript', 'Accessibility'],
  experience: [
    {
      title: 'Senior Engineer',
      company: 'Acme',
      dates: '2022–Now',
      location: 'Remote',
      bullets: ['Built the component library', 'Led the a11y program'],
    },
  ],
  education: [{ credential: 'B.S. Computer Science', school: 'WSU', dates: '2018' }],
  unsupported: ['Rust'],
  emphasis: 'Emphasized design-system and accessibility work.',
};

describe('renderResumeMarkdown', () => {
  it('renders headings, contact, skills, experience and education in order', () => {
    const md = renderResumeMarkdown(full);
    expect(md).toContain('# Jane Doe');
    expect(md).toContain('jane@example.com · Spokane, WA');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Skills');
    expect(md).toContain('React · TypeScript · Accessibility');
    expect(md).toContain('### Senior Engineer — Acme');
    expect(md).toContain('*Remote · 2022–Now*');
    expect(md).toContain('- Built the component library');
    expect(md).toContain('## Education');
    expect(md).toContain('- B.S. Computer Science, WSU (2018)');
    // 'unsupported' / 'emphasis' are guidance, not part of the rendered résumé
    expect(md).not.toContain('Rust');
  });

  it('omits empty sections and never emits trailing-space line breaks', () => {
    const md = renderResumeMarkdown({
      name: 'Sam',
      contact: '',
      summary: '',
      skills: [],
      experience: [],
      education: [],
      unsupported: [],
      emphasis: '',
    });
    expect(md.trim()).toBe('# Sam');
    expect(md).not.toMatch(/ \n/); // no trailing whitespace before newlines
  });
});

describe('buildTailorPrompt', () => {
  it('labels the source résumé as the only source of truth', () => {
    const p = buildTailorPrompt('RESUME TEXT', 'ROLE TEXT');
    expect(p).toContain('TARGET ROLE:');
    expect(p).toContain('ROLE TEXT');
    expect(p).toContain('only source of truth');
    expect(p).toContain('RESUME TEXT');
  });
});

describe('clampResume', () => {
  it('caps very long résumés', () => {
    const long = 'x'.repeat(MAX_RESUME_CHARS + 500);
    expect(clampResume(long).length).toBe(MAX_RESUME_CHARS);
    expect(clampResume('short')).toBe('short');
  });
});

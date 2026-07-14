import { describe, it, expect } from 'vitest';
import { jobTitle, composeNote } from './intake';
import type { ExtractedJob } from './extract-core';

const base: ExtractedJob = {
  title: 'Frontend Engineer',
  company: 'Acme',
  location: 'Remote',
  seniority: 'Senior',
  salary: '$160k–$190k',
  requirements: ['React', 'TypeScript'],
  matched: ['React'],
  gaps: ['Rust'],
};

describe('jobTitle', () => {
  it('joins title and company', () => {
    expect(jobTitle(base)).toBe('Frontend Engineer — Acme');
  });
  it('falls back to whichever part exists', () => {
    expect(jobTitle({ title: 'Designer', company: '' })).toBe('Designer');
    expect(jobTitle({ title: '', company: 'Acme' })).toBe('Acme');
    expect(jobTitle({ title: '', company: '' })).toBe('');
  });
});

describe('composeNote', () => {
  it('includes requirements, matches and gaps', () => {
    const note = composeNote(base);
    expect(note).toContain('Requirements:');
    expect(note).toContain('• React');
    expect(note).toContain('✓ Matches: React');
    expect(note).toContain('⚠ Gaps: Rust');
  });
  it('omits company/location/seniority (now first-class Job fields, not note prose)', () => {
    const note = composeNote(base);
    expect(note).not.toContain('Acme · Remote · Senior');
    expect(note.startsWith('Requirements:')).toBe(true);
  });
  it('omits empty sections entirely', () => {
    const note = composeNote({
      title: 'x',
      company: '',
      location: '',
      seniority: '',
      salary: '',
      requirements: [],
      matched: [],
      gaps: [],
    });
    expect(note).toBe('');
  });
});

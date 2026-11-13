import { describe, expect, it } from 'vitest';
import { NOTES_STATUS, olderNoteLine } from './notesSave';

describe('the Notes save line (Adrian 2026-11-13)', () => {
  it('says nothing before an edit, then Saving…, then Saved to this job', () => {
    expect(NOTES_STATUS).toEqual({ idle: '', saving: 'Saving…', saved: 'Saved to this job' });
  });
});

describe('the older note above Notes', () => {
  it('shows when it says something Notes does not', () => {
    expect(olderNoteLine({ note: 'Found on Remotive', notes: 'Ask about pay' })).toBe(
      'Found on Remotive',
    );
  });
  it('is left out when Notes already holds its text', () => {
    expect(olderNoteLine({ note: 'Recruiter screen', notes: 'Recruiter screen' })).toBeUndefined();
    expect(
      olderNoteLine({ note: 'Recruiter screen ', notes: 'Recruiter screen. Then a panel.' }),
    ).toBeUndefined();
  });
  it('is left out with no Notes (the field shows the older note) or no older note', () => {
    expect(olderNoteLine({ note: 'Recruiter screen' })).toBeUndefined();
    expect(olderNoteLine({ notes: 'Ask about pay' })).toBeUndefined();
  });
});

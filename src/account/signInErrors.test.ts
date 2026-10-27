import { describe, expect, it } from 'vitest';
import { emailProblem, signInErrorMessage, SIGN_IN_ERRORS } from './signInErrors';

describe('emailProblem', () => {
  it.each([
    ['', SIGN_IN_ERRORS.empty],
    ['   ', SIGN_IN_ERRORS.empty],
    ['adrian', SIGN_IN_ERRORS.invalid],
    ['a@b', SIGN_IN_ERRORS.invalid],
    ['a b@c.d', SIGN_IN_ERRORS.invalid],
    [' a@b.co ', null],
  ])('%j → %s', (input, want) => {
    expect(emailProblem(input)).toBe(want);
  });
});

describe('signInErrorMessage', () => {
  it.each([
    [{ status: 429, message: 'x' }, SIGN_IN_ERRORS.rateLimit],
    [{ code: 'over_email_send_rate_limit' }, SIGN_IN_ERRORS.rateLimit],
    [
      { message: 'For security purposes, you can only request this after 37 seconds.' },
      SIGN_IN_ERRORS.rateLimit,
    ],
    [{ message: 'Email rate limit exceeded' }, SIGN_IN_ERRORS.rateLimit],
    [
      { status: 400, message: 'Unable to validate email address: invalid format' },
      SIGN_IN_ERRORS.invalid,
    ],
    [{ message: 'Failed to fetch' }, SIGN_IN_ERRORS.offline],
    [{ status: 500, message: 'Database error saving new user' }, SIGN_IN_ERRORS.other],
  ])('%j → %s', (err, want) => {
    expect(signInErrorMessage(err)).toBe(want);
  });

  it('never repeats the service message', () => {
    expect(signInErrorMessage({ message: 'supabase: boom' })).not.toMatch(/supabase/i);
  });
});

describe('rate-limit copy (#278)', () => {
  it('names the real wait: up to an hour, never "a minute"', () => {
    // The email limit is per hour (2 on Supabase's built-in sender, 60 on Resend SMTP).
    expect(SIGN_IN_ERRORS.rateLimit).not.toMatch(/minute/i);
    expect(SIGN_IN_ERRORS.rateLimit).toMatch(/up to an hour/);
  });
});

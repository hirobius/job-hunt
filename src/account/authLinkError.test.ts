import { describe, expect, it } from 'vitest';
import {
  authLinkErrorMessage,
  EXPIRED_LINK_MSG,
  FAILED_LINK_MSG,
  GOOGLE_CANCELLED_MSG,
  GOOGLE_FAILED_MSG,
} from './authLinkError';

describe('a sign-in link that comes back with an error', () => {
  it('names an expired or used link plainly, any other refusal too, and nothing else', () => {
    expect(
      authLinkErrorMessage(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toBe(EXPIRED_LINK_MSG);
    expect(authLinkErrorMessage('#error=server_error&error_description=Database+error')).toBe(
      FAILED_LINK_MSG,
    );
    expect(authLinkErrorMessage('#access_token=a&refresh_token=b')).toBeNull();
    expect(authLinkErrorMessage('#/queue')).toBeNull();
    expect(authLinkErrorMessage('')).toBeNull();
  });
});

describe('a Google sign-in that comes back with an error (#482)', () => {
  it('says Google when this browser started one: cancelled, or any other refusal', () => {
    expect(authLinkErrorMessage('#error=access_denied&error_description=denied', '', true)).toBe(
      GOOGLE_CANCELLED_MSG,
    );
    expect(authLinkErrorMessage('#error=server_error', '', true)).toBe(GOOGLE_FAILED_MSG);
  });

  it('reads the error from the query too (an OAuth refusal can land there)', () => {
    expect(authLinkErrorMessage('#/queue', '?error=access_denied', true)).toBe(
      GOOGLE_CANCELLED_MSG,
    );
    expect(authLinkErrorMessage('', '?error=server_error&error_description=x', false)).toBe(
      FAILED_LINK_MSG,
    );
    expect(authLinkErrorMessage('', '?add=https://x.example', true)).toBeNull();
  });

  it('a magic link error keeps its own words when no Google sign-in was started', () => {
    expect(authLinkErrorMessage('#error=access_denied&error_code=otp_expired', '', false)).toBe(
      EXPIRED_LINK_MSG,
    );
  });
});

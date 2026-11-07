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
    expect(authLinkErrorMessage('#/apply')).toBeNull();
    expect(authLinkErrorMessage('')).toBeNull();
  });
});

describe('a Google sign-in that comes back with an error (#482)', () => {
  it('an error in the query (the PKCE flow) is worded for Google: cancelled, or any other', () => {
    expect(authLinkErrorMessage('#/apply', '?error=access_denied&error_description=denied')).toBe(
      GOOGLE_CANCELLED_MSG,
    );
    expect(authLinkErrorMessage('', '?error=server_error&error_description=x')).toBe(
      GOOGLE_FAILED_MSG,
    );
    expect(authLinkErrorMessage('', '?add=https://x.example')).toBeNull();
  });

  it('an error in the hash keeps the magic link words', () => {
    expect(authLinkErrorMessage('#error=access_denied&error_code=otp_expired', '?x=1')).toBe(
      EXPIRED_LINK_MSG,
    );
    expect(authLinkErrorMessage('#error=server_error', '')).toBe(FAILED_LINK_MSG);
  });
});

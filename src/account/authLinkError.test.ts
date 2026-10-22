import { describe, expect, it } from 'vitest';
import { authLinkErrorMessage, EXPIRED_LINK_MSG, FAILED_LINK_MSG } from './authLinkError';

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

// Review reads postings only for a signed-in visitor (#755): a test that needs postings on Review
// signs in at boot. `signInAtBoot` leaves a stored Supabase session, so the app builds its client
// at boot, and the fake holds the session, so the app hears INITIAL_SESSION for TEST_USER. This
// device last synced with that account, so the sign-in asks nothing about this device's data.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { createFakeSupabase } from './fakeSupabase';
import { writeDeviceAccount } from '../account/deviceAccount';

export const TEST_USER = { id: 'u-test', email: 'reviewer@example.test' }; // pii-allow: fake test address

export function signInAtBoot(fake: ReturnType<typeof createFakeSupabase>): void {
  localStorage.setItem('sb-test-auth-token', '{}');
  writeDeviceAccount(TEST_USER.id);
  fake.startSignedIn(TEST_USER);
}

/** Signed out, the sign-in screen opens over Review (#755): Continue without an account. */
export async function dismissSignIn(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Continue without an account' }));
}

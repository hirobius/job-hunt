// The sign-in path (#814 step 3) without React or supabase-js: each test drives one branch of an
// auth event, the merge question, and a link's session check.
import { describe, expect, it } from 'vitest';
import { createSignInPath, isNewToDevice, type TabState } from './signInPath';

const A = { id: 'a', email: 'a@example.test' }; // pii-allow: fake test address
const B = { id: 'b', email: 'b@example.test' }; // pii-allow: fake test address
const FREE: TabState = { frozen: false, owner: null };

describe('createSignInPath', () => {
  it('a new sign-in passes, then a repeated event for the same user is nothing new', () => {
    const p = createSignInPath();
    expect(p.step(A, FREE)).toEqual({ kind: 'signIn' });
    expect(p.owns('a')).toBe(false); // not before the guard
    expect(p.admit('a', false)).toBe('pass');
    expect(p.owns('a')).toBe(true);
    expect(p.step(A, { frozen: false, owner: 'a' })).toEqual({ kind: 'same' });
    expect(p.owns('a')).toBe(true);
  });

  it('asks before syncing an account new to this device; the answer lets it through once', () => {
    const p = createSignInPath();
    expect(p.step(A, FREE).kind).toBe('signIn');
    expect(p.admit('a', true)).toBe('ask');
    expect(p.owns('a')).toBe(false); // nothing is pulled or pushed while the question is open
    expect(p.step(A, FREE)).toEqual({ kind: 'asking' }); // a second event for the same user
    expect(p.answer('a')).toBe(true);
    expect(p.owns('a')).toBe(true);
    expect(p.answer('a')).toBe(false); // already answered
  });

  it('a stale answer does nothing: the question went with a sign-out or another user', () => {
    const p = createSignInPath();
    p.step(A, FREE);
    p.admit('a', true);
    expect(p.step(null, FREE)).toEqual({ kind: 'signedOut' });
    expect(p.answer('a')).toBe(false);
    expect(p.decline('a')).toBe(false);
    expect(p.owns('a')).toBe(false);
  });

  it('Keep this device’s data declines only the open question', () => {
    const p = createSignInPath();
    p.step(A, FREE);
    p.admit('a', true);
    expect(p.decline('b')).toBe(false);
    expect(p.decline('a')).toBe(true);
    expect(p.owns('a')).toBe(false);
  });

  it('a sign-out clears the user through the path', () => {
    const p = createSignInPath();
    p.step(A, FREE);
    p.admit('a', false);
    expect(p.step(null, FREE)).toEqual({ kind: 'signedOut' });
    expect(p.handled).toBeNull();
  });

  it('another tab signing out or in as someone else stops this tab (#288)', () => {
    const p = createSignInPath();
    const mine: TabState = { frozen: false, owner: 'a' };
    expect(p.step(B, mine)).toEqual({ kind: 'freeze', why: 'switched' });
    expect(p.step(null, mine)).toEqual({ kind: 'freeze', why: 'signedOut' });
  });

  it('a stopped tab follows no one', () => {
    const p = createSignInPath();
    expect(p.step(A, { frozen: true, owner: 'a' })).toEqual({ kind: 'frozen', uid: 'a' });
    expect(p.step(null, { frozen: true, owner: null })).toEqual({ kind: 'frozen', uid: null });
    expect(p.handled).toBeNull();
  });

  it('a link takes up only the account it named, and holds its email only while it is set', async () => {
    const p = createSignInPath();
    const owner: TabState = { frozen: false, owner: 'a' };
    await p.withLink(B.email, async () => {
      expect(p.linkEmail).toBe(B.email);
      // The tab's own link to another account: no freeze while the link is held.
      expect(p.step(A, owner)).toEqual({ kind: 'otherAccount' });
      expect(p.step(B, owner)).toEqual({ kind: 'signIn' });
    });
    expect(p.linkEmail).toBeNull();
    await expect(p.withLink(A.email, () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(p.linkEmail).toBeNull();
  });

  it('leave(): this tab’s own sign-out or Delete my data', () => {
    const p = createSignInPath();
    p.step(A, FREE);
    p.admit('a', false);
    p.leave();
    expect(p.owns('a')).toBe(false);
  });
});

describe('isNewToDevice', () => {
  it('asks only with no merge base and when the device last synced another account', () => {
    expect(isNewToDevice(false, null, 'a')).toBe(true);
    expect(isNewToDevice(false, 'b', 'a')).toBe(true);
    expect(isNewToDevice(false, 'a', 'a')).toBe(false);
    expect(isNewToDevice(true, null, 'a')).toBe(false);
  });
});

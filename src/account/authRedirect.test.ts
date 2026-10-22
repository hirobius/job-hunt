// Where a magic link may send the user back to (#44). Only this app's own origins; anything
// else falls back to production, and the path is always the root.
import { describe, expect, it } from 'vitest';
import { LEGACY_ORIGIN, PRODUCTION_ORIGIN, magicLinkRedirect } from './authRedirect';

const PROD = 'https://roleforge-app.vercel.app/';
const OLD = 'https://job-hunt-jade.vercel.app/';
const at = (origin: string, pathname = '/') => magicLinkRedirect({ origin, pathname });

describe('magicLinkRedirect', () => {
  it('production origin is the known one', () => {
    expect(PRODUCTION_ORIGIN).toBe('https://roleforge-app.vercel.app');
  });

  it('the old address is still accepted during the move', () => {
    expect(LEGACY_ORIGIN).toBe('https://job-hunt-jade.vercel.app');
  });

  it.each([
    ['https://roleforge-app.vercel.app', PROD],
    // A link opened on the old address lands back on the old address.
    ['https://job-hunt-jade.vercel.app', OLD],
    [
      'https://job-hunt-h95mo04go-adrian-6234s-projects.vercel.app',
      'https://job-hunt-h95mo04go-adrian-6234s-projects.vercel.app/',
    ],
    [
      'https://job-hunt-6rg3ibstd-adrian-6234s-projects.vercel.app',
      'https://job-hunt-6rg3ibstd-adrian-6234s-projects.vercel.app/',
    ],
    ['http://localhost:5173', 'http://localhost:5173/'],
    ['http://localhost:4173', 'http://localhost:4173/'],
    ['http://127.0.0.1:5173', 'http://127.0.0.1:5173/'],
  ])('allows %s', (origin, want) => {
    expect(at(origin)).toBe(want);
  });

  it.each([
    'https://roleforge-app.vercel.app.evil.com',
    'https://evil-roleforge-app.vercel.app',
    'http://roleforge-app.vercel.app',
    'https://roleforge-app.vercel.app:8443',
    'https://user@roleforge-app.vercel.app',
    'https://roleforge-app.vercel.app@evil.com',
    'https://evil.com#roleforge-app.vercel.app',
    'https://ROLEFORGE-APP.vercel.app.evil.com',
    'https://roleforge-app.vercel.app/',
    'https://job-hunt-jade.vercel.app.evil.com',
    'https://evil-job-hunt-jade.vercel.app',
    'https://evil.com',
    'http://job-hunt-jade.vercel.app',
    'https://job-hunt-jade.vercel.app:8443',
    'https://user@job-hunt-jade.vercel.app',
    'https://job-hunt-jade.vercel.app@evil.com',
    'https://evil.com#job-hunt-jade.vercel.app',
    // Preview look-alikes: another team, a long/short hash, a branch alias, http, extra labels.
    'https://job-hunt-h95mo04go-evil-projects.vercel.app',
    'https://job-hunt-h95mo04go-x-adrian-6234s-projects.vercel.app',
    'https://job-hunt-git-main-x-adrian-6234s-projects.vercel.app',
    'https://job-hunt-h95mo04goo-adrian-6234s-projects.vercel.app',
    'https://other-h95mo04go-adrian-6234s-projects.vercel.app',
    'http://job-hunt-h95mo04go-adrian-6234s-projects.vercel.app',
    'https://job-hunt-h95mo04go-adrian-6234s-projects.vercel.app.evil.com',
    'https://JOB-HUNT-JADE.vercel.app.evil.com',
    // Local look-alikes: https, no port, other hosts with ports, userinfo.
    'https://localhost:5173',
    'http://localhost',
    'http://localhost:',
    'http://localhost:5173.evil.com',
    'http://localhost.evil.com:5173',
    'http://evil.com:5173',
    'http://192.168.1.10:5173',
    'http://127.0.0.2:5173',
    'http://user@localhost:5173',
    'http://localhost:99999',
    'null',
    '',
  ])('falls back to production for %s', (origin) => {
    expect(at(origin)).toBe(PROD);
  });

  it('never carries the current path, query or hash', () => {
    expect(at('http://localhost:5173', '/evil?next=https://evil.com#x')).toBe(
      'http://localhost:5173/',
    );
    expect(at('https://roleforge-app.vercel.app', '//evil.com/')).toBe(PROD);
    expect(at('https://job-hunt-jade.vercel.app', '//evil.com/')).toBe(OLD);
  });
});

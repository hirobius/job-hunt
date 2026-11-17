// The CAPTCHA's switch (#278): off unless a real site key is set; a value that is not a site key
// (the secret, pasted into the public variable) is a build error, never a shipped string.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { captchaSiteKey, setCaptchaSiteKey, siteKeyProblem } from './captchaKey';

const TEST_KEY = '10000000-ffff-ffff-ffff-000000000001'; // hCaptcha's public test site key

describe('captchaKey', () => {
  it('is off by default', () => {
    expect(captchaSiteKey()).toBe('');
  });

  it('a test can turn it on (test/setup.ts turns it off again before the next test)', () => {
    setCaptchaSiteKey(TEST_KEY);
    expect(captchaSiteKey()).toBe(TEST_KEY);
  });

  it.each([undefined, '', '  ', TEST_KEY])('accepts %j (unset, empty, or a site key)', (v) =>
    expect(siteKeyProblem(v)).toBeNull(),
  );

  it.each(['0x0000000000000000000000000000000000000000', 'ES_not-a-site-key', 'yes', 'true'])(
    'refuses %j: not a site key',
    (v) => expect(siteKeyProblem(v)).toMatch(/not an hCaptcha site key/),
  );

  it('the build runs the check, and the example env file names the variable with no value', () => {
    const config = fs.readFileSync('vite.config.ts', 'utf8');
    expect(config).toMatch(/siteKeyProblem\(config\.env\.VITE_HCAPTCHA_SITEKEY/);
    const example = fs.readFileSync(['.env', 'example'].join('.'), 'utf8');
    expect(example).toMatch(/^VITE_HCAPTCHA_SITEKEY=$/m);
  });
});

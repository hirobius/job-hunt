import { describe, expect, it } from 'vitest';
import { htmlToText, isAllowedUrl, clampJd, MAX_JD_CHARS } from './extract-core';

describe('htmlToText', () => {
  it('strips tags/scripts/styles and decodes entities', () => {
    const html =
      '<style>.x{color:red}</style><script>bad()</script>' +
      '<h1>Senior Engineer</h1><p>Build&nbsp;things &amp; ship</p>';
    const t = htmlToText(html);
    expect(t).toContain('Senior Engineer');
    expect(t).toContain('Build things & ship');
    expect(t).not.toContain('bad()');
    expect(t).not.toMatch(/[<>]/);
  });
});

describe('isAllowedUrl', () => {
  it('allows public http(s)', () => {
    expect(isAllowedUrl('https://boards.greenhouse.io/acme/jobs/1')).toBe(true);
  });
  it('blocks localhost, private ranges, and non-http schemes', () => {
    for (const bad of [
      'http://localhost:3000',
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/', // cloud metadata endpoint
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(isAllowedUrl(bad)).toBe(false);
    }
  });
});

describe('clampJd', () => {
  it('caps overly long input and passes short input through', () => {
    expect(clampJd('a'.repeat(MAX_JD_CHARS + 100)).length).toBe(MAX_JD_CHARS);
    expect(clampJd('short')).toBe('short');
  });
});

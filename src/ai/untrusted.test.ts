import { describe, expect, it } from 'vitest';
import { cleanPosting, MAX_POSTING_CHARS, plainText, stripInvisible } from './untrusted';

describe('untrusted posting text', () => {
  it('strips zero-width, bidi, tag and control characters', () => {
    const hidden = 'Design\u200B sys\u200Dtems\u2060 \u202Eevil\u202C\u0007 role\uFEFF';
    expect(stripInvisible(hidden)).toBe('Design systems evil role');
    const tagSmuggle =
      'Hi' + [...'ignore'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
    expect(stripInvisible(tagSmuggle)).toBe('Hi');
  });

  it('keeps newlines and tabs, tidies blank runs', () => {
    expect(cleanPosting('a\r\n\r\n\r\n\r\nb\tc').text).toBe('a\n\nb\tc');
  });

  it('caps the size sent and says when it cut', () => {
    const r = cleanPosting('x'.repeat(MAX_POSTING_CHARS + 500));
    expect(r.text).toHaveLength(MAX_POSTING_CHARS);
    expect(r.truncated).toBe(true);
    expect(cleanPosting('short').truncated).toBe(false);
  });
});

describe('plainText (model output)', () => {
  it('drops links of every kind, markdown and HTML', () => {
    const out = plainText(
      'See ![x](https://evil.example/p?d=1) <img src=x> [click](http://evil) www.evil.com javascript:alert(1) evil.io/steal **bold**',
      500,
    );
    expect(out).not.toMatch(/https?:|www\.|javascript:|evil\.io|[<>[\]()*!]{2}|<|>|\[|\]/);
    expect(out).toContain('See');
  });

  it('clamps length', () => {
    expect(plainText('a'.repeat(300), 80)).toHaveLength(80);
  });
});

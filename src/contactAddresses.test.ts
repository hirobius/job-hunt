// Contact data in this public repo (audit item 3, Adrian 2026-11-19): only the business's role
// addresses appear, never a person's mailbox. Security reports go to GitHub's private report or the
// public contact (SECURITY.md); the sign-in mail comes from the login sender.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from './legal';

const DOMAIN = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*hirobius\.com/g;
const ROLE = new Set([CONTACT_EMAIL, `login@mail.${CONTACT_EMAIL.split('@')[1]}`]);

describe('contact addresses', () => {
  it('names only the role addresses, in every tracked file', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter((f) => f && !/\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i.test(f));
    const found = new Map<string, string[]>();
    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue; // removed in the working tree
      }
      for (const a of text.match(DOMAIN) ?? [])
        if (!ROLE.has(a.toLowerCase()))
          found.set(f, [...(found.get(f) ?? []), a.length + ' chars']);
    }
    expect(Object.fromEntries(found)).toEqual({});
  });

  it('SECURITY.md sends reports to the private report or the public contact', () => {
    const md = readFileSync('SECURITY.md', 'utf8');
    expect(md).toMatch(/Report a vulnerability/);
    expect(md).toContain(CONTACT_EMAIL);
  });
});

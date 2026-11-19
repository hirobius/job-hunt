// Contact data in this public repo (audit item 3, Adrian 2026-11-19): no person's mailbox. Two
// checks: (1) the hirobius domains appear only as role addresses, in every tracked file; (2) the
// docs a reader opens (SECURITY.md, README.md, CONTRIBUTING.md, docs/**/*.md) name no address at
// all outside a short allow-list of role mailboxes, placeholders and public company contacts.
// Security reports go to GitHub's private report or the public contact (SECURITY.md).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from './legal';

const EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const HIROBIUS = /@(?:[A-Za-z0-9-]+\.)*hirobius\.com$/i;
const ROLE = /^(?:info|security|login)@(?:mail\.)?hirobius\.com$/i;
/** Placeholders and fake test domains (RFC 2606), and public company contacts the research cites. */
const ALLOWED = [
  /@(?:[A-Za-z0-9-]+\.)*example\.(?:com|org|net|test)$/i,
  /@[A-Za-z0-9-]+\.test$/i,
  /^x@y\.com$/i, // the sign-in copy's placeholder (docs/agent/account.md)
  /^hello@weworkremotely\.com$/i, // a job board's public contact (docs/research)
];

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f && !/\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i.test(f));
const read = (f: string) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return ''; // removed in the working tree
  }
};

/** Every address in `text` that the rules refuse. */
function refused(text: string, docs: boolean): string[] {
  return (text.match(EMAIL) ?? []).filter((a) =>
    HIROBIUS.test(a) ? !ROLE.test(a) : docs && !ALLOWED.some((r) => r.test(a)),
  );
}

describe('contact addresses', () => {
  it('the rules refuse a personal address and keep the role ones', () => {
    // A scratch personal address, built so this file holds none.
    const personal = ['jane.doe', 'hirobius.com'].join('@');
    const other = ['jane', 'gmail.com'].join('@');
    expect(refused(`Email ${personal}`, false)).toEqual([personal]);
    expect(refused(`Email ${other}`, true)).toEqual([other]);
    expect(refused(`Email ${other}`, false)).toEqual([]); // code may name other domains
    expect(refused(`${CONTACT_EMAIL}, login@mail.hirobius.com, a@example.test`, true)).toEqual([]);
  });

  it('the hirobius domains appear only as role addresses, in every tracked file', () => {
    const found = tracked().flatMap((f) =>
      refused(read(f), false).map((a) => `${f}: ${a.length} chars`),
    );
    expect(found).toEqual([]);
  });

  it('the docs name no address outside the allow-list', () => {
    const docs = tracked().filter(
      (f) => /^(SECURITY|README|CONTRIBUTING)\.md$/.test(f) || /^docs\/.*\.md$/.test(f),
    );
    expect(docs).toContain('SECURITY.md');
    const found = docs.flatMap((f) => refused(read(f), true).map((a) => `${f}: ${a.length} chars`));
    expect(found).toEqual([]);
  });

  it('SECURITY.md sends reports to the private report or the public contact', () => {
    const md = readFileSync('SECURITY.md', 'utf8');
    expect(md).toMatch(/Report a vulnerability/);
    expect(md).toContain(CONTACT_EMAIL);
  });
});

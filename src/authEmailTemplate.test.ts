// The magic-link email (#278) lives in the repo and is pasted into the Supabase dashboard.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';

const HTML = fs.readFileSync('supabase/templates/magic_link.html', 'utf8');
const README = fs.readFileSync('supabase/templates/README.md', 'utf8');
const RUNBOOK = fs.readFileSync('docs/resend-smtp-runbook.md', 'utf8');

describe('magic-link email template (#278)', () => {
  it('links to the confirmation URL Supabase fills in', () => {
    expect(HTML.match(/href="\{\{ \.ConfirmationURL \}\}"/g)?.length).toBe(2);
  });

  it('names the current product, never an old name', () => {
    expect(HTML).toContain(`Sign in to ${BRAND.name}`);
    expect(README).toContain(`Your ${BRAND.name} sign-in link`);
    expect(RUNBOOK).toContain(`\`${BRAND.name}\``);
    for (const text of [HTML, README])
      expect(text).not.toMatch(/Apply Board|RoleForge|Roleforge|\bStoke\b|\bhiraga\b/);
  });

  it('loads nothing remote (no images, scripts or tracking)', () => {
    expect(HTML).not.toMatch(/<img|<script|<link|url\(/i);
    const hrefs = [...HTML.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h === '{{ .ConfirmationURL }}')).toBe(true);
  });

  it('says the real expiry and what to do if it was not asked for', () => {
    expect(HTML).toContain('expires in 1 hour');
    expect(HTML).toMatch(/Ignore this email/);
  });
});

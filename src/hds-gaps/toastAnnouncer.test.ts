// HDS Toast announces every notice assertively, its title and description run together (#365).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { announcing, installToastAnnouncer } from './toastAnnouncer';

const said = (p: 'polite' | 'assertive') =>
  announcing(p)
    .map((r) => r.textContent)
    .join('|');

// The DOM HDS Toast (0.32.0) and Radix (1.2) put on the page for one toast: Radix's announcer
// span on <body>, and the toast's <li> in the Notifications region's list.
function showToast({ title, description, tone = 'success' }: Record<string, string>) {
  const announcer = document.createElement('span');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'assertive');
  announcer.setAttribute('aria-atomic', 'true');
  document.body.appendChild(announcer);
  const li = document.createElement('li');
  li.innerHTML = `<svg class="text-feedback-${tone}" aria-hidden="true"></svg>
    <div class="flex min-w-0 flex-col gap-1">
      <div class="hds-type-ui">${title}</div>
      ${description ? `<div class="hds-type-ui text-muted-foreground">${description}</div>` : ''}
      <div><button>Undo</button></div>
    </div><button aria-label="Dismiss"></button>`;
  document.querySelector('[aria-label^="Notifications"] ol')!.appendChild(li);
  // Radix fills its announcer a frame later.
  requestAnimationFrame(() => (announcer.textContent = `Notification ${title}${description}`));
  return announcer;
}

beforeAll(() => {
  document.body.innerHTML = `<div role="region" aria-label="Notifications (F8)"><ol></ol></div>`;
  installToastAnnouncer();
});
afterEach(() => {
  document.querySelectorAll('body > span, li, [data-rjb-announcer]').forEach((n) => n.remove());
});

describe('toast announcer (#365, an HDS 0.32 gap)', () => {
  it('says a notice politely, its title and description as two phrases', async () => {
    const radix = showToast({
      title: 'Marked applied · Follow up in 7 days',
      description: 'Solutions Engineer',
    });
    await waitFor(() =>
      expect(said('polite')).toBe('Marked applied · Follow up in 7 days. Solutions Engineer'),
    );
    expect(announcing('polite')[0]).toHaveAttribute('aria-live', 'polite');
    expect(said('assertive')).toBe('');
    // Radix's own assertive announcer is silenced, so nothing interrupts or says it twice.
    expect(radix).toHaveAttribute('aria-hidden', 'true');
    expect(radix).toHaveAttribute('aria-live', 'off');
  });

  it('keeps a title that ends in punctuation as it is, and a title alone', async () => {
    showToast({ title: 'Saved to Pipeline!', description: 'Design Engineer' });
    await waitFor(() => expect(said('polite')).toBe('Saved to Pipeline! Design Engineer'));
    showToast({ title: 'Copied the query', description: '' });
    // Each toast gets its own region, so a quick second one never drops the first.
    await waitFor(() =>
      expect(said('polite')).toBe('Saved to Pipeline! Design Engineer|Copied the query'),
    );
  });

  it('says an error assertively', async () => {
    showToast({ title: 'Couldn’t sync', description: 'Check your connection', tone: 'danger' });
    await waitFor(() => expect(said('assertive')).toBe('Couldn’t sync. Check your connection'));
    expect(announcing('assertive')[0]).toHaveAttribute('role', 'alert');
  });

  it('is heard while a modal dialog has aria-hidden the rest of <body>', async () => {
    // Radix Dialog hides <body>'s children when it opens; a region made after that is not hidden.
    const app = document.querySelector<HTMLElement>('[aria-label^="Notifications"]')!;
    app.setAttribute('aria-hidden', 'true');
    showToast({ title: 'Copied', description: '' });
    await waitFor(() => expect(said('polite')).toBe('Copied'));
    expect(announcing('polite')[0].closest('[aria-hidden="true"]')).toBeNull();
    app.removeAttribute('aria-hidden');
  });

  it('takes each region off the page after a second', async () => {
    showToast({ title: 'Gone soon', description: '' });
    await waitFor(() => expect(said('polite')).toContain('Gone soon'));
    await waitFor(() => expect(announcing('polite')).toHaveLength(0), { timeout: 2000 });
  });
});

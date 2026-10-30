// HDS Toast announces every notice assertively, its title and description run together (#365).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { installToastAnnouncer, regions } from './toastAnnouncer';

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
  document.querySelectorAll('body > span, li').forEach((n) => n.remove());
});

describe('toast announcer (#365, an HDS 0.32 gap)', () => {
  it('says a notice politely, its title and description as two phrases', async () => {
    const radix = showToast({
      title: 'Marked applied · Follow up in 7 days',
      description: 'Solutions Engineer',
    });
    await waitFor(() =>
      expect(regions().polite.textContent).toBe(
        'Marked applied · Follow up in 7 days. Solutions Engineer',
      ),
    );
    expect(regions().polite).toHaveAttribute('aria-live', 'polite');
    expect(regions().assertive.textContent).toBe('');
    // Radix's own assertive announcer is silenced, so nothing interrupts or says it twice.
    expect(radix).toHaveAttribute('aria-hidden', 'true');
    expect(radix).toHaveAttribute('aria-live', 'off');
  });

  it('keeps a title that ends in punctuation as it is, and a title alone', async () => {
    showToast({ title: 'Saved to Pipeline!', description: 'Design Engineer' });
    await waitFor(() =>
      expect(regions().polite.textContent).toBe('Saved to Pipeline! Design Engineer'),
    );
    showToast({ title: 'Copied the query', description: '' });
    await waitFor(() => expect(regions().polite.textContent).toBe('Copied the query'));
  });

  it('says an error assertively', async () => {
    showToast({ title: 'Couldn’t sync', description: 'Check your connection', tone: 'danger' });
    await waitFor(() =>
      expect(regions().assertive.textContent).toBe('Couldn’t sync. Check your connection'),
    );
    expect(regions().assertive).toHaveAttribute('role', 'alert');
  });
});

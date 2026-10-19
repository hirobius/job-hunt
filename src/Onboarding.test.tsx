import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import { Onboarding } from './Onboarding';
import { setCurationSyncStatus } from './curation/syncStatus';
import { getCurationState, replaceCurationState } from './curation/curationStore';

afterEach(() => {
  cleanup();
  setCurationSyncStatus('idle');
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('Onboarding sync gate (#99)', () => {
  it('waits while a sign-in pull may restore tracks, then shows the packs', () => {
    setCurationSyncStatus('syncing');
    render(<Onboarding />);
    expect(screen.getByText('Restoring your tracks…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // the spinner announces loading
    expect(screen.queryByText('Set up your board')).toBeNull();
    act(() => setCurationSyncStatus('error')); // e.g. paused project → still lets them onboard
    expect(screen.getByText('Set up your board')).toBeInTheDocument();
  });
});

describe('Onboarding pack picker a11y (#104)', () => {
  it('each pack is a keyboard-operable checkbox-like button named by its pack', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    const card = screen.getByRole('checkbox', { name: 'Design Systems / Design Eng' });
    expect(card).toHaveAttribute('aria-checked', 'false');
    card.focus();
    await user.keyboard(' ');
    expect(card).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Start with 1 track' })).toBeEnabled();
  });

  it('"Build your own" requires a first job title, and seeds the track with it', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole('checkbox', { name: 'Build your own' }));
    expect(screen.getByRole('button', { name: 'Add a first job title' })).toBeDisabled();
    await user.type(screen.getByLabelText(/First job title/), 'Design Engineer');
    await user.click(screen.getByRole('button', { name: 'Start with 1 track' }));
    expect(getCurationState().categories.map((c) => [c.label, c.titles])).toEqual([
      ['Build your own', ['Design Engineer']],
    ]);
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = render(
      <ToastProvider>
        <Onboarding />
      </ToastProvider>,
    );
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});

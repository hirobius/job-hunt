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

describe('Onboarding order and selected state', () => {
  it('puts the optional location field after the track picks and before the start button', () => {
    render(<Onboarding />);
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const lastPack = screen.getAllByRole('checkbox').slice(-1)[0];
    const location = screen.getByLabelText(/Location/);
    const start = screen.getByRole('button', { name: 'Start searching' });
    expect(follows(lastPack, location)).toBe(true);
    expect(follows(location, start)).toBe(true);
  });

  it('shows a check indicator only on the selected pack', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    const card = screen.getByRole('checkbox', { name: 'Design Systems / Design Eng' });
    expect(card.querySelector('svg')).toBeNull();
    await user.click(card);
    expect(card.querySelector('svg')).not.toBeNull();
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

  it('keeps Start sticky at the bottom with the pick-count hint, and Skip for now under it', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    const footer = screen.getByTestId('onboarding-footer');
    expect(footer.style.position).toBe('sticky');
    expect(footer.style.bottom).toBe('0px');
    expect(footer).toHaveTextContent('Pick at least 1 track');
    expect(screen.getByRole('button', { name: 'Start searching' })).toBeDisabled();
    const buttons = footer.querySelectorAll('button');
    expect(buttons[1]).toHaveTextContent('Skip for now');
    await user.click(screen.getByRole('checkbox', { name: 'Design Systems / Design Eng' }));
    expect(footer).not.toHaveTextContent('Pick at least 1 track');
  });

  it('Skip for now opens Discover on an empty track instead of looping back to onboarding', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['My track']);
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

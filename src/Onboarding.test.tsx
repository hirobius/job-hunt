import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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
  it('each pack is a keyboard-operable checkbox in a "Starter tracks" group, none ticked (Suggested too)', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    const group = screen.getByRole('group', { name: 'Starter tracks' });
    // Adrian 2026-10-22: the Suggested pack keeps its badge but starts unticked.
    within(group)
      .getAllByRole('checkbox')
      .forEach((b) => expect(b).not.toBeChecked());
    expect(within(group).getByText('Suggested')).toBeInTheDocument();
    const box = within(group).getByRole('checkbox', { name: 'Design Systems / Design Eng' });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(/design-systems/i);
    box.focus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('"Build your own" requires a first job title, and seeds the track with it', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole('checkbox', { name: 'Build your own' }));
    // Never disabled: pressing Continue without the title says what is missing and stays put.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Add a first job title for your own track.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 3' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/First job title/), 'Design Engineer');
    // Three steps now (#132): Continue to location, Continue to the first job, Finish seeds.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(getCurationState().categories.map((c) => [c.label, c.titles])).toEqual([
      ['Design Engineer', ['Design Engineer']],
    ]);
  });

  it('with nothing ticked, Continue says "Pick at least one track" instead of being disabled', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeEnabled();
    await user.click(cont);
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one track');
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 3' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'ServiceNow' }));
    expect(screen.queryByText('Pick at least one track')).toBeNull();
  });

  it('a pack set up with no location searches anywhere: no "Remote" default', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole('checkbox', { name: 'Design Systems / Design Eng' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(getCurationState().categories.map((c) => [c.label, c.location])).toEqual([
      ['Design Systems / Design Eng', ''],
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

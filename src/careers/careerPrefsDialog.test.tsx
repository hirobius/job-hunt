// The career preferences preview in the Search profile dialog (ADR 0011, proposed): shown only
// while the flag is on, and Save never changes the profile in use.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Dialog, ToastProvider } from '@hirobius/design-system';
import SearchProfileDialog from '../SearchProfileDialog';
import { getProfiles, replaceProfiles, saveProfile } from '../profile';
import { CAREERS_FLAG_KEY } from './careersFlag';
import { PREVIEW_PROFILE_ID } from './careers';

const open = () =>
  render(
    <ToastProvider>
      <Dialog open>
        <SearchProfileDialog onDone={() => {}} />
      </Dialog>
    </ToastProvider>,
  );
const chip = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  replaceProfiles([]);
  saveProfile({ titles: ['Design Systems Lead'], mode: 'remote', scorer: 'design-systems' });
  localStorage.setItem(CAREERS_FLAG_KEY, '1');
});
afterEach(cleanup);

describe('Job preferences (preview flag on)', () => {
  it('offers a category’s titles and skills once it is picked', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Job preferences' });
    expect(within(dialog).queryByRole('button', { name: 'Data Analyst' })).toBeNull();
    await userEvent.click(chip('Data and analytics'));
    expect(chip('Data and analytics')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip('Data Analyst'));
    expect(chip('Data Analyst')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('SQL')).toHaveAttribute('aria-pressed', 'false');
    const r = await axe(dialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  it('asks for a title before it saves', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick or add at least one job title.');
    expect(getProfiles()).toHaveLength(1);
  });

  it('saves behind the profile in use and leaves that one as it was', async () => {
    const before = JSON.stringify(getProfiles()[0]);
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Marketing' }));
    await userEvent.click(chip('Copywriter'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Job title' }), 'Brand Writer{Enter}');
    await userEvent.click(screen.getByRole('radio', { name: 'Hybrid' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Lowest yearly pay/ }), '80k');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const all = getProfiles();
    expect(JSON.stringify(all[0])).toBe(before);
    expect(all[1]).toMatchObject({
      id: PREVIEW_PROFILE_ID,
      categories: ['marketing'],
      titles: ['Copywriter', 'Brand Writer'],
      mode: 'hybrid',
      payFloor: 80000,
    });
  });
});

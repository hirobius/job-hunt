// DreamStar's unstar (#324): only a row that leaves its list collapses. A Companies row stays in
// the list after unstarring, so collapsing it would leave it invisible (the collapse holds
// `forwards`), and Undo would not bring it back.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DreamStar } from './TeamRoles';
import { readDreams, starDream } from './feed/dreams';

const motionOn = () =>
  (window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia);

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
  localStorage.clear();
});

const renderStar = (rowLeaves?: boolean) =>
  render(
    <ul>
      <li data-testid="row">
        <DreamStar categoryId="t1" company="Acme" rowLeaves={rowLeaves} />
      </li>
    </ul>,
  );

describe('DreamStar unstar', () => {
  it('a Companies row (stays in its list) unstars at once and never collapses', async () => {
    starDream('t1', { company: 'Acme' });
    motionOn();
    renderStar();
    await userEvent.click(screen.getByRole('button', { name: 'Star Acme as a dream company' }));
    expect(readDreams('t1')).toEqual([]);
    expect(screen.getByTestId('row').getAttribute('data-motion')).toBeNull();
  });

  it('a Dream companies row (leaves its list) collapses first, then unstars', async () => {
    starDream('t1', { company: 'Acme' });
    motionOn();
    renderStar(true);
    await userEvent.click(screen.getByRole('button', { name: 'Star Acme as a dream company' }));
    expect(screen.getByTestId('row').getAttribute('data-motion')).toBe('collapse');
    await act(() => new Promise((r) => setTimeout(r, 250)));
    expect(readDreams('t1')).toEqual([]);
  });
});

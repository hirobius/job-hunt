// The shell's top tabs are links in a nav (top tabs PR, 2026-11-08): the open one is
// aria-current="page". Test helpers in place of the old role="tab" lookups.
import { screen, within } from '@testing-library/react';

const nav = (hidden = false) => screen.getByRole('navigation', { name: 'Sections', hidden });

/** A tab's accessible name: its label, then its count when it shows one ("Apply 12", #548). */
const tabName = (name: string) => new RegExp(`^${name}( \\d+\\+?)?$`);

/** A top tab by its name ("Find", "Apply"), with or without its count. */
export const topTab = (name: string, { hidden = false } = {}) =>
  within(nav(hidden)).getByRole('link', { name: tabName(name), hidden });

/** Every top tab, in order. */
export const topTabs = () => within(nav()).getAllByRole('link');

/** The open top tab (aria-current="page"); with a name, that one must be the open one. */
export const currentTab = (name?: string, { hidden = false } = {}) =>
  within(nav(hidden)).getByRole('link', {
    current: 'page',
    hidden,
    ...(name && { name: tabName(name) }),
  });

/** The open top tab, or null on a page with none (not found). */
export const queryCurrentTab = () => within(nav()).queryByRole('link', { current: 'page' });

/** Wait for the shell: its top tabs are there. */
export const findTopTabs = () => screen.findByRole('navigation', { name: 'Sections' });

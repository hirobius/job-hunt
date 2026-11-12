import fs from 'node:fs';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FLAGS_KEY, FLAG_DEFAULTS, flag, setFlag, useFlag, type FlagName } from './flags';

beforeEach(() => localStorage.removeItem(FLAGS_KEY));

describe('feature flags (#597)', () => {
  it('every redesign phase flag is on by default', () => {
    expect(Object.keys(FLAG_DEFAULTS)).toEqual([
      'p2Views',
      'p3Find',
      'p4Shell',
      'p5Dialogs',
      'p6States',
    ]);
    for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) expect(flag(name)).toBe(true);
  });

  it('a device override turns one off, and null goes back to the default', () => {
    setFlag('p3Find', false);
    expect(flag('p3Find')).toBe(false);
    expect(flag('p2Views')).toBe(true);
    expect(JSON.parse(localStorage.getItem(FLAGS_KEY)!)).toEqual({ p3Find: false });
    setFlag('p3Find', null);
    expect(flag('p3Find')).toBe(true);
    expect(localStorage.getItem(FLAGS_KEY)).toBeNull();
  });

  it('ignores garbage, unknown names and non-boolean values', () => {
    localStorage.setItem(FLAGS_KEY, 'not json');
    expect(flag('p4Shell')).toBe(true);
    localStorage.setItem(FLAGS_KEY, JSON.stringify({ p4Shell: 'off', nope: false }));
    expect(flag('p4Shell')).toBe(true);
    localStorage.setItem(FLAGS_KEY, JSON.stringify([false]));
    expect(flag('p4Shell')).toBe(true);
  });

  it('useFlag re-renders on a change in this tab and in another tab', () => {
    function Probe() {
      return <p>{useFlag('p6States') ? 'on' : 'off'}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('on')).toBeInTheDocument();
    act(() => setFlag('p6States', false));
    expect(screen.getByText('off')).toBeInTheDocument();
    act(() => {
      localStorage.setItem(FLAGS_KEY, '{}');
      dispatchEvent(new StorageEvent('storage', { key: FLAGS_KEY }));
    });
    expect(screen.getByText('on')).toBeInTheDocument();
  });

  it('stays per device: an rjb_ui_ key, and no service or network', () => {
    expect(FLAGS_KEY.startsWith('rjb_ui_')).toBe(true);
    const src = fs.readFileSync('src/flags.ts', 'utf8');
    expect(src).not.toMatch(/fetch\(|supabase|https?:\/\//);
  });
});

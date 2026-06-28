import { afterEach, describe, expect, it } from 'vitest';
import { togglePin, toggleDismiss, getTileTriage } from './tileTriage';

afterEach(() => {
  // reset the shared store between tests
  getTileTriage()
    .pinned.slice()
    .forEach((u) => togglePin(u));
  getTileTriage()
    .dismissed.slice()
    .forEach((u) => toggleDismiss(u));
});

describe('tile triage', () => {
  it('pins and unpins a tile by url', () => {
    togglePin('https://x.com/a');
    expect(getTileTriage().pinned).toContain('https://x.com/a');
    togglePin('https://x.com/a');
    expect(getTileTriage().pinned).not.toContain('https://x.com/a');
  });

  it('sets aside and restores a tile', () => {
    toggleDismiss('https://x.com/b');
    expect(getTileTriage().dismissed).toContain('https://x.com/b');
    toggleDismiss('https://x.com/b');
    expect(getTileTriage().dismissed).not.toContain('https://x.com/b');
  });

  it('pin and set-aside are mutually exclusive', () => {
    togglePin('https://x.com/c');
    toggleDismiss('https://x.com/c'); // setting aside clears the pin
    expect(getTileTriage().pinned).not.toContain('https://x.com/c');
    expect(getTileTriage().dismissed).toContain('https://x.com/c');
    togglePin('https://x.com/c'); // pinning brings it back out of "set aside"
    expect(getTileTriage().dismissed).not.toContain('https://x.com/c');
    expect(getTileTriage().pinned).toContain('https://x.com/c');
  });
});

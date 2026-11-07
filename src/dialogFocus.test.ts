// A route dialog hands focus back to what opened it: a menu item stands for its menu's trigger.
import { describe, expect, it } from 'vitest';
import { openerOf } from './dialogFocus';

describe('openerOf (#471 slice 4)', () => {
  it('a menu item names its menu trigger; a plain control is itself; the body is none', () => {
    document.body.innerHTML = `
      <button id="trig">Account</button>
      <div role="menu" aria-labelledby="trig"><div role="menuitem" tabindex="-1" id="item">Documents</div></div>
      <a id="link" href="#">Edit documents</a>`;
    expect(openerOf(document.getElementById('item'))?.id).toBe('trig');
    expect(openerOf(document.getElementById('link'))?.id).toBe('link');
    expect(openerOf(document.body)).toBeNull();
    expect(openerOf(null)).toBeNull();
  });
});

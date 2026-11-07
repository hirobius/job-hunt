// Focus is never dropped (a11y audit 2026-10-27): when the focused element leaves the page, focus
// goes to what took its place, else the control before it, else the page's heading; a page change
// moves it to the new page's heading. jsdom has no layout, so "shown" is stubbed to true.
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { findMark, installFocusRescue, pageHeading, spotOf, successor } from './focusRescue';

const shown = () => true;
const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;

afterEach(() => {
  document.body.innerHTML = '';
});

function list() {
  document.body.innerHTML = `
    <main>
      <h2>Pipeline</h2>
      <ul>
        <li id="r1"><a href="#a">One</a><button id="b1">Mark applied</button></li>
        <li id="r2"><a href="#b" id="a2">Two</a><button id="b2">Mark applied</button></li>
        <li id="r3"><a href="#c" id="a3">Three</a><button id="b3">Mark applied</button></li>
      </ul>
      <button id="after">Find the next company</button>
    </main>`;
}

describe('successor', () => {
  it('is the first control of the row that took the removed row’s place', () => {
    list();
    const spot = spotOf($('#b2'));
    $('#r2').remove();
    expect(successor(spot, shown)?.id).toBe('a3');
  });

  it('is the control that replaced it in the same place', () => {
    list();
    const spot = spotOf($('#b2'));
    const swap = document.createElement('button');
    swap.id = 'follow';
    $('#b2').replaceWith(swap);
    expect(successor(spot, shown)?.id).toBe('follow');
  });

  it('is the control before it when the last row left', () => {
    list();
    $('#after').remove();
    const spot = spotOf($('#b3'));
    $('#r3').remove();
    expect(successor(spot, shown)?.id).toBe('b2');
  });

  it('goes up a level when the list is left empty', () => {
    document.body.innerHTML = `<main><h2>Pipeline</h2><section><ul><li id="only"><button id="x">X</button></li></ul></section><button id="next">Next</button></main>`;
    const spot = spotOf($('#x'));
    $('#only').remove();
    expect(successor(spot, shown)?.id).toBe('next');
  });

  it('is nothing while the element is still on the page', () => {
    list();
    expect(successor(spotOf($('#b2')), shown)).toBeNull();
  });
});

describe('pageHeading', () => {
  it('is the first h1 or h2 in main, outside a side rail', () => {
    document.body.innerHTML = `<header><h1>Brand</h1></header><main><nav><h2>Jobs</h2></nav><h2 id="t">UX Researcher</h2></main>`;
    expect(pageHeading(shown)?.id).toBe('t');
  });

  it("is the page's h1 (#363), even with a section h2 above it", () => {
    document.body.innerHTML = `<main><h2>Saved</h2><h1 id="t">Pipeline</h1></main>`;
    expect(pageHeading(shown)?.id).toBe('t');
  });
});

describe('installFocusRescue', () => {
  it('hands focus on when the focused row leaves the list', async () => {
    installFocusRescue(shown);
    list();
    $('#b2').focus();
    $('#r2').remove();
    await waitFor(() => expect(document.activeElement?.id).toBe('a3'));
  });

  it('leaves focus alone when the user blurred it and the row leaves later', async () => {
    installFocusRescue(shown);
    list();
    $('#b2').focus();
    $('#b2').blur();
    await new Promise((r) => setTimeout(r, 10));
    $('#r2').remove();
    await new Promise((r) => setTimeout(r, 150));
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new page’s heading on a page change, without a tab stop', async () => {
    installFocusRescue(shown);
    list();
    $('#a2').focus();
    // The page changes: the old page goes, the new one (with its heading) comes in.
    document.body.innerHTML = `<main><h2 id="job">Two</h2></main>`;
    window.location.hash = '#/apply/abc';
    await waitFor(() => expect(document.activeElement?.id).toBe('job'));
    expect($('#job').getAttribute('tabindex')).toBe('-1');
  });

  it('coming back to a page focuses the control that left it, once it is listed again', async () => {
    installFocusRescue(shown);
    window.location.hash = '#/apply';
    await new Promise((r) => setTimeout(r, 50));
    list();
    $('#a2').focus();
    // The route changes first, then React renders the new page.
    window.location.hash = '#/apply/two';
    await new Promise((r) => setTimeout(r, 0));
    document.body.innerHTML = `<main><h2 id="job">Two</h2></main>`;
    await waitFor(() => expect(document.activeElement?.id).toBe('job'));
    // Back: the list comes in after the page's heading.
    window.location.hash = '#/apply';
    await new Promise((r) => setTimeout(r, 0));
    document.body.innerHTML = `<main><h2 id="p">Pipeline</h2></main>`;
    await waitFor(() => expect(document.activeElement?.id).toBe('p'));
    list();
    await waitFor(() => expect(document.activeElement?.id).toBe('a2'));
  });
});

describe('findMark', () => {
  it('finds a link by its target, anything else by its name', () => {
    list();
    expect(findMark({ tag: 'A', href: '#b', name: 'renamed' }, shown)?.id).toBe('a2');
    expect(findMark({ tag: 'BUTTON', href: null, name: 'Mark applied' }, shown)?.id).toBe('b1');
    expect(findMark({ tag: 'A', href: '#gone', name: 'Two' }, shown)).toBeNull();
  });
});

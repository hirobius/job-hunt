import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import CompanyLogo from './CompanyLogo';
import { logoLetter, resetLogoVerdicts } from './companyLogo';

// The probe is a detached Image; this stands in for it so no test reads the network.
let made: FakeImage[] = [];
class FakeImage {
  referrerPolicy = '';
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    made.push(this);
  }
  finish(w: number, h = w) {
    this.naturalWidth = w;
    this.naturalHeight = h;
    this.onload?.();
  }
}

beforeEach(() => {
  made = [];
  resetLogoVerdicts();
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

const mark = (c: HTMLElement) => c.querySelector('[data-rjb-logo]')!;

describe('CompanyLogo', () => {
  it('shows the letter while the icon loads, then the logo, with no referrer', () => {
    const { container } = render(
      <CompanyLogo company="Acme Corp" addresses={['https://www.acme.com/careers']} />,
    );
    expect(mark(container).getAttribute('data-rjb-logo')).toBe('letter');
    expect(mark(container).textContent).toBe('A');
    expect(made).toHaveLength(1);
    expect(made[0].src).toBe('https://icons.duckduckgo.com/ip3/acme.com.ico');
    expect(made[0].referrerPolicy).toBe('no-referrer');
    act(() => made[0].finish(32));
    expect(mark(container).getAttribute('data-rjb-logo')).toBe('image');
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://icons.duckduckgo.com/ip3/acme.com.ico');
    expect(img.getAttribute('alt')).toBe('');
    expect(mark(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the letter when the icon errors or loads smaller than 16px', () => {
    const { container } = render(<CompanyLogo company="Acme" addresses={['acme.com']} />);
    act(() => made[0].onerror?.());
    expect(mark(container).getAttribute('data-rjb-logo')).toBe('letter');
    resetLogoVerdicts();
    const tiny = render(<CompanyLogo company="Tiny" addresses={['tiny.io']} />);
    act(() => made[1].finish(15));
    expect(mark(tiny.container).getAttribute('data-rjb-logo')).toBe('letter');
    expect(tiny.container.querySelector('img')).toBeNull();
  });

  it('never asks for a job board’s icon: the letter only', () => {
    const { container } = render(
      <CompanyLogo company="Acme" postings={['https://boards.greenhouse.io/acme/jobs/1']} />,
    );
    expect(made).toHaveLength(0);
    expect(mark(container).getAttribute('data-rjb-logo')).toBe('letter');
  });

  it('uses the company site before the posting link', () => {
    render(
      <CompanyLogo
        company="Acme"
        addresses={['https://acme.com']}
        postings={['https://jobs.lever.co/acme/1']}
      />,
    );
    expect(made[0].src).toContain('/acme.com.ico');
  });

  it('uses a posting’s domain only when it carries the company name', () => {
    const a = render(<CompanyLogo company="Acme" postings={['https://staffing.com/acme-job']} />);
    expect(made).toHaveLength(0);
    expect(mark(a.container).getAttribute('data-rjb-logo')).toBe('letter');
    render(<CompanyLogo company="Acme" postings={['https://jobs.acme.com/1']} />);
    expect(made[0].src).toContain('/acme.com.ico');
  });

  it('renders nothing without a company name', () => {
    const { container } = render(<CompanyLogo company="  " addresses={['acme.com']} />);
    expect(container.firstChild).toBeNull();
    expect(made).toHaveLength(0);
  });

  it('remembers a loaded icon, so a remount does not flash the letter', () => {
    const a = render(<CompanyLogo company="Acme" addresses={['acme.com']} />);
    act(() => made[0].finish(32));
    a.unmount();
    const b = render(<CompanyLogo company="Acme" addresses={['acme.com']} />);
    expect(mark(b.container).getAttribute('data-rjb-logo')).toBe('image');
    expect(made).toHaveLength(1);
  });
});

describe('logoLetter', () => {
  it.each([
    ['acme', 'A'],
    ['  3M', '3'],
    ['"Édition"', 'É'],
    ['—', ''],
  ])('%s → %s', (n, l) => expect(logoLetter(n)).toBe(l));

  it('draws inline (24px, Find cards and Apply rows) with .rjb-logo-inline', () => {
    const { container } = render(<CompanyLogo inline company="Acme" />);
    expect(mark(container)).toHaveClass('rjb-logo-inline');
    const plain = render(<CompanyLogo company="Acme" />);
    expect(mark(plain.container)).not.toHaveClass('rjb-logo-inline');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CompanyLine from './CompanyLine';
import { DetailTitleBlock } from './DetailHeader';

const mark = (c: HTMLElement) => c.querySelector('[data-rjb-logo]');

describe('CompanyLine', () => {
  it('draws the 24px mark before the name, in one row', () => {
    const { container } = render(<CompanyLine company="Harbor Atlas" />);
    const row = container.querySelector('[data-rjb-company-line]')!;
    expect(row.firstElementChild).toBe(mark(container));
    expect(mark(container)).toHaveClass('rjb-logo-inline');
    expect(screen.getByText('Harbor Atlas')).toBeInTheDocument();
  });

  it('says "Company not stated" with no mark when there is no company', () => {
    const { container } = render(<CompanyLine company="  " />);
    expect(screen.getByText('Company not stated')).toBeInTheDocument();
    expect(mark(container)).toBeNull();
  });

  it('is what the detail header shows, so detail and card cannot drift', () => {
    const line = render(<CompanyLine company="Harbor Atlas" url="https://x.test/1" />);
    const block = render(
      <DetailTitleBlock
        title="T"
        company="Harbor Atlas"
        url="https://x.test/1"
        noCompany="n"
        facts={[]}
      />,
    );
    const a = line.container.querySelector('[data-rjb-company-line]')!.outerHTML;
    const b = block.container.querySelector('[data-rjb-company-line]')!.outerHTML;
    expect(b.replace(/id="[^"]*"/g, '')).toBe(a.replace(/id="[^"]*"/g, ''));
  });
});

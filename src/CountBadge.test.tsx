import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from '@hirobius/design-system';
import { CountBadge } from './CountBadge';

describe('CountBadge', () => {
  it('shows 99 as 99', () => {
    const { container } = render(<CountBadge count={99} />);
    expect(container.textContent).toBe('99');
  });
  it('caps 100 at 99+ while the chip name keeps the full count', () => {
    render(
      <Tag aria-label="New 100" onClick={() => {}}>
        New <CountBadge count={100} />
      </Tag>,
    );
    const chip = screen.getByRole('button', { name: 'New 100' });
    expect(chip.textContent).toContain('99+');
    expect(chip.textContent).not.toContain('100');
  });
});

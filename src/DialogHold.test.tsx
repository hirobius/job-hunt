// While a route dialog's chunk loads, its frame shows at once with the real title (#471 slice 4).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DialogHold from './DialogHold';

describe('DialogHold', () => {
  it('is the named dialog, busy, with Skeleton lines', () => {
    render(<DialogHold title="Documents" size="xl" />);
    const dialog = screen.getByRole('dialog', { name: 'Documents' });
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});

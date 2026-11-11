import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExitButton } from './ExitButton';

// #537: the exit is HDS's link button with HDS's touch-target class (44px), never a filled key.
describe('ExitButton', () => {
  it('is an HDS link button with a 44px target class', () => {
    const onClick = vi.fn();
    render(<ExitButton onClick={onClick}>Cancel</ExitButton>);
    const b = screen.getByRole('button', { name: 'Cancel' });
    expect(b).toHaveAttribute('data-variant', 'link');
    expect(b.className).toContain('hds-touch-target');
    expect(b.className).toContain('underline');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a caller class', () => {
    render(<ExitButton className="x-col">Continue</ExitButton>);
    expect(screen.getByRole('button', { name: 'Continue' }).className).toContain('x-col');
  });
});

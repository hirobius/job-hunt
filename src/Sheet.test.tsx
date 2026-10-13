import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@hirobius/design-system';
import { Sheet, SheetMenu } from './Sheet';

afterEach(cleanup);

describe('Sheet', () => {
  it('is a named modal dialog with its description and footer', () => {
    render(
      <Sheet
        open
        onOpenChange={() => {}}
        title="Sort jobs"
        description="Pick one"
        footer={<Button>Done</Button>}
      >
        body
      </Sheet>,
    );
    const d = screen.getByRole('dialog', { name: 'Sort jobs' });
    expect(d).toHaveTextContent('Pick one');
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    render(<Sheet open onOpenChange={onOpenChange} title="T" />);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('SheetMenu', () => {
  it('runs the picked item and marks the current one', async () => {
    const pick = vi.fn();
    render(
      <SheetMenu
        label="Sort"
        items={[
          { label: 'Recently added', onSelect: () => {}, selected: true },
          { label: 'A–Z', onSelect: pick },
          { label: 'Remove', onSelect: () => {}, tone: 'danger' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /Recently added/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(pick).toHaveBeenCalled();
  });
});

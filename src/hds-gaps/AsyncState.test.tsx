import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AsyncState from './AsyncState';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AsyncState (HDS gap: async list states)', () => {
  it('loads with skeleton rows and a status, not a spinner', () => {
    render(<AsyncState status="loading" loadingLabel="Pulling live openings" />);
    expect(screen.getByRole('status')).toHaveTextContent('Pulling live openings');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('says it is still trying once loading runs long', () => {
    vi.useFakeTimers();
    render(
      <AsyncState
        status="loading"
        slowAfterMs={10_000}
        slowNote="Still trying: slow sources are skipped after 15 s"
      />,
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('Still trying');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Still trying: slow sources are skipped after 15 s',
    );
  });

  it('shows the error with a Retry that calls back', async () => {
    const onRetry = vi.fn();
    render(
      <AsyncState
        status="error"
        onRetry={onRetry}
        error={{ title: 'Couldn’t reach any source', message: 'Check your connection.' }}
      />,
    );
    expect(screen.getByText('Couldn’t reach any source')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('words the error as offline when the browser is offline, and still offers Retry', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(
      <AsyncState
        status="error"
        onRetry={() => {}}
        error={{ title: 'Couldn’t reach any source' }}
      />,
    );
    expect(screen.getByText('You’re offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders the caller’s empty state and, when ready, its children', () => {
    const { rerender } = render(
      <AsyncState status="empty" empty={<p>Nothing here</p>}>
        <p>Rows</p>
      </AsyncState>,
    );
    expect(screen.getByText('Nothing here')).toBeVisible();
    rerender(
      <AsyncState status="ready" empty={<p>Nothing here</p>}>
        <p>Rows</p>
      </AsyncState>,
    );
    expect(screen.getByText('Rows')).toBeVisible();
  });
});

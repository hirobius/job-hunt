import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders the fallback UI when a child throws during render', () => {
    // React logs the caught error; silence it for a clean test run.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something broke')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset local data' })).toBeTruthy();
    spy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });
});

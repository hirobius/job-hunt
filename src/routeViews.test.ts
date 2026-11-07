// The first render waits (briefly) for the landing route's view (#372): behind a skeleton, the
// Pipeline's list painted ~400 ms after the shell on a warm load.
import { describe, expect, it, vi } from 'vitest';
import { parseHash } from './route';
import { CompanyPage, JobPage, TrackerView, preloadLanding, viewFor } from './routeViews';

describe('viewFor', () => {
  it('names the lazy view a route opens on', () => {
    expect(viewFor(parseHash('#/apply'))).toBe(TrackerView);
    expect(viewFor(parseHash('#/apply/abc123'))).toBe(JobPage);
    expect(viewFor(parseHash('#/find'))).not.toBeNull();
    expect(viewFor(parseHash('#/apply/company/acme'))).toBe(CompanyPage);
    expect(viewFor(parseHash('#/discover'))).toBeNull();
    expect(viewFor(parseHash(''))).toBeNull();
  });
});

describe('preloadLanding', () => {
  it('resolves once the view is loaded', async () => {
    const preload = vi.spyOn(TrackerView, 'preload');
    await preloadLanding(parseHash('#/apply'));
    expect(preload).toHaveBeenCalledOnce();
  });

  it('gives up after the cap, and on a failed load', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(TrackerView, 'preload').mockReturnValue(new Promise(() => {}));
      const done = vi.fn();
      void preloadLanding(parseHash('#/apply'), 800).then(done);
      await vi.advanceTimersByTimeAsync(799);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    vi.spyOn(JobPage, 'preload').mockRejectedValue(new Error('chunk gone'));
    await expect(preloadLanding(parseHash('#/apply/x'))).resolves.toBeUndefined();
  });
});

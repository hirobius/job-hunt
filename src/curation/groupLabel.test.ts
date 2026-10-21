import { describe, expect, it } from 'vitest';
import { displayGroupLabel } from './groupLabel';
import { GROUPS } from '../jobsData';

describe('displayGroupLabel', () => {
  it('shows an older synced "Apply Now" in sentence case', () => {
    expect(displayGroupLabel('Apply Now')).toBe('Apply now');
    expect(displayGroupLabel('APPLY NOW')).toBe('Apply now');
    expect(displayGroupLabel('  Apply now ')).toBe('Apply now');
  });

  it('leaves every other label as the user wrote it', () => {
    expect(displayGroupLabel('Union Halls')).toBe('Union Halls');
    expect(displayGroupLabel('Watched companies')).toBe('Watched companies');
    expect(displayGroupLabel('Apply Now Later')).toBe('Apply Now Later');
  });
});

describe('starter data', () => {
  it('names no group "Apply Now" in Title Case', () => {
    expect(GROUPS.map((g) => g.label)).not.toContain('Apply Now');
  });

  it('names the featured Apply now section "Job boards" under the Apply now tool (rev-3 G)', () => {
    expect(displayGroupLabel('Apply Now', { featured: true })).toBe('Job boards');
    expect(displayGroupLabel('Union Halls', { featured: true })).toBe('Union Halls');
    expect(displayGroupLabel('Apply Now')).toBe('Apply now');
  });
});

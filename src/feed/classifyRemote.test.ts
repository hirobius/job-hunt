import { describe, expect, it } from 'vitest';
import { classifyRemote, inferMode, remoteVerdict } from './mode';
import { isRemoteJob } from '../pipelineView';
import { isRemoteRole } from '../tracks/feeds/dsRole.ts';
import type { Job } from '../types';

// #576 item 10: one remote classifier, over real location / title phrases.
describe('classifyRemote', () => {
  const cases: [string, string, boolean, string?][] = [
    // phrase, mode, offersRemote, region
    ['Remote', 'remote', true],
    ['Remote (US only)', 'remote', true, 'US'],
    ['Remote - EMEA', 'remote', true, 'EMEA'],
    ['Remote, Canada', 'remote', true, 'Canada'],
    ['Portland, OR, or Remote within Canada', 'remote', true, 'Canada'],
    ['US - Remote', 'remote', true, 'US'],
    ['Anywhere', 'remote', true],
    ['Distributed', 'remote', true],
    ['WFH', 'remote', true],
    ['Work from home', 'remote', true],
    ['Fully remote', 'remote', true],
    ['Hybrid (3 days)', 'hybrid', false],
    ['London (Hybrid)', 'hybrid', false],
    ['New York, 3 days a week in office', 'hybrid', false],
    ['On-site', 'onsite', false],
    ['Onsite - Berlin', 'onsite', false],
    ['In office, Austin TX', 'onsite', false],
    ['not remote', 'onsite', false],
    ['No remote', 'onsite', false],
    ['San Francisco, CA (no remote)', 'onsite', false],
    ['Remote or hybrid', 'unstated', true],
    ['ONSITE or REMOTE', 'unstated', true],
    ['San Francisco, CA', 'unstated', false],
    ['', 'unstated', false],
    ['Distributed systems engineer', 'unstated', false],
  ];
  it.each(cases)('%s', (phrase, mode, offers, region) => {
    const c = classifyRemote(phrase);
    expect(c.mode).toBe(mode);
    expect(c.offersRemote).toBe(offers);
    expect(c.region).toBe(region);
  });

  it('feeds inferMode, remoteVerdict, isRemoteJob and the server feeds the same answer', () => {
    expect(inferMode('Remote - EMEA')).toBe('remote');
    expect(inferMode('Remote or hybrid')).toBeUndefined();
    expect(remoteVerdict(undefined, 'Hybrid (3 days)')).toBe('drop');
    expect(remoteVerdict(undefined, 'WFH')).toBe('keep');
    expect(remoteVerdict(undefined, 'Worldwide')).toBe('unstated');
    expect(remoteVerdict(undefined, 'not remote')).toBe('drop');
    const job = (location: string) => ({ location, label: 'Design Systems Engineer' }) as Job;
    expect(isRemoteJob(job('Portland, OR, or Remote within Canada'))).toBe(true);
    expect(isRemoteJob(job('Remote or hybrid'))).toBe(true);
    expect(isRemoteJob(job('No remote'))).toBe(false);
    expect(isRemoteJob(job('On-site'))).toBe(false);
    expect(isRemoteRole(true)).toBe(true);
    expect(isRemoteRole(false, 'Remote (US only)')).toBe(true);
    expect(isRemoteRole(false, 'Hybrid (3 days)')).toBe(false);
  });
});

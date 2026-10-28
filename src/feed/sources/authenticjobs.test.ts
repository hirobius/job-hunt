import { describe, expect, it } from 'vitest';
import { authenticJobs, AUTHENTIC_JOBS_FEED, parseAuthenticJobs } from './authenticjobs';

// Built from WP Job Manager's feed shape (unverified live).
const FEED = `<rss version="2.0" xmlns:job_listing="https://wpjobmanager.com"><channel>
<item>
  <title>Design Systems Designer</title>
  <link>https://authenticjobs.com/job/12345/design-systems-designer/</link>
  <guid isPermaLink="false">https://authenticjobs.com/?post_type=job_listing&amp;p=12345</guid>
  <pubDate>Fri, 23 Oct 2026 16:00:00 +0000</pubDate>
  <description><![CDATA[<p>Grow our <em>design system</em>.</p>]]></description>
  <job_listing:location><![CDATA[Remote, US]]></job_listing:location>
  <job_listing:job_type><![CDATA[Contract]]></job_listing:job_type>
  <job_listing:company><![CDATA[Acme]]></job_listing:company>
</item>
<item><title>Onsite role</title><link>https://authenticjobs.com/job/2/</link>
  <job_listing:location>Portland, OR</job_listing:location></item>
</channel></rss>`;

describe('parseAuthenticJobs', () => {
  it('reads the role, company, place and type', () => {
    const [a, b] = parseAuthenticJobs(FEED);
    expect(a).toEqual({
      id: 'authenticjobs:https://authenticjobs.com/?post_type=job_listing&p=12345',
      source: 'authenticjobs',
      title: 'Design Systems Designer',
      company: 'Acme',
      url: 'https://authenticjobs.com/job/12345/design-systems-designer/',
      location: 'Remote, US',
      mode: 'remote',
      postedAt: '2026-10-23T16:00:00.000Z',
      text: 'Job type: Contract\nGrow our design system.',
    });
    expect(b).toMatchObject({ location: 'Portland, OR', company: '' });
    expect(b.mode).toBeUndefined();
  });

  it('reads one fixed URL', () => {
    expect(authenticJobs.upstream()).toEqual([AUTHENTIC_JOBS_FEED]);
  });
});

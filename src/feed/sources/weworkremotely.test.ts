import { describe, expect, it } from 'vitest';
import { parseWwr, weWorkRemotely, WWR_FEEDS } from './weworkremotely';

// Built from the feed's documented item shape (unverified live).
const FEED = `<rss version="2.0"><channel><title>We Work Remotely: Design Jobs</title>
<item>
  <title>Acme Inc: Senior Product Designer: Design Systems</title>
  <region>Anywhere in the World</region>
  <category>Design</category>
  <type>Full-Time</type>
  <description>&lt;p&gt;Lead our &lt;strong&gt;design system&lt;/strong&gt;.&lt;/p&gt;</description>
  <pubDate>Mon, 26 Oct 2026 12:00:00 +0000</pubDate>
  <guid>https://weworkremotely.com/remote-jobs/acme-inc-senior-product-designer</guid>
  <link>https://weworkremotely.com/remote-jobs/acme-inc-senior-product-designer</link>
</item>
<item><title>No company</title><link>https://weworkremotely.com/remote-jobs/2</link></item>
<item><title>Bad: link</title><link>data:text/html,x</link></item>
</channel></rss>`;

describe('parseWwr', () => {
  it('splits "Company: Role" on the first colon and keeps their link', () => {
    const [a, b, ...rest] = parseWwr(FEED);
    expect(a).toEqual({
      id: 'wwr:https://weworkremotely.com/remote-jobs/acme-inc-senior-product-designer',
      source: 'wwr',
      title: 'Senior Product Designer: Design Systems',
      company: 'Acme Inc',
      url: 'https://weworkremotely.com/remote-jobs/acme-inc-senior-product-designer',
      location: 'Anywhere in the World',
      mode: 'remote',
      postedAt: '2026-10-26T12:00:00.000Z',
      text: 'Job type: Full-Time\nLead our design system.',
    });
    expect(b).toMatchObject({ title: 'No company', company: '', location: '', text: '' });
    expect(rest).toEqual([]);
  });

  it('reads the Design and Front-End Programming feeds', () => {
    expect(weWorkRemotely.upstream()).toEqual(WWR_FEEDS);
    expect(WWR_FEEDS).toHaveLength(2);
  });
});

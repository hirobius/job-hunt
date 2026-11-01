import { describe, expect, it } from 'vitest';
import { parseRss, rawTag, rssDate } from './rss';

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>
<item>
  <title>Design Systems Lead &amp; Ops at Acme</title>
  <link>https://example.org/jobs/1</link>
  <guid isPermaLink="true">https://example.org/jobs/1</guid>
  <pubDate>Tue, 27 Oct 2026 20:25:00 +0000</pubDate>
  <description>&lt;p&gt;Own the &lt;b&gt;design system&lt;/b&gt;.&lt;/p&gt;</description>
  <region>Anywhere in the World</region>
  <linkedin>https://linkedin.example/acme</linkedin>
</item>
<item>
  <title><![CDATA[Staff Designer]]></title>
  <link>https://example.org/jobs/2</link>
  <description><![CDATA[<p>Tokens &amp; components</p><script>x()</script>]]></description>
  <job_listing:company>Beta</job_listing:company>
</item>
</channel></rss>`;

describe('parseRss', () => {
  it('reads every item as plain text', () => {
    const [a, b] = parseRss(FEED);
    expect(a).toMatchObject({
      title: 'Design Systems Lead & Ops at Acme',
      link: 'https://example.org/jobs/1',
      guid: 'https://example.org/jobs/1',
      pubDate: '2026-10-27T20:25:00.000Z',
      description: 'Own the design system.',
    });
    expect(a.tag('region')).toBe('Anywhere in the World');
    expect(b).toMatchObject({ title: 'Staff Designer', guid: '', pubDate: undefined });
    expect(b.description).toBe('Tokens & components');
    expect(b.tag('job_listing:company')).toBe('Beta');
    expect(b.tag('region')).toBe('');
  });

  it('never mistakes a longer tag for a shorter one', () => {
    expect(rawTag('<linkedin>x</linkedin><link>y</link>', 'link')).toBe('y');
  });

  it('reads nothing from junk', () => {
    expect(parseRss('')).toEqual([]);
    expect(parseRss('<html>blocked</html>')).toEqual([]);
  });
});

describe('rssDate', () => {
  it('takes RFC 822 and ISO, and drops what it cannot read', () => {
    expect(rssDate('Mon, 26 Oct 2026 21:10:00 +0000')).toBe('2026-10-26T21:10:00.000Z');
    expect(rssDate('2026-10-26T21:10:00Z')).toBe('2026-10-26T21:10:00.000Z');
    expect(rssDate('soon')).toBeUndefined();
    expect(rssDate('')).toBeUndefined();
  });
});

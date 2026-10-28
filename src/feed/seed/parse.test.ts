import { describe, expect, it } from 'vitest';
import {
  companyFromListing,
  companySite,
  hnThreads,
  mergeCandidates,
  parseAdele,
  parseAwesome,
  parseDsjFeed,
  parseDsjSitemap,
  parseGithubSearch,
  parseHnHits,
  registrableDomain,
  slugsFor,
} from './parse';

describe('domains', () => {
  it.each([
    ['https://spectrum.adobe.com/page', 'adobe.com'],
    ['www.bbc.co.uk', 'bbc.co.uk'],
    ['https://atlassian.design', 'atlassian.design'],
    ['http://127.0.0.1:8080', ''],
    ['not a url', ''],
  ])('%s → %s', (url, want) => expect(registrableDomain(url)).toBe(want));

  it('a shared host, an ATS or a public body names no company', () => {
    expect(companySite('https://dropbox.github.io/scooter')).toBe('');
    expect(companySite('https://jobs.ashbyhq.com/acme')).toBe('');
    expect(companySite('https://design-system.service.gov.uk')).toBe('');
    expect(companySite('https://designsystem.digital.gov')).toBe('');
    expect(companySite('https://polaris.shopify.com')).toBe('https://shopify.com');
  });
});

describe('names and slugs', () => {
  it.each([
    ['Backpack (Skyscanner)', 'Skyscanner'],
    ['Atlassian Design System', 'Atlassian'],
    ['Shopify Polaris', 'Shopify Polaris'],
    ['GitLab Pajamas UI Kit', 'GitLab Pajamas'],
  ])('%s → %s', (listed, want) => expect(companyFromListing(listed)).toBe(want));

  it("tries the website's own label first, then the name's slugs, at most 3", () => {
    expect(slugsFor('Shopify Polaris', 'https://shopify.com')).toEqual([
      'shopify',
      'shopify-polaris',
      'shopifypolaris',
    ]);
  });
});

describe('Adele', () => {
  it('keeps companies, drops public bodies, takes the site only when it is the company’s', () => {
    const out = parseAdele({
      companies: [
        { name: 'Dropbox', site: 'http://dropbox.github.io/scooter/index.html' },
        { name: 'Shopify', site: 'https://polaris.shopify.com' },
        { name: 'GOV.UK', site: 'https://design-system.service.gov.uk' },
      ],
    });
    expect(out.map((c) => [c.name, c.website])).toEqual([
      ['Dropbox', ''],
      ['Shopify', 'https://shopify.com'],
    ]);
    expect(out[0].evidence).toEqual([
      { source: 'adele', url: 'http://dropbox.github.io/scooter/index.html' },
    ]);
  });
});

describe('awesome-design-systems', () => {
  // Rows as the README writes them (2026-10-28).
  const README = `| | Components |
| --- | :---: |
| [Adobe Spectrum](https://spectrum.adobe.com)  |     👍     |
| [Backpack (Skyscanner)](https://skyscanner.design/) |     👍     |
| [Aurora (Government of Canada)](https://design.gccollab.ca/) |  👍 |
| [Basis Design System](https://basis.now.sh) | 👍 |
Not a row [Link](https://example.com)`;

  it('reads one company per table row, the parenthetical as the company', () => {
    expect(parseAwesome(README).map((c) => [c.name, c.website, c.slugs[0]])).toEqual([
      ['Adobe Spectrum', 'https://adobe.com', 'adobe'],
      ['Skyscanner', 'https://skyscanner.design', 'skyscanner'],
      ['Basis', '', 'basis'],
    ]);
  });
});

describe('designsystems.jobs', () => {
  it('the sitemap gives each company slug and the job titles under it', () => {
    const xml = `<urlset>
<url><loc>https://designsystems.jobs/companies</loc></url>
<url><loc>https://designsystems.jobs/companies/pennylane</loc></url>
<url><loc>https://designsystems.jobs/companies/pennylane/design-system-designer</loc></url>
<url><loc>https://designsystems.jobs/companies/get-your-guide</loc></url>
<url><loc>https://designsystems.jobs/disclaimer</loc></url></urlset>`;
    const out = parseDsjSitemap(xml);
    expect(out.map((c) => [c.name, c.slugs, c.titles])).toEqual([
      ['Pennylane', ['pennylane'], ['design system designer']],
      ['Get Your Guide', ['get-your-guide', 'getyourguide'], []],
    ]);
  });

  it('the feed gives the spelled name and the role', () => {
    const xml = `<rss><channel><title>Design systems jobs</title>
<item><title>Frontend Engineer - Design Systems at Mercury</title><link>https://designsystems.jobs/companies/mercury/frontend-engineer</link></item>
<item><title>Graphics and UI Designer in the Design System team at H&amp;M Group</title><link>https://designsystems.jobs/companies/hm-group/x</link></item>
</channel></rss>`;
    expect(parseDsjFeed(xml).map((c) => [c.name, c.slugs[0], c.titles])).toEqual([
      ['Mercury', 'mercury', ['Frontend Engineer - Design Systems']],
      ['H&M Group', 'hm-group', ['Graphics and UI Designer in the Design System team']],
    ]);
  });
});

describe('Hacker News', () => {
  it('picks the newest Who is hiring threads', () => {
    const listing = {
      hits: [
        {
          objectID: '1',
          title: 'Ask HN: Who is hiring? (September 2026)',
          created_at: '2026-09-01',
        },
        {
          objectID: '2',
          title: 'Ask HN: Who wants to be hired? (October 2026)',
          created_at: '2026-10-01',
        },
        { objectID: '3', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01' },
      ],
    };
    expect(hnThreads(listing, 5)).toEqual(['3', '1']);
  });

  it('takes the company of top-level posts that name a design system, its site and its board', () => {
    const body = {
      hits: [
        {
          objectID: '11',
          parent_id: 99,
          comment_text:
            'Higharc (<a href="https://higharc.com">higharc.com</a>) | Design Systems Engineer | Remote<p>Apply: <a href="https://jobs.ashbyhq.com/higharc/123">jobs.ashbyhq.com/higharc</a>',
        },
        {
          objectID: '12',
          parent_id: 99,
          comment_text:
            'Bloomberg | Senior Engineer, design system | NYC<p><a href="https://bloomberg.avature.net/x">apply</a>',
        },
        { objectID: '13', parent_id: 99, comment_text: 'Acme | Backend | Remote<p>No match here' },
        { objectID: '14', parent_id: 11, comment_text: 'Reply | about our design system' },
      ],
    };
    const out = parseHnHits(body, '99');
    expect(out.map((c) => [c.name, c.website, c.linked])).toEqual([
      ['Higharc', 'https://higharc.com', [{ kind: 'ashby', slug: 'higharc' }]],
      ['Bloomberg', '', []],
    ]);
    expect(out[0].evidence[0].url).toBe('https://news.ycombinator.com/item?id=11');
  });
});

describe('GitHub', () => {
  it('organisations only, with their homepage when it is their own', () => {
    const body = {
      items: [
        {
          html_url: 'https://github.com/Shopify/polaris',
          homepage: 'https://polaris.shopify.com',
          owner: { login: 'Shopify', type: 'Organization' },
        },
        { html_url: 'https://github.com/someone/ds', owner: { login: 'someone', type: 'User' } },
      ],
    };
    expect(parseGithubSearch(body).map((c) => [c.name, c.website, c.slugs[0]])).toEqual([
      ['Shopify', 'https://shopify.com', 'shopify'],
    ]);
  });
});

describe('mergeCandidates', () => {
  it('one row per company: by website, else by name; evidence, slugs and boards pooled', () => {
    const merged = mergeCandidates([
      ...parseAdele({ companies: [{ name: 'Shopify', site: 'https://polaris.shopify.com' }] }),
      ...parseGithubSearch({
        items: [
          {
            html_url: 'https://github.com/Shopify/polaris',
            homepage: 'https://shopify.dev',
            owner: { login: 'Shopify', type: 'Organization' },
          },
        ],
      }),
      ...parseDsjSitemap('<loc>https://designsystems.jobs/companies/shopify</loc>'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].website).toBe('https://shopify.com');
    expect(merged[0].evidence.map((e) => e.source)).toEqual(['adele', 'github', 'dsjobs']);
  });

  it('two companies sharing a name but not a website stay apart', () => {
    const merged = mergeCandidates([
      ...parseAdele({ companies: [{ name: 'Spectrum', site: 'https://spectrum.adobe.com' }] }),
      ...parseAdele({ companies: [{ name: 'Spectrum', site: 'https://spectrum.chat' }] }),
    ]);
    expect(merged).toHaveLength(2);
  });
});

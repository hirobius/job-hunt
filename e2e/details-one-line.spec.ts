// A job's Details (Figma Flows, steps 3 and 4, 2026-11-19): with a long company name and a long
// posting domain, Company and Link each stay on one line, cut with an ellipsis inside the panel;
// the whole text is the line's title, and on a phone each link keeps its 44px target.
// Before: Company wrapped onto 2-3 lines (its 44px phone target then lay over Link's), and the
// domain was cut mid-word at the panel's edge with no ellipsis (the link is an inline-block, so
// the ellipsis on its box never applied).
import { test, expect } from './fixtures';

const JOB = {
  url: 'https://careers.extraordinarily-long-company-name-holdings-international.example.com/jobs/1',
  label: 'Senior Design Systems Designer',
  company: 'Extraordinarily Long Company Name Holdings International',
  status: 'Saved',
  added: '2026-11-18T00:00:00.000Z',
};

for (const width of [390, 1440]) {
  test(`Details at ${width}: a long Company and Link each stay on one line, with an ellipsis`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((job) => {
      if (!localStorage.getItem('rjb_shortlist'))
        localStorage.setItem('rjb_shortlist', JSON.stringify([job]));
    }, JOB);
    await page.goto('/#/apply');
    const list = page.locator('.rjb-details-list dl');
    await expect(list).toBeVisible();
    const rows = await list.evaluate((dl) => {
      const box = dl.getBoundingClientRect();
      return [...dl.querySelectorAll('dd')].map((dd) => {
        const a = dd.querySelector('a')!;
        const text = (a.querySelector('.rjb-link-line') ?? a) as HTMLElement;
        const lh = parseFloat(getComputedStyle(text).lineHeight);
        const r = a.getBoundingClientRect();
        return {
          name: text.textContent,
          title: text.title,
          // A phone's 44px target (the rows sit one target apart, base.css).
          target: innerWidth < 640 ? r.height >= 43.5 : true,
          lines: Math.round(text.getBoundingClientRect().height / lh),
          inside: r.right <= box.right + 0.5,
          ellipsis:
            getComputedStyle(text).textOverflow === 'ellipsis' &&
            text.scrollWidth > text.clientWidth,
        };
      });
    });
    expect(rows).toEqual([
      {
        name: JOB.company,
        title: JOB.company,
        target: true,
        lines: 1,
        inside: true,
        ellipsis: true,
      },
      {
        name: new URL(JOB.url).hostname,
        title: new URL(JOB.url).hostname,
        target: true,
        lines: 1,
        inside: true,
        ellipsis: true,
      },
    ]);
  });
}

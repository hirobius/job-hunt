import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { loadPostingBody, resetPostingBodies } from './feed/postingBody';

const LONG = 'We build the design system. '.repeat(120); // ~3,400 characters
const HTML = `<p><strong>ABOUT RAMP</strong></p><p>${LONG}</p><h2>ABOUT THE ROLE</h2><ul><li>Own the tokens</li><li>Ship the docs</li></ul>`;
const BOARD = { jobs: [{ id: 'j1', descriptionHtml: HTML }] };

vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  liveFetchJson: vi.fn(async (url: string) => {
    if (url === 'https://api.ashbyhq.com/posting-api/job-board/ramp') return BOARD;
    throw new Error('offline');
  }),
}));

// The Ashby posting as Find holds it after an auto-scan: its body cut at 1500 characters.
const cut = {
  id: 'ashby:ramp:j1',
  url: 'https://jobs.ashbyhq.com/ramp/j1',
  company: 'Ramp',
  text: LONG.slice(0, 1500),
};

afterEach(resetPostingBodies);

describe('loadPostingBody', () => {
  it('reads the full HTML for a cut Ashby body', async () => {
    const fetchJson = vi.fn(async () => BOARD);
    expect(await loadPostingBody(cut, fetchJson)).toEqual({ html: HTML.trim() });
  });

  it('reads Greenhouse single jobs and Lever postings', async () => {
    const gh = vi.fn(async () => ({ content: '&lt;p&gt;Full&lt;/p&gt;' }));
    expect(
      await loadPostingBody({ id: 'greenhouse:acme:7', url: 'https://x.test', text: '' }, gh),
    ).toEqual({
      html: '<p>Full</p>',
    });
    expect(gh).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/acme/jobs/7');
    const lever = vi.fn(async () => ({
      description: '<p>Intro</p>',
      lists: [{ text: 'You will', content: '<li>Build</li>' }],
      additional: '<p>Bye</p>',
    }));
    const r = await loadPostingBody(
      { id: 'lever:acme:abc', url: 'https://jobs.eu.lever.co/acme/abc', text: '' },
      lever,
    );
    expect(lever).toHaveBeenCalledWith('https://api.eu.lever.co/v0/postings/acme/abc?mode=json');
    expect(r).toEqual({ html: '<p>Intro</p><h3>You will</h3><ul><li>Build</li></ul><p>Bye</p>' });
  });

  it('keeps the held text when the source has no body or the read fails', async () => {
    const fail = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await loadPostingBody({ id: 'hn:1', url: 'https://x.test', text: 'Hi' }, fail)).toEqual({
      text: 'Hi',
    });
    expect(await loadPostingBody({ ...cut, id: 'ashby:ramp:zz' }, fail)).toEqual({
      text: cut.text,
    });
  });
});

describe('PostingDescription', () => {
  it('shows the full description with its structure and no ellipsis', async () => {
    const { default: PostingDescription } = await import('./PostingDescription');
    const { container } = render(<PostingDescription posting={cut} />);
    expect(
      await screen.findByRole('heading', { level: 3, name: 'About the role' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'About Ramp' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Own the tokens',
      'Ship the docs',
    ]);
    const text = container.textContent ?? '';
    expect(text).not.toContain('…');
    expect(text).toContain(LONG.trim());
    expect(text).not.toMatch(/ABOUT/);
  });
});

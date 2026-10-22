// The one "open the posting" control beside a saved job's title (Adrian 2026-10-22: anywhere a
// job is listed, its posting is one tap away). Tested through what a user meets: a link, its
// name, where it goes, and that it opens a new tab.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { JobPostingTitle, PostingLink, PostingTitle } from './PostingLink';

afterEach(cleanup);

const URL = 'https://acme.example/jobs/1';

describe('PostingLink', () => {
  it('is a link to the posting that opens in a new tab', () => {
    render(<PostingLink url={URL} title="Design Engineer" company="Acme" />);
    const link = screen.getByRole('link', { name: 'Open posting for Design Engineer at Acme' });
    expect(link).toHaveAttribute('href', URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('names the job as far as it knows it', () => {
    render(
      <>
        <PostingLink url={URL} title="Design Engineer" />
        <PostingLink url={URL} company="Acme" />
        <PostingLink url={URL} title="  " company=" " />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Open posting for Design Engineer' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open posting at Acme' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open posting' })).toBeTruthy();
  });

  it('says what it does in a tooltip', async () => {
    render(<PostingLink url={URL} title="Design Engineer" company="Acme" />);
    screen.getByRole('link').focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open posting');
  });

  it('renders nothing without a web address', () => {
    const { container } = render(
      <>
        <PostingLink url="" title="Design Engineer" />
        <PostingLink url={undefined} title="Design Engineer" />
        {/* A restored backup could carry anything: never render a script URL as a link. */}
        <PostingLink url="javascript:alert(1)" title="Design Engineer" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PostingTitle', () => {
  it('puts the posting link right after the title, beside it and never inside it', () => {
    render(
      <PostingTitle url={URL} title="Design Engineer" company="Acme">
        <a href="#/queue/1">Design Engineer</a>
      </PostingTitle>,
    );
    const title = screen.getByRole('link', { name: 'Design Engineer' });
    const posting = screen.getByRole('link', { name: 'Open posting for Design Engineer at Acme' });
    expect(title.compareDocumentPosition(posting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.contains(posting)).toBe(false);
  });

  it('is the title alone without a web address', () => {
    render(
      <PostingTitle url="mailto:jobs@acme.example" title="Design Engineer">
        <span>Design Engineer</span>
      </PostingTitle>,
    );
    expect(screen.getByText('Design Engineer')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('names a saved job by its title and company', () => {
    render(
      <JobPostingTitle job={{ url: URL, label: 'Welder', company: 'Zenith', status: 'Saved' }}>
        <span>Welder</span>
      </JobPostingTitle>,
    );
    expect(screen.getByRole('link', { name: 'Open posting for Welder at Zenith' })).toHaveAttribute(
      'href',
      URL,
    );
  });
});

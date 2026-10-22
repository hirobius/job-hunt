// The one "open the posting" control beside a saved job's title (Adrian 2026-10-22: anywhere a
// job is listed, its posting is one tap away). A saved job's title opens its page in the app, so
// the posting gets its own quiet icon link right after the title: the Pipeline table and cards,
// the agenda rows, the Company page, Recently removed and the job page's header all use this one.
// It is a sibling of the title link, never inside it (no link in a link); PostingTitle lays the two
// out, and the job rail puts it beside each row's link (hds-gaps/NavListActionItem). Unsaved
// openings (Live postings, team roles, tiles) have no page of their own: their title is the link.
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Box, Button, Icon, Stack, Tooltip as HdsTooltip } from '@hirobius/design-system';
import { postingOf } from './jobRow';
import { httpUrl } from './feed/targets';
import type { Job } from './types';

/** "Open posting for Design Engineer at Acme", with what is known when a part is missing. */
function postingLinkLabel(title?: string, company?: string): string {
  const t = title?.trim();
  const c = company?.trim();
  return ['Open posting', t && `for ${t}`, c && `at ${c}`].filter(Boolean).join(' ');
}

interface PostingLinkProps {
  url: string | undefined;
  title?: string;
  company?: string;
  /** `md` beside the job page's title; rows use `sm`. Both are 40px on a phone (base.css). */
  size?: 'sm' | 'md';
}

export function PostingLink({ url, title, company, size = 'sm' }: PostingLinkProps) {
  // Only a web address becomes a link: a restored backup could carry anything.
  if (!httpUrl(url)) return null;
  const label = postingLinkLabel(title, company);
  return (
    <HdsTooltip>
      <HdsTooltip.Trigger asChild>
        <Button
          size={size}
          variant="tertiary"
          iconOnly
          label={label}
          className={size === 'md' ? 'rjb-posting-link rjb-posting-link-md' : 'rjb-posting-link'}
          asChild
        >
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
            <Icon icon={ExternalLink} />
          </a>
        </Button>
      </HdsTooltip.Trigger>
      <HdsTooltip.Content>Open posting</HdsTooltip.Content>
    </HdsTooltip>
  );
}

/** A saved job's posting link: its title and company name the link. */
export function JobPostingLink({ job, size }: { job: Job; size?: 'sm' | 'md' }) {
  return <PostingLink {...postingOf(job)} size={size} />;
}

/**
 * A title with its posting link right after it, on the title's line: every list of saved jobs and
 * the job page's header lay the two out with this. The title shrinks and wraps anywhere (and the
 * row can shrink inside another row, `.rjb-posting-title`), so a long unbroken title wraps beside
 * the link instead of running under it or pushing it out of view (QA 2026-10-22).
 */
export function PostingTitle({ children, ...link }: PostingLinkProps & { children: ReactNode }) {
  return (
    <Stack direction="row" gap="px4" align="center" className="rjb-posting-title">
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
      <PostingLink {...link} />
    </Stack>
  );
}

/** PostingTitle for a saved job. */
export function JobPostingTitle({
  job,
  size,
  children,
}: {
  job: Job;
  size?: 'sm' | 'md';
  children: ReactNode;
}) {
  return (
    <PostingTitle {...postingOf(job)} size={size}>
      {children}
    </PostingTitle>
  );
}

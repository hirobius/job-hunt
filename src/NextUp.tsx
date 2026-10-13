// "Next up" on the Tracker: the follow-ups that are due or coming, as shortcuts to each job page.
import { Badge, Disclosure, InlineLink, Stack, Text } from '@hirobius/design-system';
import { prettyTitle, useJobs } from './store';
import { jobHref } from './jobRoute';
import { nextUpItems } from './trackerCounts';

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

/** "Next up": up to three due or upcoming follow-ups, each a shortcut to the job page. */
export function NextUp() {
  const jobs = useJobs();
  const items = nextUpItems(jobs);
  if (items.length === 0) return null;
  return (
    <section aria-label="Next up">
      <Disclosure variant="nav" label="Next up" defaultOpen>
        <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map(({ job, due, daysUntil }) => (
            <li
              key={job.url}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                columnGap: 'var(--primitive-space-3)',
                alignItems: 'baseline',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', ...oneLine }}>
                  <InlineLink href={jobHref(job.url)}>
                    {job.label || prettyTitle(job.url)}
                  </InlineLink>
                </span>
                <Text
                  variant="caption"
                  as="span"
                  style={{ display: 'block', ...muted, ...oneLine }}
                >
                  Follow up{job.company ? ` \u2014 ${job.company}` : ''}
                </Text>
              </span>
              {due ? (
                <Badge tone="warning">Overdue</Badge>
              ) : (
                <Text variant="caption" as="span" style={muted}>
                  In {daysUntil}d
                </Text>
              )}
            </li>
          ))}
        </Stack>
      </Disclosure>
    </section>
  );
}

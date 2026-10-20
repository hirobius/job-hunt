// Companies' inline roles (a team's matching openings, saved in one tap) and the dream
// star, shared by the team rows and the dream companies section.
import { Badge, Box, Button, Icon, InlineLink, Stack, Text } from '@hirobius/design-system';
import { Star } from 'lucide-react';
import { addJobDetailed, dedupKey, useJobs } from './store';
import { notifySaved } from './saveNotice';
import { jobFieldsFor } from './feed/toJob';
import type { Role } from './feed/teamRoles';
import { dreamKey, starDream, unstarDream, useDreams } from './feed/dreams';
import type { Board } from './feed/sources/ats';
import { listStyle } from './outreachShared';

/** A team's matching roles. Save adds one to the Pipeline and raises the shared save notice
 *  (saveNotice.ts: Open, Undo). The title links out: the only step that leaves the app is Apply. */
export function RoleList({
  company,
  roles,
  newIds,
  label = `Open roles at ${company}`,
}: {
  company: string;
  roles: Role[];
  newIds?: Set<string>;
  /** The list's accessible name (a second list on one row needs its own). */
  label?: string;
}) {
  const jobs = useJobs();
  const savedKeys = new Set(jobs.map((j) => dedupKey(j.url)));
  const save = (r: Role) => {
    const fields = jobFieldsFor(r, r.term, 'Teams');
    const url = addJobDetailed(r.url, fields);
    if (url) notifySaved([url], fields.label);
  };
  return (
    <ul aria-label={label} style={listStyle}>
      {roles.map((r) => {
        const saved = savedKeys.has(dedupKey(r.url));
        return (
          <li key={r.id}>
            {/* No wrap: the title column shrinks so Save sits on the right of every role, the
                same at 390 as at 1440 (PR #257 review). */}
            <Stack direction="row" gap="xs" align="center" justify="space-between">
              <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
                <Stack gap="px4">
                  <Stack direction="row" gap="xs" align="center" wrap="wrap">
                    <Text variant="ui" as="span">
                      <InlineLink href={r.url}>{r.title}</InlineLink>
                    </Text>
                    {newIds?.has(r.id) && <Badge tone="info">New</Badge>}
                  </Stack>
                  {r.location && (
                    <Text variant="caption" tone="secondary">
                      {r.location}
                    </Text>
                  )}
                </Stack>
              </Box>
              <Button
                size="sm"
                variant="secondary"
                disabled={saved}
                aria-label={`${saved ? 'Saved' : 'Save'} ${r.title}`}
                onClick={() => save(r)}
              >
                {saved ? 'Saved' : 'Save'}
              </Button>
            </Stack>
          </li>
        );
      })}
    </ul>
  );
}

/** Star or unstar a company as a dream company on the track. */
export function DreamStar({
  categoryId,
  company,
  website,
  board,
}: {
  categoryId: string;
  company: string;
  website?: string;
  board?: Board;
}) {
  const dreams = useDreams(categoryId);
  const key = dreamKey(company);
  const on = dreams.some((d) => d.key === key);
  return (
    <Button
      size="sm"
      variant={on ? 'secondary' : 'tertiary'}
      iconOnly
      iconLeft={<Icon icon={Star} />}
      label={on ? `Unstar ${company}` : `Star ${company} as a dream company`}
      onClick={() =>
        on ? unstarDream(categoryId, key) : starDream(categoryId, { company, website, board })
      }
    />
  );
}

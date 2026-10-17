// The Companies tool's inline roles (a team's matching openings, saved in one tap) and the dream
// star, shared by the team rows, the dream companies section and the By company view.
import { useState } from 'react';
import { Badge, Button, Icon, InlineLink, Stack, Text, useToast } from '@hirobius/design-system';
import { Star } from 'lucide-react';
import { addJobDetailed, dedupKey, removeJob, useJobs } from './store';
import { jobFieldsFor } from './feed/toJob';
import type { Role } from './feed/teamRoles';
import { dreamKey, starDream, unstarDream, useDreams } from './feed/dreams';
import type { Board } from './feed/sources/ats';
import { SECONDARY } from './hds-gaps/tone';
import { listStyle } from './outreachShared';

/** A team's matching roles. Save adds one to the Pipeline; Undo (here, since an HDS toast has no
 *  action slot) takes it back out. The title links out: the only step that leaves the app is Apply. */
export function RoleList({
  company,
  roles,
  newIds,
}: {
  company: string;
  roles: Role[];
  newIds?: Set<string>;
}) {
  const { toast } = useToast();
  const jobs = useJobs();
  const savedKeys = new Set(jobs.map((j) => dedupKey(j.url)));
  // Saved here this visit: role id → the stored URL, for Undo.
  const [mine, setMine] = useState<Record<string, string>>({});
  const save = (r: Role) => {
    const fields = jobFieldsFor(r, r.term, 'Companies');
    const url = addJobDetailed(r.url, fields);
    if (!url) return;
    setMine((m) => ({ ...m, [r.id]: url }));
    toast({ title: 'Added to Pipeline', description: fields.label, tone: 'success' });
  };
  const undo = (r: Role) => {
    removeJob(mine[r.id]);
    setMine(({ [r.id]: _gone, ...rest }) => rest);
  };
  return (
    <ul aria-label={`Open roles at ${company}`} style={listStyle}>
      {roles.map((r) => {
        const saved = savedKeys.has(dedupKey(r.url));
        return (
          <li key={r.id}>
            <Stack direction="row" gap="xs" align="center" justify="space-between" wrap="wrap">
              <Stack gap="px4">
                <Stack direction="row" gap="xs" align="center" wrap="wrap">
                  <Text variant="ui" as="span">
                    <InlineLink href={r.url}>{r.title}</InlineLink>
                  </Text>
                  {newIds?.has(r.id) && <Badge tone="info">New</Badge>}
                </Stack>
                {r.location && (
                  <Text variant="caption" style={SECONDARY}>
                    {r.location}
                  </Text>
                )}
              </Stack>
              {saved && mine[r.id] ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Undo save: ${r.title}`}
                  onClick={() => undo(r)}
                >
                  Undo
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saved}
                  aria-label={`${saved ? 'Saved' : 'Save'} ${r.title}`}
                  onClick={() => save(r)}
                >
                  {saved ? 'Saved' : 'Save'}
                </Button>
              )}
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
      aria-pressed={on}
      onClick={() =>
        on ? unstarDream(categoryId, key) : starDream(categoryId, { company, website, board })
      }
    />
  );
}

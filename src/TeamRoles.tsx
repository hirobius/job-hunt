// Companies' inline roles (a team's matching openings, saved in one tap) and the dream
// star, shared by the team rows and the dream companies section.
import {
  Badge,
  Box,
  Button,
  Disclosure,
  Icon,
  InlineLink,
  Stack,
  Text,
} from '@hirobius/design-system';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { starClass } from './feedback';
import { addJobDetailed, dedupKey, useJobs } from './store';
import { notifySaved } from './saveNotice';
import { jobFieldsFor } from './feed/toJob';
import type { Role } from './feed/teamRoles';
import { roleTypeOf, roleTypeTag } from './feed/roleType';
import { saysDesignSystem } from './feed/mustInclude';
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
  typed = false,
}: {
  company: string;
  roles: Role[];
  newIds?: Set<string>;
  /** The list's accessible name (a second list on one row needs its own). */
  label?: string;
  /** Tag each role with its type (a design-systems track, feed/roleType.ts). */
  typed?: boolean;
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
        // "Design systems" only when the title says it (2026-10-23): a body that mentions the
        // design system does not make a Product Manager a design-systems role.
        const type = typed ? roleTypeOf(r) : 'other';
        const tag =
          type === 'design-systems' && !saysDesignSystem(r.title) ? '' : roleTypeTag(type);
        return (
          <li key={r.id}>
            {/* No wrap: the title column shrinks so Save sits on the right of every role, the
                same at 390 as at 1440 (PR #257 review). */}
            <Stack direction="row" gap="px8" align="center" justify="space-between">
              <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
                <Stack gap="px4">
                  <Stack direction="row" gap="px8" align="center" wrap="wrap">
                    <Text variant="ui" as="span">
                      <InlineLink href={r.url}>{r.title}</InlineLink>
                    </Text>
                    {newIds?.has(r.id) && <Badge tone="info">New</Badge>}
                    {tag && <Badge tone="neutral">{tag}</Badge>}
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

/** A company's engineering-heavy roles on a design-systems track: kept, not deleted, behind one
 *  quiet "N engineering-heavy roles" row (feed/roleType.ts). Nothing when there are none. */
export function FoldedRoles({ company, roles }: { company: string; roles: Role[] }) {
  if (roles.length === 0) return null;
  const n = roles.length;
  return (
    <Disclosure label={`${n} engineering-heavy ${n === 1 ? 'role' : 'roles'}`}>
      <RoleList
        company={company}
        roles={roles}
        typed
        label={`Engineering-heavy roles at ${company}`}
      />
    </Disclosure>
  );
}

/** Star or unstar a company as a dream company on the track. A quiet icon toggle that fills in
 *  place when on (aria-pressed carries the state; the name stays the same, so it isn't announced
 *  twice), never a bordered button. */
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
  // Pops on each toggle (#212); a star already on when the page opens holds still.
  const [touched, setTouched] = useState(false);
  return (
    <Button
      size="sm"
      variant="tertiary"
      iconOnly
      iconLeft={<Icon icon={Star} className={starClass(on, touched)} />}
      label={`Star ${company} as a dream company`}
      aria-pressed={on}
      onClick={() => {
        setTouched(true);
        if (on) unstarDream(categoryId, key);
        else starDream(categoryId, { company, website, board });
      }}
    />
  );
}

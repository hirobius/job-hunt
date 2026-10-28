// Today, the home page (simplify 2/9, #383; docs/specs/simplify.html design C): three panels in a
// fixed order, each with its count, one line and one way in. Review new opens Live postings until
// the Feed slice brings the deck (so no job breadth is lost), Apply opens Apply mode, Follow up
// opens the follow-up dialog on the most overdue job. The read model is today.ts; this lays it out.
import { useMemo } from 'react';
import { Button, Stack, Text } from '@hirobius/design-system';
import { Panel, PanelBody } from './PipelinePanel';
import { FollowUpButton } from './FollowUp';
import { MetaCaption } from './MetaCaption';
import { useJobs, jobIdOf } from './store';
import { linkTo, navigate, useRoute, withOrigin } from './route';
import { lastApplyJobId } from './tabMemory';
import { useCategories, useGroups, useTiles } from './curation/curationStore';
import { activeTrackId, applyLine, countSources, followUpLine, reviewLine, today } from './today';

const jobs$ = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

export default function Today() {
  const route = useRoute();
  const jobs = useJobs();
  const categories = useCategories();
  const groups = useGroups();
  const tiles = useTiles();
  // What Browse new postings reads: the active track's watched boards, plus the keyless feeds.
  const sources = useMemo(() => {
    const track = activeTrackId(categories);
    const live = new Set(
      groups.filter((g) => g.categoryId === track && !g.archived).map((g) => g.id),
    );
    return countSources(tiles.filter((t) => live.has(t.groupId)).map((t) => t.url));
  }, [categories, groups, tiles]);
  const now = new Date();
  // Until the Feed slice counts what is new, Review new knows its sources, not its count.
  const m = today(jobs, { newToday: null, sources }, now, lastApplyJobId());
  const followCount = m.followUp.due.length + m.followUp.waiting;

  return (
    <Stack gap="px24">
      <Stack gap="px4">
        <Text as="h2" variant="title">
          Today
        </Text>
        <MetaCaption
          items={[
            now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          ]}
        />
      </Stack>

      <Panel label="Review new" title="Review new">
        <PanelBody>
          <Stack gap="normal" align="start">
            <Text variant="caption" as="p" tone="secondary">
              {reviewLine(m.review)}
            </Text>
            {/* Every posting, as a list: the deck comes later, and never in place of this. */}
            <Button asChild variant="secondary">
              <a href={linkTo({ tab: 'discover', sub: 'live' }, route)}>Browse new postings</a>
            </Button>
          </Stack>
        </PanelBody>
      </Panel>

      <Panel
        label={`Apply (${m.apply.count})`}
        title="Apply"
        count={m.apply.count}
        countLabel={jobs$(m.apply.count)}
      >
        <PanelBody>
          <Stack gap="normal" align="start">
            <Text variant="caption" as="p" tone="secondary">
              {applyLine(m.apply.count)}
            </Text>
            <Button
              variant="primary"
              disabled={!m.apply.start}
              // Apply mode's Back (and its end) comes back here (return paths).
              onClick={() =>
                m.apply.start &&
                navigate(withOrigin({ tab: 'apply', sub: jobIdOf(m.apply.start.url) }, route))
              }
            >
              {m.apply.resumeAt > 0
                ? `Resume applying (${m.apply.resumeAt + 1} of ${m.apply.count})`
                : 'Start applying'}
            </Button>
          </Stack>
        </PanelBody>
      </Panel>

      <Panel
        label={`Follow up (${m.followUp.due.length} due)`}
        title="Follow up"
        count={m.followUp.due.length}
        countLabel={`${jobs$(m.followUp.due.length)} due`}
      >
        <PanelBody>
          <Stack gap="normal" align="start">
            <Text variant="caption" as="p" tone="secondary">
              {followUpLine(m.followUp, now)}
            </Text>
            {/* The most overdue first; Mark as sent moves the next one up. */}
            {m.followUp.due[0] ? (
              <FollowUpButton job={m.followUp.due[0]} />
            ) : (
              followCount > 0 && (
                <Button asChild variant="secondary">
                  <a href="#/queue">Open jobs</a>
                </Button>
              )
            )}
          </Stack>
        </PanelBody>
      </Panel>
    </Stack>
  );
}

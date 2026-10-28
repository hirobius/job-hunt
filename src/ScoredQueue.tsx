// The scored queue on the Pipeline (Muse Phase 1, 2026-10-24): what the sync stored for the
// signed-in user (src/tracks/postings.ts), the queue first (best score, then newest), each card
// saying why it is there ("Queued because: …"), then Review as its own bucket with a count. Save
// adds the posting to the Pipeline; Skip records it in Decided by posting (src/decided.ts), never
// its company, and Undo takes the skip back. Signed out, before the sync's tables exist, or with nothing stored, it
// shows nothing (empty sections hide).
import { useContext, useEffect, useState } from 'react';
import { Badge, Box, Button, Disclosure, InlineLink, Stack, Text } from '@hirobius/design-system';
import { CloudSyncContext } from './account/accountContext';
import { MetaCaption } from './MetaCaption';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { notifyRemoved, notifySaved } from './saveNotice';
import { httpUrl } from './httpUrl';
import { addJobDetailed, dedupKey, useJobs } from './store';
import { decided as decidedStore } from './decided';
import { loadScoredPostings, splitQueue, type StoredPosting } from './tracks/postings';
import { reasonsLine } from './tracks/scoreForTrack';

const SHOWN = 10;

type Loaded = { userId: string; rows: StoredPosting[] };

export default function ScoredQueue() {
  // Read softly: a Pipeline rendered without the account seam (a unit test) has no account.
  const sync = useContext(CloudSyncContext);
  const settled = sync?.settled ?? false;
  const user = sync?.user ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [more, setMore] = useState(false);
  const decided = decidedStore.use();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !settled) return;
    let alive = true;
    loadScoredPostings().then(
      (r) => alive && setLoaded({ userId, ...r }),
      // The tables not there yet, or offline: nothing to show, no nag.
      () => alive && setLoaded({ userId, rows: [] }),
    );
    return () => {
      alive = false;
    };
  }, [userId, settled]);

  if (!userId || loaded?.userId !== userId) return null;
  const { queue, review } = splitQueue(
    loaded.rows,
    new Set([...decided.values()].filter((d) => d.verdict === 'skipped').map((d) => d.fingerprint)),
  );
  if (!queue.length && !review.length) return null;

  const skip = (p: StoredPosting) => {
    const prev = decidedStore.get(p.fingerprint);
    decidedStore.set(p.fingerprint, 'skipped');
    notifyRemoved(`Skipped ${p.title}`, () => decidedStore.undo(p.fingerprint, prev));
  };

  const shown = more ? queue : queue.slice(0, SHOWN);
  return (
    <Panel
      label="Queued postings"
      title="Queued postings"
      count={queue.length}
      countLabel={`${queue.length} queued`}
      description="Scored on title + posting evidence, best first"
    >
      {queue.length > 0 && (
        <CardList label="Queued postings">
          {shown.map((p) => (
            <PostingCard key={p.id} p={p} onSkip={() => skip(p)} />
          ))}
        </CardList>
      )}
      {queue.length > SHOWN && !more && (
        <PanelBody>
          <Button variant="tertiary" size="sm" onClick={() => setMore(true)}>
            {`Show more (${queue.length - SHOWN})`}
          </Button>
        </PanelBody>
      )}
      {review.length > 0 && (
        <PanelBody>
          <Disclosure
            label={
              <Stack as="span" direction="row" gap="px8" align="center">
                Review
                <Badge count={review.length} label={`${review.length} held for review`} />
              </Stack>
            }
          >
            <CardList label="Held for review" inset="none">
              {review.map((p) => (
                <PostingCard key={p.id} p={p} onSkip={() => skip(p)} />
              ))}
            </CardList>
          </Disclosure>
        </PanelBody>
      )}
    </Panel>
  );
}

function PostingCard({ p, onSkip }: { p: StoredPosting; onSkip: () => void }) {
  const jobs = useJobs();
  const saved = jobs.some((j) => dedupKey(j.url) === dedupKey(p.url));
  const save = () => {
    const url = addJobDetailed(p.url, {
      label: p.title,
      company: p.company,
      location: p.location,
      note: `Found by the scorer · ${reasonsLine(p)}`,
      postedAt: p.postedAt,
    });
    if (url) notifySaved([url], p.title);
  };
  return (
    <ListCard>
      <Stack gap="px8">
        <Stack gap="px4">
          {/* Not saved yet, so no page in the app: the title is the posting link. */}
          <Text variant="body" as="h4" weight="bold" className="rjb-card-title">
            {httpUrl(p.url) ? <InlineLink href={p.url}>{p.title}</InlineLink> : p.title}
          </Text>
          <MetaCaption items={[p.company, p.location]} />
          {/* A reason can be one long pattern with no spaces: it breaks anywhere, never overflows. */}
          <Box sx={{ overflowWrap: 'anywhere' }}>
            <Text variant="caption" as="p" tone="secondary">
              {reasonsLine(p)}
            </Text>
          </Box>
        </Stack>
        <Stack direction="row" gap="px8" align="center">
          <Button
            size="sm"
            variant="secondary"
            disabled={saved}
            aria-label={`${saved ? 'Saved' : 'Save'} ${p.title}`}
            onClick={save}
          >
            {saved ? 'Saved' : 'Save'}
          </Button>
          <Button size="sm" variant="tertiary" aria-label={`Skip ${p.title}`} onClick={onSkip}>
            Skip
          </Button>
        </Stack>
      </Stack>
    </ListCard>
  );
}

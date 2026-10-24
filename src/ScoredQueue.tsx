// The scored queue on the Pipeline (Muse Phase 1, 2026-10-24): what the sync stored for the
// signed-in user (src/tracks/postings.ts), the queue first (best score, then newest), each card
// saying why it is there ("Queued because: …"), then Review as its own bucket with a count. Save
// adds the posting to the Pipeline; Skip records it with its reasons (the tuning loop) and Undo
// takes the skip back. Signed out, before the sync's tables exist, or with nothing stored, it
// shows nothing (empty sections hide).
import { useContext, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Disclosure,
  InlineLink,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { CloudSyncContext } from './account/accountContext';
import { MetaCaption } from './MetaCaption';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { notifyRemoved, notifySaved } from './saveNotice';
import { httpUrl } from './httpUrl';
import { addJobDetailed, dedupKey, useJobs } from './store';
import {
  loadScoredPostings,
  skipPosting,
  splitQueue,
  unskipPosting,
  type StoredPosting,
} from './tracks/postings';
import { reasonsLine } from './tracks/scoreForTrack';

const SHOWN = 10;

type Loaded = { userId: string; rows: StoredPosting[]; skipped: Set<number> };

export default function ScoredQueue() {
  // Read softly: a Pipeline rendered without the account seam (a unit test) has no account.
  const sync = useContext(CloudSyncContext);
  const settled = sync?.settled ?? false;
  const user = sync?.user ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [more, setMore] = useState(false);
  const { toast } = useToast();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !settled) return;
    let alive = true;
    loadScoredPostings().then(
      (r) => alive && setLoaded({ userId, ...r }),
      // The tables not there yet, or offline: nothing to show, no nag.
      () => alive && setLoaded({ userId, rows: [], skipped: new Set() }),
    );
    return () => {
      alive = false;
    };
  }, [userId, settled]);

  if (!userId || loaded?.userId !== userId) return null;
  const { queue, review } = splitQueue(loaded.rows, loaded.skipped);
  if (!queue.length && !review.length) return null;

  const setSkipped = (id: number, on: boolean) =>
    setLoaded((l) => {
      if (!l) return l;
      const skipped = new Set(l.skipped);
      if (on) skipped.add(id);
      else skipped.delete(id);
      return { ...l, skipped };
    });
  const skip = (p: StoredPosting) => {
    setSkipped(p.id, true);
    skipPosting(p).then(
      () =>
        notifyRemoved(`Skipped ${p.title}`, () => {
          setSkipped(p.id, false);
          unskipPosting(p.id).catch(() => {
            setSkipped(p.id, true);
            toast({ title: "Couldn't undo the skip. Try again.", tone: 'error' });
          });
        }),
      () => {
        setSkipped(p.id, false);
        toast({ title: "Couldn't skip that posting. Try again.", tone: 'error' });
      },
    );
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

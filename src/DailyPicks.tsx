// Daily picks on Today (2026-11-05): the scheduled run's hand-picked roles (src/picks.ts), above
// Review new. Each row: the title (the link out to the posting), the company, employee or
// contract, pay and posted day, the one-line why-it-fits, and the drafted note to the hiring manager
// behind one Disclosure row with Copy beside it. Save works like Review new's (Added to Apply ·
// To apply, Undo) and puts the draft note and the fit line in the Job's Notes; Skip hides the pick
// by posting fingerprint (the synced Decided store), with Undo. Hidden when there is nothing to show.
import { useEffect, useState } from 'react';
import { Banknote, Calendar, Plus } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
  Card,
  Icon,
  InlineLink,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { DisclosureRow } from './hds-gaps/DisclosureRow';
import { ItemList, ItemRow, Panel } from './PipelinePanel';
import { addJobDetailed, useJobs } from './store';
import { decided } from './decided';
import { collapseRow } from './feedback';
import { alreadyInApply, notifyRemoved, notifySaved, showNotice } from './saveNotice';
import { copyFilled } from './templateCopy';
import { loadPicks, openPicks, pickFacts, pickJobFields, shortDay, type DailyPick } from './picks';

type OpenPick = ReturnType<typeof openPicks>[number];

export default function DailyPicks({
  load = loadPicks,
}: {
  /** The read (tests pass their own). */
  load?: () => Promise<DailyPick[]>;
}) {
  const [picks, setPicks] = useState<DailyPick[]>([]);
  useEffect(() => {
    let live = true;
    // A failed read (offline, the table not there yet) shows nothing: the section hides.
    load().then(
      (p) => live && setPicks(p),
      () => live && setPicks([]),
    );
    return () => {
      live = false;
    };
  }, [load]);
  const jobs = useJobs();
  const skipped = decided.use();
  const open = openPicks(
    picks,
    jobs.map((j) => j.url),
    skipped,
  );
  if (!open.length) return null;
  const n = open.length;
  return (
    <Panel
      label={`Daily picks (${n})`}
      title="Daily picks"
      count={n}
      countLabel={`${n} ${n === 1 ? 'pick' : 'picks'}`}
      description={`Hand-picked ${shortDay(open[0].pickedOn)} · drafts only, nothing sent`}
    >
      <ItemList label="Daily picks">
        {open.map((p) => (
          <PickRow key={p.id || p.url} pick={p} />
        ))}
      </ItemList>
    </Panel>
  );
}

function PickRow({ pick: p }: { pick: OpenPick }) {
  const { toast } = useToast();
  const [noteOpen, setNoteOpen] = useState(false);
  const name = `${p.title}${p.company ? ` at ${p.company}` : ''}`;
  const [kind, pay, postedLine] = pickFacts(p);
  const copy = async () => {
    const r = await copyFilled(p.note);
    if (r.ok) toast({ title: 'Copied the note', description: name, tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };
  // The row collapses first, then the job is saved (a saved pick leaves the list).
  const save = (from: Element) =>
    collapseRow(from, () => {
      // A double Save is a no-op, with no second toast (#534).
      if (alreadyInApply(p.url)) return;
      const url = addJobDetailed(p.url, pickJobFields(p));
      if (!url) {
        showNotice({
          title: 'Couldn’t save that pick',
          description: 'Its link isn’t one a job can be saved under. Open it to apply.',
          actions: [],
        });
        return;
      }
      notifySaved([url], p.title);
    });
  const skip = (from: Element) =>
    collapseRow(from, () => {
      const prev = decided.get(p.fingerprint);
      decided.set(p.fingerprint, 'skipped');
      notifyRemoved(
        `Skipped “${p.title}”`,
        () => decided.undo(p.fingerprint, prev),
        'Only this pick is hidden.',
      );
    });
  return (
    <ItemRow label={name}>
      <Stack gap="px8">
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Stack gap="px4">
            <Text variant="body" as="h3" weight="bold" className="rjb-card-title">
              <InlineLink href={p.url}>{p.title}</InlineLink>
            </Text>
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              {p.company && (
                <Text variant="ui" as="span">
                  {p.company}
                </Text>
              )}
              <Badge tone={p.employment === 'contract' ? 'info' : 'neutral'}>{kind}</Badge>
            </Stack>
            {/* One fact per line, the icon on the first line (#616; 2026-11-12). */}
            <Card.Facts
              className="p-0"
              // Plain lines, not a list inside each card's list item (as FactLines was): a list of
              // cards counts only its cards.
              role="presentation"
              items={[
                { icon: Banknote, label: pay },
                { icon: Calendar, label: postedLine },
              ]}
            />
            {p.why && (
              <Text variant="caption" as="p">
                {p.why}
              </Text>
            )}
          </Stack>
        </Box>
        {p.note && (
          <DisclosureRow
            label="Draft note"
            preview={p.note}
            open={noteOpen}
            onOpenChange={setNoteOpen}
            actions={
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Copy note for ${name}`}
                onClick={copy}
              >
                Copy
              </Button>
            }
          >
            <Text variant="body" as="p" className="rjb-prewrap">
              {p.note}
            </Text>
          </DisclosureRow>
        )}
        <Stack direction="row" wrap="wrap" gap="tight" align="center">
          <Button
            size="sm"
            variant="primary"
            aria-label={`Save ${name}`}
            onClick={(e) => save(e.currentTarget)}
          >
            <Icon icon={Plus} />
            Save
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            aria-label={`Skip ${name}`}
            onClick={(e) => skip(e.currentTarget)}
          >
            Skip
          </Button>
        </Stack>
      </Stack>
    </ItemRow>
  );
}

// The track's title filter (#223, born as the wide sweep's list in #213): which titles are ticked,
// per track, synced. Live postings ranks and filters by them, and the ATS tool and big-board links
// search only them. It sits in Live postings' Calibrate control (`bare`); the ATS tool shows the
// ticked titles as chips only (rev-3 mock). The list starts as the track's own titles, all on
// (src/feed/sweepTitles.ts).
import { useState, type FormEvent } from 'react';
import {
  Box,
  Button,
  Checkbox as HdsCheckbox,
  Disclosure,
  Icon,
  Input as HdsInput,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { X } from 'lucide-react';
import {
  activeTitles,
  addTitle,
  MAX_SWEEP_ON,
  removeTitle,
  restoreTitle,
  setTitleOn,
  useSweep,
} from './feed/sweepTitles';
import { collapseRow, highlightNew, useHighlight } from './feedback';
import { notifyRemoved } from './saveNotice';

/** One title row: its tick box and its Remove X. A duplicate add asks for this row's flash
 *  (feedback's highlight, keyed by the title's spelling). */
function TitleRow({
  title,
  checked,
  onToggle,
  onRemove,
}: {
  title: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  onRemove: (from: Element) => void;
}) {
  const highlight = useHighlight<HTMLDivElement>(title);
  return (
    <Box as="li" ref={highlight}>
      {/* Every remove X lines up on the panel's right edge, not after its label. */}
      <Stack direction="row" gap="tight" align="center" justify="space-between">
        <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
          <HdsCheckbox label={title} checked={checked} onChange={onToggle} />
        </Box>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={X} />}
          label={`Remove title ${title}`}
          onClick={(e) => onRemove(e.currentTarget)}
        />
      </Stack>
    </Box>
  );
}

export function SweepTitlesEditor({
  categoryId,
  seed,
  defaultOpen = false,
  bare = false,
}: {
  categoryId: string;
  /** The track's own titles: the list until the first edit. */
  seed: string[];
  defaultOpen?: boolean;
  /** No disclosure of its own: for a host control that already is one (Calibrate). */
  bare?: boolean;
}) {
  const { toast } = useToast();
  const sweep = useSweep(categoryId, seed);
  const active = activeTitles(sweep);
  const [draft, setDraft] = useState('');
  const on = new Set(active.map((t) => t.toLowerCase()));

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    const outcome = addTitle(categoryId, seed, t);
    if (outcome === 'duplicate') {
      // Say so and flash the row that's already there, instead of silent nothing (#354).
      const existing = sweep.titles.find((x) => x.toLowerCase() === t.toLowerCase()) ?? t;
      highlightNew(existing);
      toast({ title: `${existing} is already in the list` });
    } else if (outcome === 'added-off') {
      toast({
        title: `Added, switched off: up to ${MAX_SWEEP_ON} titles can be on`,
        tone: 'warning',
      });
    }
    setDraft('');
  };
  const toggle = (t: string, next: boolean) => {
    if (!setTitleOn(categoryId, seed, t, next))
      toast({ title: `Up to ${MAX_SWEEP_ON} titles can be on at once`, tone: 'warning' });
  };
  /** Remove is soft (#212): the row collapses, then the notice offers Undo, which puts the
   *  title back in its place with its tick state (#354). */
  const remove = (t: string, from: Element) => {
    const at = sweep.titles.indexOf(t);
    const wasOff = !on.has(t.toLowerCase());
    collapseRow(from, () => {
      if (at < 0) return;
      removeTitle(categoryId, seed, t);
      notifyRemoved(`Removed “${t}”`, () => restoreTitle(categoryId, seed, t, at, wasOff));
    });
  };

  const body = (
    <Stack gap="normal">
      <Stack gap="xs">
        {/* Same label style as Calibrate's Search for and Saved searches (rev-3 J). */}
        {bare && (
          <Text variant="ui" as="span">
            Titles
          </Text>
        )}
        <Text variant="caption" as="span" tone="secondary">
          Postings and searches follow the titles you tick. Up to {MAX_SWEEP_ON} at once; saved for
          this track.
        </Text>
        {sweep.titles.length === 0 && (
          <Text variant="caption" as="span" tone="secondary">
            No titles yet. Add one below.
          </Text>
        )}
        <Box as="ul" aria-label="Titles" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {sweep.titles.map((t) => (
            <TitleRow
              key={t}
              title={t}
              checked={on.has(t.toLowerCase())}
              onToggle={(v) => toggle(t, v)}
              onRemove={(from) => remove(t, from)}
            />
          ))}
        </Box>
      </Stack>
      <Box as="form" onSubmit={onAdd} sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end' }}>
        <Box sx={{ flex: 1, maxWidth: 360, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            label="Add a title"
            placeholder="Job title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Box>
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>
          Add
        </Button>
      </Box>
    </Stack>
  );
  if (bare) return body;
  return (
    <Disclosure label={`Titles (${active.length})`} defaultOpen={defaultOpen}>
      {body}
    </Disclosure>
  );
}

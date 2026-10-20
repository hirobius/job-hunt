// The track's title filter (#223, born as the wide sweep's list in #213): which titles are ticked,
// per track, synced. Live postings ranks and filters by them, and the ATS tool and big-board links
// search only them. It sits in Live postings' Calibrate control (`bare`) and behind a "Titles (N)"
// disclosure on the ATS tool. The list starts as the track's own titles, all on
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
  setTitleOn,
  useSweep,
} from './feed/sweepTitles';

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
    if (!draft.trim()) return;
    addTitle(categoryId, seed, draft);
    setDraft('');
  };
  const toggle = (t: string, next: boolean) => {
    if (!setTitleOn(categoryId, seed, t, next))
      toast({ title: `Up to ${MAX_SWEEP_ON} titles can be on at once`, tone: 'warning' });
  };

  const body = (
    <Stack gap="xs">
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
          <Box as="li" key={t}>
            <Stack direction="row" gap="tight" align="center">
              <HdsCheckbox
                label={t}
                checked={on.has(t.toLowerCase())}
                onChange={(v) => toggle(t, v)}
              />
              <Button
                size="sm"
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={X} />}
                label={`Remove title ${t}`}
                onClick={() => removeTitle(categoryId, seed, t)}
              />
            </Stack>
          </Box>
        ))}
      </Box>
      <Box as="form" onSubmit={onAdd} sx={{ display: 'flex', gap: 'xs', alignItems: 'flex-end' }}>
        <Box sx={{ flex: 1, maxWidth: 360, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            label="Add a title"
            placeholder="Design technologist"
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

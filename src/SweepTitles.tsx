// The wide sweep's titles editor (#213): which titles one sweep searches, per track, synced. It sits
// behind a "Titles (N)" disclosure in Live postings, Title search and ATS search, never on the main
// surface. The list starts as the track's own titles, all on (src/feed/sweepTitles.ts).
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
}: {
  categoryId: string;
  /** The track's own titles: the list until the first edit. */
  seed: string[];
  defaultOpen?: boolean;
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

  return (
    <Disclosure label={`Titles (${active.length})`} defaultOpen={defaultOpen}>
      <Stack gap="xs">
        <Text variant="caption" as="span" tone="secondary">
          Each title that is on is searched in one go. Up to {MAX_SWEEP_ON} at once; saved for this
          track.
        </Text>
        {sweep.titles.length === 0 && (
          <Text variant="caption" as="span" tone="secondary">
            No titles yet. Add one below.
          </Text>
        )}
        <Box as="ul" aria-label="Sweep titles" sx={{ listStyle: 'none', m: 0, p: 0 }}>
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
    </Disclosure>
  );
}

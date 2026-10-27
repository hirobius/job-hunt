// The job page's Decks panel (#287): links to the decks sent for this role, each with an optional
// label and the day it was sent. Links only (no uploads); http(s) only. Every change goes through
// updateJob, so decks sync with the job, ride in Back up and fill the CSV's decks column. Remove is
// soft: the card collapses and a notice offers Undo, which puts the deck back in its place.
import { useState } from 'react';
import {
  Box,
  Button,
  Icon,
  InlineLink,
  Input,
  Stack,
  Switcher,
  Text,
} from '@hirobius/design-system';
import { Pencil, Plus, X } from 'lucide-react';
import { addDeck, removeDeck, restoreDeck, updateDeck, type DeckInput } from './decks';
import { dayLabel } from './dayLabel';
import { findJobByUrl, updateJob } from './store';
import { collapseRow } from './feedback';
import { notifyRemoved } from './saveNotice';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import type { Deck, Job } from './types';

/** The deck's name: its label, else the link's host. */
const deckName = (d: Deck) => d.label || new URL(d.url).host;

function removeWithUndo(url: string, deck: Deck, from: Element) {
  collapseRow(from, () => {
    const decks = findJobByUrl(url)?.decks ?? [];
    const at = decks.findIndex((d) => d.id === deck.id);
    if (at < 0) return;
    updateJob(url, { decks: removeDeck(decks, deck.id) });
    notifyRemoved(`Removed “${deckName(deck)}”`, () => {
      const now = findJobByUrl(url);
      if (now) updateJob(now.url, { decks: restoreDeck(now.decks, deck, at) });
    });
  });
}

/** Link, Label and Sent on, then Save / Cancel. Save refuses a link that is not http(s). */
function DeckForm({
  initial,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: DeckInput;
  saveLabel: string;
  /** False when the link was refused. */
  onSave: (input: DeckInput) => boolean;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initial.url);
  const [label, setLabel] = useState(initial.label ?? '');
  const [sentOn, setSentOn] = useState(initial.sentOn ?? '');
  const [error, setError] = useState(false);
  const save = () => setError(!onSave({ url, label, sentOn }));
  return (
    <Stack gap="normal" className="rjb-form-full">
      <Input
        size="sm"
        type="url"
        label="Deck link"
        value={url}
        autoFocus
        error={error}
        errorMessage={error ? 'Use a full link that starts with https://' : undefined}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Switcher gap="tight">
        <Input
          size="sm"
          label="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          size="sm"
          type="date"
          label="Sent on (optional)"
          value={sentOn}
          onChange={(e) => setSentOn(e.target.value)}
        />
      </Switcher>
      <Stack direction="row" gap="tight" justify="end">
        <Button size="md" variant="tertiary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="md" variant="secondary" disabled={!url.trim()} onClick={save}>
          {saveLabel}
        </Button>
      </Stack>
    </Stack>
  );
}

function DeckCard({ job, deck, onEdit }: { job: Job; deck: Deck; onEdit: () => void }) {
  const name = deckName(deck);
  return (
    <ListCard>
      <Stack direction="row" gap="px8" align="center" wrap="nowrap">
        <Box sx={{ flex: '1 1 0%', minWidth: 0, overflowWrap: 'anywhere' }}>
          <Stack gap="px4">
            <Text variant="ui" as="span" weight="medium">
              <InlineLink href={deck.url}>{name}</InlineLink>
            </Text>
            <Text variant="caption" as="span" tone="secondary">
              {deck.sentOn ? `Sent on ${dayLabel(deck.sentOn, new Date())}` : 'Not sent yet'}
            </Text>
          </Stack>
        </Box>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={Pencil} />}
          label={`Edit “${name}”`}
          onClick={onEdit}
        />
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={X} />}
          label={`Remove “${name}”`}
          onClick={(e) => removeWithUndo(job.url, deck, e.currentTarget)}
        />
      </Stack>
    </ListCard>
  );
}

export default function DecksPanel({ job }: { job: Job }) {
  // The deck being edited, 'new' for the add form, or null.
  const [editing, setEditing] = useState<string | null>(null);
  const decks = job.decks ?? [];
  const save = (next: Deck[] | null) => {
    if (!next) return false;
    updateJob(job.url, { decks: next });
    setEditing(null);
    return true;
  };
  return (
    <Panel label="Decks" title="Decks" count={decks.length} countLabel={`${decks.length} decks`}>
      <PanelBody>
        <Stack gap="px8">
          {decks.length > 0 && (
            <CardList label="Decks for this job" inset="none">
              {decks.map((d) =>
                editing === d.id ? (
                  <ListCard key={d.id}>
                    <DeckForm
                      initial={d}
                      saveLabel="Save"
                      onSave={(input) =>
                        save(updateDeck(findJobByUrl(job.url)?.decks, d.id, input))
                      }
                      onCancel={() => setEditing(null)}
                    />
                  </ListCard>
                ) : (
                  <DeckCard key={d.id} job={job} deck={d} onEdit={() => setEditing(d.id)} />
                ),
              )}
            </CardList>
          )}
          {editing === 'new' ? (
            <DeckForm
              initial={{ url: '' }}
              saveLabel="Add deck"
              onSave={(input) => save(addDeck(findJobByUrl(job.url)?.decks, input))}
              onCancel={() => setEditing(null)}
            />
          ) : (
            // Pulled left by the tertiary's padding: the plus sits on the panel's text edge.
            <Box sx={{ ml: -4 }}>
              <Button
                size="md"
                variant="tertiary"
                iconLeft={<Icon icon={Plus} />}
                onClick={() => setEditing('new')}
              >
                Add a deck link
              </Button>
            </Box>
          )}
        </Stack>
      </PanelBody>
    </Panel>
  );
}

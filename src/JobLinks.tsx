// The job page's link lists (#416, Adrian's Q5): Documents and Decks are plain lists of external
// links for now, a label and a URL each, with Add and Remove (Undo). Links only, http(s) only.
// Every change goes through updateJob, so the links sync with the job, ride in Back up and fill
// the CSV (decks, doc_links). A deck's older Sent on day stays in storage; the page no longer
// edits it. Remove is soft: the card collapses and a notice offers Undo, back in its place.
import { useCallback, useState, type KeyboardEvent } from 'react';
import { Box, Button, Icon, InlineLink, Input, Stack, Text } from '@hirobius/design-system';
import { Plus, X } from 'lucide-react';
import { addDeck, removeDeck, restoreDeck, type LinkKind } from './decks';
import { findJobByUrl, updateJob } from './store';
import { collapseRow, highlightNew, useHighlight } from './feedback';
import { notifyRemoved } from './saveNotice';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { nextFocus, useFocusAfter } from './useFocusAfter';
import type { Deck, Job } from './types';

/** The link's name: its label, else the link's host. */
const linkName = (d: Deck) => d.label || new URL(d.url).host;

function removeWithUndo(kind: LinkKind, url: string, link: Deck, from: Element) {
  collapseRow(from, () => {
    const list = findJobByUrl(url)?.[kind.field] ?? [];
    const at = list.findIndex((d) => d.id === link.id);
    if (at < 0) return;
    updateJob(url, { [kind.field]: removeDeck(list, link.id) });
    notifyRemoved(`Removed “${linkName(link)}”`, () => {
      const now = findJobByUrl(url);
      if (now) updateJob(now.url, { [kind.field]: restoreDeck(now[kind.field], link, at) });
    });
  });
}

/** Link and Label, then Add link / Cancel. Add refuses a link that is not http(s). Enter adds,
 *  Escape cancels, in either field. */
function LinkForm({
  onAdd,
  onCancel,
}: {
  /** False when the link was refused. */
  onAdd: (url: string, label: string) => boolean;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState(false);
  // Enter on an empty Link does nothing, as the disabled Add link button does.
  const add = () => url.trim() && setError(!onAdd(url, label));
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      add();
    }
    if (e.key === 'Escape') onCancel();
  };
  return (
    <Stack gap="normal" className="rjb-form-full">
      <Input
        size="sm"
        type="url"
        label="Link"
        value={url}
        autoFocus
        error={error}
        errorMessage={error ? 'Use a full link that starts with https://' : undefined}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(false);
        }}
        onKeyDown={keys}
      />
      <Input
        size="sm"
        label="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={keys}
      />
      <Stack direction="row" gap="tight" justify="end">
        <Button size="md" variant="tertiary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="md" variant="secondary" disabled={!url.trim()} onClick={add}>
          Add link
        </Button>
      </Stack>
    </Stack>
  );
}

function LinkCard({
  kind,
  job,
  link,
  onRemove,
  focusRef,
}: {
  kind: LinkKind;
  job: Job;
  link: Deck;
  /** Called as Remove is pressed, so focus can move on before the card goes. */
  onRemove: () => void;
  focusRef: (key: string) => (el: HTMLElement | null) => void;
}) {
  const name = linkName(link);
  // A link just added scrolls into view and flashes (#212); ListCard takes no ref, so the row's
  // ref flashes the card around it.
  const highlight = useHighlight<HTMLElement>(link.id);
  const flashCard = useCallback(
    (el: HTMLElement | null) => highlight(el?.closest('li') ?? null),
    [highlight],
  );
  return (
    <ListCard>
      <Stack direction="row" gap="px8" align="center" wrap="nowrap" ref={flashCard}>
        <Box sx={{ flex: '1 1 0%', minWidth: 0, overflowWrap: 'anywhere' }}>
          <Text variant="ui" as="span" weight="medium">
            <InlineLink href={link.url}>{name}</InlineLink>
          </Text>
        </Box>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={X} />}
          label={`Remove “${name}”`}
          ref={focusRef(`remove:${link.id}`)}
          onClick={(e) => {
            onRemove();
            removeWithUndo(kind, job.url, link, e.currentTarget);
          }}
        />
      </Stack>
    </ListCard>
  );
}

export default function LinksPanel({ job, kind }: { job: Job; kind: LinkKind }) {
  const [adding, setAdding] = useState(false);
  const links = job[kind.field] ?? [];
  // Focus goes back to Add after the form closes; a removed link hands it to the next link's
  // Remove (else Add).
  const { ref, focus } = useFocusAfter();
  const close = () => {
    focus('add');
    setAdding(false);
  };
  const add = (url: string, label: string) => {
    const next = addDeck(findJobByUrl(job.url)?.[kind.field], { url, label });
    if (!next) return false;
    updateJob(job.url, { [kind.field]: next });
    highlightNew(next[next.length - 1].id);
    close();
    return true;
  };
  const removeFocus = (link: Deck) => {
    const ids = links.map((d) => `remove:${d.id}`);
    focus(nextFocus(ids, links.indexOf(link), 'add'));
  };
  return (
    <Panel
      label={kind.title}
      title={kind.title}
      count={links.length}
      countLabel={`${links.length} ${kind.noun}s`}
    >
      <PanelBody>
        <Stack gap="px8">
          {links.length > 0 && (
            <CardList label={`${kind.title} for this job`} inset="none">
              {links.map((d) => (
                <LinkCard
                  key={d.id}
                  kind={kind}
                  job={job}
                  link={d}
                  onRemove={() => removeFocus(d)}
                  focusRef={ref}
                />
              ))}
            </CardList>
          )}
          {adding ? (
            <LinkForm onAdd={add} onCancel={close} />
          ) : (
            // Pulled left by the tertiary's padding: the plus sits on the panel's text edge.
            <Box sx={{ ml: -4 }}>
              <Button
                size="md"
                variant="tertiary"
                iconLeft={<Icon icon={Plus} />}
                ref={ref('add')}
                onClick={() => setAdding(true)}
              >
                {`Add a ${kind.noun} link`}
              </Button>
            </Box>
          )}
        </Stack>
      </PanelBody>
    </Panel>
  );
}

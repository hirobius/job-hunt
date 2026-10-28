// The Account menu's Companies list (simplify amendment 2, Q6): Followed and Ignored, the Sources
// the auto-scan and Review new read. One list at a time (Followed runs to hundreds of boards), so
// Ignored is one tap away. Ignore mutes a followed company (its postings leave Review new); Follow
// again lifts the mute. Each change shows at once: the row moves to the other list and both counts
// change. Its own chunk (lazyDialogs.ts): opened from the Account menu only.
import { useState, type ReactNode } from 'react';
import { Button, Dialog, SegmentedControl, Stack, Text } from '@hirobius/design-system';
import { CardList, ListCard } from './PipelinePanel';
import { useActiveTrack } from './activeTrack';
import { useFeedInputs } from './feed/useFeed';
import { muteCompany, unmuteCompany, useDecided } from './feed/decided';
import { companiesLists, type CompanyEntry } from './companiesList';

type Show = 'followed' | 'ignored';

export default function CompaniesDialog({ onCloseAutoFocus }: { onCloseAutoFocus?: () => void }) {
  const track = useActiveTrack();
  const { sources } = useFeedInputs(track?.id ?? '');
  const { muted } = useDecided();
  const { followed, ignored } = companiesLists(sources, muted);
  const [show, setShow] = useState<Show>(() =>
    !followed.length && ignored.length ? 'ignored' : 'followed',
  );
  return (
    <Dialog.Content className="rjb-dialog" onCloseAutoFocus={onCloseAutoFocus}>
      <Dialog.Header>
        <Dialog.Title>Companies</Dialog.Title>
        <Dialog.Description>
          Followed companies’ jobs show in Review new. Ignored ones never do.
        </Dialog.Description>
      </Dialog.Header>
      {followed.length || ignored.length ? (
        <Stack gap="normal">
          <SegmentedControl
            aria-label="Companies to show"
            size="sm"
            value={show}
            onChange={(v) => setShow(v as Show)}
            options={[
              { value: 'followed', label: `Followed (${followed.length})` },
              { value: 'ignored', label: `Ignored (${ignored.length})` },
            ]}
          />
          {show === 'followed' ? (
            <Group
              title="Followed"
              rows={followed}
              empty="None followed. Follow a new company on Today."
              action={(c) => (
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Ignore ${c.label}`}
                  onClick={() => muteCompany(c.label)}
                >
                  Ignore
                </Button>
              )}
            />
          ) : (
            <Group
              title="Ignored"
              rows={ignored}
              empty="None ignored."
              action={(c) => (
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-label={`Follow ${c.label} again`}
                  onClick={() => unmuteCompany(c.key)}
                >
                  Follow again
                </Button>
              )}
            />
          )}
        </Stack>
      ) : (
        <Text variant="body" as="p" tone="secondary">
          No companies yet. The scan finds them, and saving a job follows its company.
        </Text>
      )}
      <Dialog.Footer>
        <Dialog.Close asChild>
          <Button variant="secondary">Done</Button>
        </Dialog.Close>
      </Dialog.Footer>
    </Dialog.Content>
  );
}

function Group({
  title,
  rows,
  empty,
  action,
}: {
  title: string;
  rows: CompanyEntry[];
  empty: string;
  action: (c: CompanyEntry) => ReactNode;
}) {
  return rows.length ? (
    <CardList label={title} inset="none">
      {rows.map((c) => (
        <ListCard key={c.key} dense>
          <Stack direction="row" gap="tight" align="center" justify="space-between">
            <Text variant="ui" as="span">
              {c.label}
            </Text>
            {action(c)}
          </Stack>
        </ListCard>
      ))}
    </CardList>
  ) : (
    <Text variant="caption" as="p" tone="secondary">
      {empty}
    </Text>
  );
}

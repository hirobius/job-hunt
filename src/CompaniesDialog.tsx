// The Account menu's Companies list (simplify amendment 2, Q6): Followed and Ignored, the Sources
// the auto-scan and Review new read. One list at a time (Followed runs to hundreds of boards), so
// Ignored is one tap away. Ignore mutes a followed company (its postings leave Review new); Follow
// again lifts the mute. Each change shows at once: the row moves to the other list and both counts
// change. Its own chunk (lazyDialogs.ts): opened from the Account menu only.
import { startTransition, useEffect, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  Box,
  Button,
  Dialog,
  Icon,
  SegmentedControl,
  Stack,
  Text,
  Tooltip as HdsTooltip,
} from '@hirobius/design-system';
import { ItemList, ItemRow } from './PipelinePanel';
import { useFeedInputs } from './feed/useFeed';
import { companyKey, followCompany, muteCompany, unmuteCompany, useDecided } from './feed/decided';
import { canonicalBoardUrl } from './feed/sources/ats';
import { httpUrl } from './httpUrl';
import { companiesLists, displayName, type CompanyEntry } from './companiesList';
import { followBoard } from './sources';
import { metaLines } from './metaLines';
import { dismissSuggestion, loadSuggestions, type BoardSuggestion } from './boardSuggestions';

type Show = 'followed' | 'ignored' | 'suggested';

const boardKey = (b: { kind: string; slug: string }) => `${b.kind}:${b.slug.toLowerCase()}`;
const KIND_NAME: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
};

/** Rows drawn on the press; the rest follow in a transition after the dialog paints. Followed
 *  runs to hundreds of boards, and drawing them all at once took the press past 300 ms (#212). */
export const FIRST_ROWS = 12;

export default function CompaniesDialog({ onCloseAutoFocus }: { onCloseAutoFocus?: () => void }) {
  const { sources } = useFeedInputs();
  const { muted } = useDecided();
  const { followed, ignored } = companiesLists(sources, muted);
  const [show, setShow] = useState<Show>(() =>
    !followed.length && ignored.length ? 'ignored' : 'followed',
  );
  // Boards the sync found for companies in the feeds (#576): suggestions only, never followed
  // until the user taps Follow.
  const [found, setFound] = useState<BoardSuggestion[]>([]);
  useEffect(() => {
    let live = true;
    void loadSuggestions().then((s) => live && setFound(s));
    return () => {
      live = false;
    };
  }, []);
  const followedBoards = new Set(
    sources.filter((s) => s.kind !== 'feed').map((s) => boardKey({ kind: s.kind, slug: s.ref })),
  );
  // Never a board already followed, nor a company the user ignored ("Ignored ones never do").
  const ignoredKeys = new Set(ignored.map((c) => c.key));
  const suggested = found.filter(
    (s) => !followedBoards.has(boardKey(s.board)) && !ignoredKeys.has(companyKey(s.company)),
  );
  // The last suggestion gone while its segment is open: show Followed, so one option stays checked.
  const view: Show = show === 'suggested' && !suggested.length ? 'followed' : show;
  const hasAny = followed.length > 0 || ignored.length > 0 || suggested.length > 0;
  const drop = (s: BoardSuggestion) => {
    setFound((cur) => cur.filter((x) => boardKey(x.board) !== boardKey(s.board)));
    void dismissSuggestion(s.board);
  };
  return (
    // Three rows (#619): the header (title, the list switch) and the footer (Done) stay put, and
    // only the body scrolls, so Done never covers the last row. Below sm it is a bottom sheet.
    // A further list (#618) is one more option and one more branch in the body.
    <Dialog.Content className="rjb-dialog rjb-bottom-sheet" onCloseAutoFocus={onCloseAutoFocus}>
      <Dialog.Header>
        <span className="rjb-sheet-handle" aria-hidden="true" />
        <Dialog.Title>Companies</Dialog.Title>
        <Dialog.Description>
          Followed companies’ jobs show in Review new. Ignored ones never do.
        </Dialog.Description>
        {hasAny && (
          <SegmentedControl
            aria-label="Companies to show"
            size="sm"
            value={view}
            onChange={(v) => setShow(v as Show)}
            options={[
              { value: 'followed', label: `Followed (${followed.length})` },
              { value: 'ignored', label: `Ignored (${ignored.length})` },
              ...(suggested.length
                ? [{ value: 'suggested', label: `Suggested (${suggested.length})` }]
                : []),
            ]}
          />
        )}
      </Dialog.Header>
      <Box className="rjb-dialog-body" data-testid="companies-body">
        {!hasAny ? (
          <Text variant="body" as="p" tone="secondary">
            No companies yet. The scan finds them, and saving a job follows its company.
          </Text>
        ) : view === 'followed' ? (
          <Group
            key="followed"
            title="Followed"
            rows={followed}
            empty="None followed. Follow a new company on Find."
            action={(c) => (
              <Button
                size="sm"
                variant="tertiary"
                aria-label={`Ignore ${c.name}`}
                onClick={() => muteCompany(c.label)}
              >
                Ignore
              </Button>
            )}
          />
        ) : view === 'suggested' ? (
          <Stack gap="tight">
            <Text variant="caption" as="p" tone="secondary">
              Boards found for companies in your feeds, each checked against the company’s name or
              site. Open one to look before you follow. A dismissed board can come back after a
              month.
            </Text>
            <Group
              key="suggested"
              title="Suggested"
              rows={suggested.map((s) => ({
                key: boardKey(s.board),
                label: metaLines([
                  s.company,
                  `${KIND_NAME[s.board.kind] ?? s.board.kind}${s.jobs ? ` (${s.jobs} open)` : ''}`,
                ])[0],
                name: metaLines([
                  displayName(s.company),
                  `${KIND_NAME[s.board.kind] ?? s.board.kind}${s.jobs ? ` (${s.jobs} open)` : ''}`,
                ])[0],
                known: false,
              }))}
              empty="No suggestions."
              action={(c) => {
                const s = suggested.find((x) => boardKey(x.board) === c.key);
                return s ? (
                  <Stack direction="row" gap="tight" align="center">
                    <BoardLink suggestion={s} />
                    <Button
                      size="sm"
                      variant="tertiary"
                      aria-label={`Follow ${s.company} on ${KIND_NAME[s.board.kind]}`}
                      onClick={() => {
                        followBoard(s.board, s.company);
                        drop(s);
                      }}
                    >
                      Follow
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      aria-label={`Dismiss ${s.company}`}
                      onClick={() => drop(s)}
                    >
                      Dismiss
                    </Button>
                  </Stack>
                ) : null;
              }}
            />
          </Stack>
        ) : (
          <Group
            key="ignored"
            title="Ignored"
            rows={ignored}
            empty="None ignored."
            action={(c) => (
              <Button
                size="sm"
                variant="tertiary"
                aria-label={`Follow ${c.name} again`}
                onClick={() => {
                  unmuteCompany(c.key);
                  // Muted from a posting, with no board or follow of its own: follow it by name.
                  if (!c.known) followCompany(c.label);
                }}
              >
                Follow again
              </Button>
            )}
          />
        )}
      </Box>
      <Dialog.Footer>
        <Dialog.Close asChild>
          <Button variant="secondary">Done</Button>
        </Dialog.Close>
      </Dialog.Footer>
    </Dialog.Content>
  );
}

/** The quiet icon link to a suggested board (Posting links' pattern), so it can be checked before
 *  a Follow. Only a web address becomes a link. */
function BoardLink({ suggestion: s }: { suggestion: BoardSuggestion }) {
  const url = canonicalBoardUrl(s.board);
  if (!httpUrl(url)) return null;
  const label = `Open board for ${s.company}`;
  return (
    <HdsTooltip>
      <HdsTooltip.Trigger asChild>
        <Button size="sm" variant="tertiary" iconOnly label={label} asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
            <Icon icon={ExternalLink} />
          </a>
        </Button>
      </HdsTooltip.Trigger>
      <HdsTooltip.Content>Open board</HdsTooltip.Content>
    </HdsTooltip>
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
  const [all, setAll] = useState(rows.length <= FIRST_ROWS);
  useEffect(() => {
    if (!all) startTransition(() => setAll(true));
  }, [all]);
  return rows.length ? (
    <ItemList label={title} inset="none">
      {(all ? rows : rows.slice(0, FIRST_ROWS)).map((c) => (
        <ItemRow key={c.key} dense>
          <Stack direction="row" gap="tight" align="center" justify="space-between">
            <Text variant="ui" as="span">
              {c.name}
            </Text>
            {action(c)}
          </Stack>
        </ItemRow>
      ))}
    </ItemList>
  ) : (
    <Text variant="caption" as="p" tone="secondary">
      {empty}
    </Text>
  );
}

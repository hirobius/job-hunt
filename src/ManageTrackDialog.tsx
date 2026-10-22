import { useId, useState } from 'react';
import {
  AlertDialog,
  Button,
  Dialog,
  Input as HdsInput,
  SegmentedControl,
  Icon,
  Box,
  Text,
  Stack,
  Disclosure,
  InlineLink,
  useToast,
} from '@hirobius/design-system';
import { Plus, Trash2, X } from 'lucide-react';
import { httpUrl } from './feed/targets';
import {
  updateCategory,
  removeCategory,
  addGroup,
  updateGroup,
  removeGroup,
  addTile,
  removeTile,
  useCategories,
  useGroups,
  useTiles,
} from './curation/curationStore';
import type { Seniority } from './curation/types';
import { STARTER_PACKS, topUpFromPack } from './curation/starterPacks';
import { displayGroupLabel } from './curation/groupLabel';

// In-app curation controls (issue #37 / B4): edit a track's search terms + seniority + location,
// and add/remove its sections (groups) and links (tiles) — all through the curation store, which
// persists locally and syncs. Replaces the old read-only hardcoded-pillar "Manage trades" dialog.

// A comma/enter-separated chip editor for a string[] field on the category.
/** A field label in the HDS Input label's style (UI 14, medium, primary), so every field in the
 *  dialog reads the same. */
function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: string }) {
  return (
    // Text's props have no htmlFor (they are HTMLElement's); the spread passes it to the label.
    <Text variant="ui" as="label" weight="medium" {...{ htmlFor }}>
      {children}
    </Text>
  );
}

function ChipEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Stack gap="px8">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
        {/* A term is a static pill; only its X removes it (rev-3 mock), so a stray tap on the
            text can't drop a term. HDS Tag is always one whole button, so this is a Box pill
            with an icon Button: `.rjb-term` / `.rjb-term-x` in base.css. */}
        {values.map((v) => (
          <Box
            key={v}
            as="span"
            className="rjb-term"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              bgcolor: 'surface.raised',
              borderRadius: 'pill',
              pl: 'sm',
              maxWidth: '100%',
            }}
          >
            <Text variant="ui" as="span" className="rjb-truncate">
              {v}
            </Text>
            <Button
              size="sm"
              variant="tertiary"
              iconOnly
              iconLeft={<Icon icon={X} size="small" />}
              label={`Remove ${v}`}
              className="rjb-term-x"
              onClick={() => onChange(values.filter((x) => x !== v))}
            />
          </Box>
        ))}
        {values.length === 0 && (
          <Text variant="caption" as="span" tone="secondary">
            none yet
          </Text>
        )}
      </Box>
      <Box sx={{ display: 'contents', '& input': { maxWidth: 260 } }}>
        <HdsInput
          id={id}
          size="sm"
          aria-label={placeholder}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
      </Box>
    </Stack>
  );
}

function GroupEditor({ groupId }: { groupId: string }) {
  const tiles = useTiles().filter((t) => t.groupId === groupId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const addLink = () => {
    if (!name.trim() || !url.trim()) return;
    addTile(groupId, { name: name.trim(), url: url.trim(), meta: '' });
    setName('');
    setUrl('');
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'xs' }}>
      {tiles.map((t) => (
        <Box
          sx={{ display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'center' }}
          key={t.id}
        >
          <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {/* A link out, so a link can be checked before it is kept (Adrian 2026-10-22). One
                typed without a scheme would open the app itself, so it stays text. */}
            <Text variant="caption" as="div">
              {httpUrl(t.url) ? <InlineLink href={t.url}>{t.name}</InlineLink> : t.name}
            </Text>
          </Box>
          <Button
            size="sm"
            variant="tertiary"
            tone="danger"
            iconOnly
            iconLeft={<Icon icon={X} />}
            label={`Remove ${t.name}`}
            onClick={() => removeTile(t.id)}
          />
        </Box>
      ))}
      {/* Mobile-first: a column that becomes a row from sm. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { base: 'column', sm: 'row' },
          gap: 'xs',
        }}
      >
        <Box sx={{ display: 'contents', '& input': { flex: 1, minWidth: 0 } }}>
          <HdsInput
            size="sm"
            aria-label="Link name"
            placeholder="Link name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Box>
        <Box sx={{ display: 'contents', '& input': { flex: 1, minWidth: 0 } }}>
          <HdsInput
            size="sm"
            aria-label="Link URL"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLink();
              }
            }}
          />
        </Box>
        <Button
          variant="secondary"
          size="sm"
          onClick={addLink}
          disabled={!name.trim() || !url.trim()}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}

export default function ManageTrackDialog({
  categoryId,
  open,
  onClose,
  onDeleted,
}: {
  categoryId: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const cat = useCategories().find((c) => c.id === categoryId);
  const groups = useGroups()
    .filter((g) => g.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!cat) return null;

  const confirmBody = `“${cat.label}”, all its sections and links, and its outreach targets and saved searches will be gone for good. Jobs you saved stay in your Pipeline.`;

  // Header, the scroll body and the footer are the Dialog's own children, so they share its
  // content box (16 in on a phone) and Done never scrolls out of view: the body takes the height
  // that is left and scrolls on its own.
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content
        style={{
          width: '100%',
          maxWidth: 600,
          maxHeight: '85vh',
          // HDS Dialog.Content is a grid: header and footer take their height, the body the rest.
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          overflow: 'hidden',
        }}
      >
        <Dialog.Header>
          <Dialog.Title>Manage track</Dialog.Title>
        </Dialog.Header>
        {/* The body bleeds 4px each side (and pads it back) so focus rings aren't clipped by
            the scroll edge, while the fields still end where the header and Done do. */}
        <Box
          sx={{
            minHeight: 0,
            overflowY: 'auto',
            mx: -1,
            px: 1,
            py: 'xs',
          }}
        >
          <Stack gap="normal">
            <Box sx={{ '& > *': { width: '100%' } }}>
              <HdsInput
                size="sm"
                label="Track name"
                value={cat.label}
                onChange={(e) => updateCategory(cat.id, { label: e.target.value })}
              />
            </Box>
            <Box sx={{ '& > *': { width: '100%' } }}>
              <HdsInput
                size="sm"
                label="Location"
                value={cat.location}
                onChange={(e) => updateCategory(cat.id, { location: e.target.value })}
              />
            </Box>
            {/* Its own full-width row, so the three segments fit at 390 (rev-3 mock). */}
            <Stack gap="px8">
              <FieldLabel>Seniority</FieldLabel>
              <SegmentedControl
                aria-label="Seniority"
                size="sm"
                fullWidth
                value={cat.seniority}
                onChange={(v) => updateCategory(cat.id, { seniority: v as Seniority })}
                options={[
                  { value: 'any', label: 'Any' },
                  { value: 'entry', label: 'Entry' },
                  { value: 'experienced', label: 'Experienced' },
                ]}
              />
            </Stack>
            <ChipEditor
              label="Title search terms"
              placeholder="Add a title"
              values={cat.titles}
              onChange={(next) => updateCategory(cat.id, { titles: next })}
            />
            <ChipEditor
              label="ATS role terms"
              placeholder="Add an ATS role term"
              values={cat.atsRoles}
              onChange={(next) => updateCategory(cat.id, { atsRoles: next })}
            />

            <Box sx={{ pt: 'xs' }}>
              <Stack gap="normal">
                <Text variant="body" className="rjb-semibold">
                  Sections & links
                </Text>
                {groups.map((g) => (
                  <Stack key={g.id} gap="px8">
                    <Stack direction="row" gap="px8" align="center">
                      <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
                        <HdsInput
                          size="sm"
                          aria-label="Section name"
                          value={displayGroupLabel(g.label)}
                          onChange={(e) => updateGroup(g.id, { label: e.target.value })}
                        />
                      </Box>
                      <Button
                        size="sm"
                        variant="tertiary"
                        tone="danger"
                        iconOnly
                        iconLeft={<Icon icon={Trash2} />}
                        label={`Delete ${displayGroupLabel(g.label)} section`}
                        onClick={() => removeGroup(g.id)}
                      />
                    </Stack>
                    <GroupEditor groupId={g.id} />
                  </Stack>
                ))}
                <Box>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Icon icon={Plus} />}
                    onClick={() => addGroup(cat.id, { label: 'New section' })}
                  >
                    Add section
                  </Button>
                </Box>
              </Stack>
            </Box>
            {/* Pull in what a starter pack gained since this track was made (e.g. the 2026-10
                design-systems round). Additive only: nothing the user added or edited is removed
                (curation/starterPacks.ts topUpFromPack). */}
            <Disclosure variant="nav" label="Update from a starter pack">
              <Stack gap="tight">
                <Text variant="caption" as="p" tone="secondary">
                  Adds the pack's newer titles, search terms, links and outreach targets that this
                  track doesn't have yet. Nothing is removed.
                </Text>
                <Stack direction="row" wrap="wrap" gap="tight">
                  {STARTER_PACKS.filter((p) => p.id !== 'blank').map((p) => (
                    <Button
                      key={p.id}
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const r = topUpFromPack(cat.id, p.id);
                        const n = r.titles + r.atsRoles + r.tiles + r.targets;
                        toast({
                          tone: n ? 'success' : 'info',
                          title: n
                            ? `Added ${r.titles + r.atsRoles} terms, ${r.tiles} links and ${r.targets} outreach targets from ${p.label}`
                            : `Already up to date with ${p.label}`,
                        });
                      }}
                    >
                      {p.label}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            </Disclosure>
            {/* Delete sits apart at the end of the body (space above it, no rule), not beside
                Done, so the two can't be confused on a phone. The confirm says what goes with it. */}
            <Box
              sx={{
                pt: 'md',
                '& > *': { width: '100%' },
              }}
            >
              <AlertDialog>
                <AlertDialog.Trigger asChild>
                  <Button variant="secondary" tone="danger">
                    Delete track
                  </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Content>
                  <AlertDialog.Header>
                    <AlertDialog.Title>Delete this track?</AlertDialog.Title>
                    <AlertDialog.Description>{confirmBody}</AlertDialog.Description>
                  </AlertDialog.Header>
                  <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                      <Button variant="secondary">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <Button
                        tone="danger"
                        onClick={() => {
                          removeCategory(cat.id);
                          onDeleted();
                        }}
                      >
                        Delete track
                      </Button>
                    </AlertDialog.Action>
                  </AlertDialog.Footer>
                </AlertDialog.Content>
              </AlertDialog>
            </Box>
          </Stack>
        </Box>
        <Dialog.Footer>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

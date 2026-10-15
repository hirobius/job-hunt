// Templates (#132): a list of snippets and an editor. `#/copy-deck` is the list; `#/copy-deck/<id>`
// opens one (the id is the snippet's own, so it survives reorder and sync). From the HDS `lg`
// breakpoint the list is a rail beside the editor (the first template shows when the route names
// none); below it a phone sees one pane at a time, the detail with a way back. An unknown id goes
// back to the list once sync has settled (the snippet may not have arrived on this device yet).
import { useContext, useEffect, useMemo, useState } from 'react';
import { Box, Button, Sidebar, Stack } from '@hirobius/design-system';
import EmptyState from './EmptyState';
import TemplatesList from './TemplatesList';
import TemplateDetail from './TemplateDetail';
import {
  addSnippet,
  duplicateSnippet,
  getSnippets,
  restoreStarterSnippets,
  useSnippets,
} from './copyDeckStore';
import { navigate, useRoute } from './route';
import { useAtLeast } from './hds-gaps/useBreakpoint';
import { CloudSyncContext } from './account/accountContext';

const LIST_HASH = '#/copy-deck';

export default function CopyDeckView() {
  const items = useSnippets();
  const route = useRoute();
  const wide = useAtLeast('lg');
  // Read the context directly: this view also renders on its own in tests, outside the provider.
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  const [query, setQuery] = useState('');

  // Pinned first, otherwise the saved order.
  const ordered = useMemo(
    () => [...items.filter((s) => s.pinned), ...items.filter((s) => !s.pinned)],
    [items],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? ordered.filter((s) => `${s.label}\n${s.body}`.toLowerCase().includes(needle))
      : ordered;
  }, [ordered, query]);

  const named = route.sub ? items.find((s) => s.id === route.sub) : undefined;
  useEffect(() => {
    if (route.sub && !named && settled) navigate({ sub: null }, true);
  }, [route.sub, named, settled]);

  const open = (id: string | null) => navigate({ sub: id });
  // The mutators don't return the new id, so find it as the one that wasn't there before.
  const addAndOpen = (add: () => void) => {
    const before = new Set(getSnippets().map((s) => s.id));
    add();
    const made = getSnippets().find((s) => !before.has(s.id));
    if (made) open(made.id);
  };

  if (items.length === 0)
    return (
      <Box sx={{ py: 'lg' }}>
        <EmptyState
          title="No templates yet"
          message="Keep cover letters, outreach notes and call scripts here, with tokens that fill from a job."
          action={
            <Stack direction="row" wrap="wrap" gap="tight" justify="center">
              <Button variant="primary" onClick={() => addAndOpen(() => addSnippet())}>
                New snippet
              </Button>
              <Button variant="secondary" onClick={restoreStarterSnippets}>
                Restore the starter set
              </Button>
            </Stack>
          }
        />
      </Box>
    );

  // On a phone the detail is its own pane; on a desktop the first template shows beside the list.
  const selected = named ?? (wide ? (visible[0] ?? null) : null);
  const list = (
    <TemplatesList
      items={visible}
      currentId={selected?.id ?? null}
      query={query}
      onQuery={setQuery}
      onNew={() => addAndOpen(() => addSnippet())}
    />
  );
  const detail = selected && (
    // Keyed so switching templates starts a fresh editor (and a fresh confirm dialog).
    <TemplateDetail
      key={selected.id}
      snippet={selected}
      backHref={wide ? undefined : LIST_HASH}
      onDuplicate={() => addAndOpen(() => duplicateSnippet(selected.id))}
      onDeleted={() => open(null)}
    />
  );

  if (wide)
    return (
      <Sidebar side="start" sideWidth="20rem" gap="normal">
        {list}
        {detail ?? <Box />}
      </Sidebar>
    );
  return named ? detail : list;
}

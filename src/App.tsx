import { lazy, Suspense, useEffect } from 'react';
import { useRoute, navigate, getRoute } from './route';
import { Box, Container, Stack, Typography } from './ui/box';
import { Sun, Moon, MoreVertical, MessageSquareText } from 'lucide-react';
import {
  IconButton as HdsIconButton,
  Menu as HdsMenu,
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  HdsTooltip,
} from '@hirobius/design-system';
import TrackerView from './TrackerView';
import CloudSync from './CloudSync';
import { useColorMode } from './ColorMode';
import { addJob, markAppliedByUrl, setStatusByUrl } from './store';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton } from './Skeletons';

// Code-split the non-default views so the initial bundle only carries the default Tracker tab;
// the rest load on demand (tab switch).
const DiscoverView = lazy(() => import('./DiscoverView'));
const CopyDeckView = lazy(() => import('./CopyDeckView'));

function ColorModeToggle() {
  const { mode, toggle } = useColorMode();
  const label = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <HdsTooltip>
      <HdsTooltip.Trigger asChild>
        <HdsIconButton
          variant="tertiary"
          icon={mode === 'dark' ? Sun : Moon}
          onClick={toggle}
          label={label}
        />
      </HdsTooltip.Trigger>
      <HdsTooltip.Content>{label}</HdsTooltip.Content>
    </HdsTooltip>
  );
}

// Secondary actions collapse into one overflow menu so the header stays a title + two controls at
// any width. (Track management now lives in Discover — see the curation controls — so the old
// "Manage trades" item is gone.)
function OverflowMenu() {
  return (
    <HdsMenu>
      <HdsMenu.Trigger asChild>
        <HdsIconButton variant="tertiary" icon={MoreVertical} label="More options" />
      </HdsMenu.Trigger>
      <HdsMenu.Content align="end">
        <HdsMenu.Item
          onSelect={() =>
            window.open('https://github.com/hirobius/job-hunt/issues/new', '_blank', 'noopener')
          }
        >
          <MessageSquareText size={15} style={{ marginRight: 8 }} />
          Send feedback
        </HdsMenu.Item>
      </HdsMenu.Content>
    </HdsMenu>
  );
}

// Top-level tabs, in render order. The URL hash carries the slug (#/queue …); the index is
// derived from it. Slugs stay back-compatible (`queue`/`copy-deck`) even though the labels are now
// Tracker/Templates, so old bookmarks keep working. Tracker is the default landing view.
const TAB_SLUGS = ['discover', 'queue', 'copy-deck'] as const;
const DEFAULT_TAB = 'queue';
const defaultTabIndex = TAB_SLUGS.indexOf(DEFAULT_TAB);

export default function App() {
  const route = useRoute();
  const slugIndex = TAB_SLUGS.indexOf(route.tab as (typeof TAB_SLUGS)[number]);
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links).
  // After ingesting, land on the Tracker so the just-added job is visible; with no route at all,
  // normalize the hash to the default landing tab so back/forward and refresh are consistent.
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    let acted = false;
    if (qp.get('add')) {
      addJob(qp.get('add')!, label);
      acted = true;
    }
    if (qp.get('applied')) {
      markAppliedByUrl(qp.get('applied')!, label);
      acted = true;
    }
    const st = qp.get('status'),
      su = qp.get('u');
    if (st && su && (STATUSES as string[]).includes(st)) {
      setStatusByUrl(su, st as never, label);
      acted = true;
    }
    if (acted) {
      ['add', 'applied', 'status', 'u', 't', 'title'].forEach((k) => qp.delete(k));
      const s = qp.toString();
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (s ? '?' + s : '') + '#/' + DEFAULT_TAB,
      );
    } else if (!getRoute().tab) {
      navigate({ tab: DEFAULT_TAB }, true);
    }
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1.75, sm: 3, md: 4 } }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: { xs: 1.5, sm: 2 } }}
      >
        <Typography variant="h1" sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' }, minWidth: 0 }}>
          Apply{' '}
          <Box component="span" sx={{ color: 'primary.main' }}>
            Board
          </Box>
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.25} sx={{ flex: 'none' }}>
          <ColorModeToggle />
          <OverflowMenu />
        </Stack>
      </Stack>

      <CloudSync />

      {/* HDS underline tabs (Radix): value = route slug, aria wiring comes from Radix. The list
          scrolls horizontally on narrow screens; the sx bump gives each tab a readable, tappable
          target (the default underline tabs read too faint/small on phones). */}
      <Box
        sx={{
          mb: { xs: 2, sm: 2.5 },
          '& [role="tab"]': {
            fontSize: { xs: '0.875rem', sm: '0.95rem' },
            fontWeight: 600,
            paddingTop: '10px',
            paddingBottom: '10px',
            paddingLeft: { xs: '7px', sm: '14px' },
            paddingRight: { xs: '7px', sm: '14px' },
          },
        }}
      >
        <HdsTabs
          value={TAB_SLUGS[tab]}
          onValueChange={(v) => navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null })}
        >
          <TabsList style={{ width: '100%' }}>
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="queue">Tracker</TabsTrigger>
            <TabsTrigger value="copy-deck">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="discover">
            <Suspense fallback={<DiscoverSkeleton />}>
              <DiscoverView />
            </Suspense>
          </TabsContent>
          <TabsContent value="queue">
            <TrackerView />
          </TabsContent>
          <TabsContent value="copy-deck">
            <Suspense fallback={<CopyDeckSkeleton />}>
              <CopyDeckView />
            </Suspense>
          </TabsContent>
        </HdsTabs>
      </Box>
    </Container>
  );
}

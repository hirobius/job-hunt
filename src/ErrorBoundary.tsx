import { Component, type ReactNode } from 'react';
import { Button, Box, Stack, Text } from '@hirobius/design-system';
import { reportError } from './errorReport';
import { clearLocalData } from './localReset';
import { isChunkLoadError } from './chunkError';
import { reloadForNewVersion, STALE_MSG } from './staleBuild';

// Top-level safety net (issue #46): a render-time crash shows a recovery UI instead of a blank
// white screen. Offers a plain reload and a "reset local data" escape hatch for when a single bad
// localStorage record is the cause. The crash is logged and, on the live site, sent as a scrubbed
// report with no personal data (`errorReport.ts`).
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

function resetLocalData() {
  if (
    !window.confirm(
      'Reset local data? This clears saved jobs, notes, and settings on this device. This cannot be undone.',
    )
  )
    return;
  clearLocalData();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
    reportError('render', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // A tab older than the deploy asked for a chunk that is gone: not a crash, a reload fixes it
    // (the report is held back unless that reload didn't help, errorReport.ts).
    if (isChunkLoadError(this.state.error))
      return (
        <Box sx={{ maxWidth: 480, mx: 'auto', mt: 16, px: 'md', textAlign: 'center' }}>
          <Stack gap="tight" align="center">
            <Text variant="body">{STALE_MSG}</Text>
            <Button variant="primary" onClick={() => reloadForNewVersion()}>
              Reload
            </Button>
          </Stack>
        </Box>
      );
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 16, px: 'md', textAlign: 'center' }}>
        <Stack gap="tight" align="center">
          <Text variant="title" as="h1">
            Something broke
          </Text>
          <Text variant="body" tone="secondary">
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening, a
            bad saved record may be the cause — resetting local data clears it.
          </Text>
          <Stack direction="row" gap="gap">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
            {/* The app's one destructive style: HDS secondary + tone="danger". */}
            <Button variant="secondary" tone="danger" onClick={resetLocalData}>
              Reset local data
            </Button>
          </Stack>
        </Stack>
      </Box>
    );
  }
}

import { Component, type ReactNode } from 'react';
import { Button, Box, Stack, Text } from '@hirobius/design-system';
import { SECONDARY } from './hds-gaps/tone';

// Top-level safety net (issue #46): a render-time crash shows a recovery UI instead of a blank
// white screen. Offers a plain reload and a "reset local data" escape hatch for when a single bad
// localStorage record is the cause. No external error reporting (privacy) — logs to the console.
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
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rjb_'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 16, px: 'md', textAlign: 'center' }}>
        <Stack gap="tight" align="center">
          <Text variant="title" as="h1">
            Something broke
          </Text>
          <Text variant="body" style={SECONDARY}>
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening, a
            bad saved record may be the cause — resetting local data clears it.
          </Text>
          <Stack direction="row" gap="gap">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button variant="secondary" tone="danger" onClick={resetLocalData}>
              Reset local data
            </Button>
          </Stack>
        </Stack>
      </Box>
    );
  }
}

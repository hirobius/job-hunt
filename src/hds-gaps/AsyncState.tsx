// HDS gap (#115, spec docs/specs/discover.md): HDS has the parts of an async view (Skeleton, Alert,
// EmptyState) but no component that owns the four states a list goes through, so every panel hand-
// rolls them, and the Live postings spinner could spin forever. AsyncState renders one of
//   loading  Skeleton rows, plus a "still trying" note after `slowAfterMs`; never a bare spinner
//   error    a danger Alert with a Retry (and an offline wording when the browser says so)
//   empty    the caller's own empty state
//   ready    the children
// Filed upstream with the Phase 7 asks (#133) as an `AsyncState` pattern; delete this when it lands.
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Skeleton, Stack, Text } from '@hirobius/design-system';

export type AsyncStatus = 'loading' | 'error' | 'empty' | 'ready';

/** Placeholder rows shaped like a posting: a title line, a meta line, a row of badges. */
export function PostingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap="inset" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Stack key={i} gap="tight">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rectangular" width={160} height={20} />
        </Stack>
      ))}
    </Stack>
  );
}

export default function AsyncState({
  status,
  onRetry,
  loadingLabel = 'Loading',
  slowAfterMs = 10_000,
  slowNote,
  skeleton = <PostingSkeleton />,
  error,
  empty,
  children,
}: {
  status: AsyncStatus;
  /** Shown as a Retry button in the error state. */
  onRetry?: () => void;
  /** Announced to screen readers while loading. */
  loadingLabel?: string;
  /** How long loading may last before `slowNote` appears. */
  slowAfterMs?: number;
  slowNote?: string;
  skeleton?: ReactNode;
  error?: { title: string; message?: string };
  empty?: ReactNode;
  children?: ReactNode;
}) {
  if (status === 'loading')
    return (
      <Loading
        label={loadingLabel}
        slowAfterMs={slowAfterMs}
        slowNote={slowNote}
        skeleton={skeleton}
      />
    );
  if (status === 'error') {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const title = offline ? 'You’re offline' : (error?.title ?? 'Something went wrong');
    const message = offline ? 'Reconnect, then try again.' : error?.message;
    return (
      <Alert tone="danger" title={title}>
        <Stack gap="tight" align="start">
          {message && <Box>{message}</Box>}
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Stack>
      </Alert>
    );
  }
  if (status === 'empty') return <>{empty}</>;
  return <>{children}</>;
}

// Mounted only while loading, so its timer starts fresh each time a load begins.
function Loading({
  label,
  slowAfterMs,
  slowNote,
  skeleton,
}: {
  label: string;
  slowAfterMs: number;
  slowNote?: string;
  skeleton: ReactNode;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowNote) return;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs, slowNote]);
  return (
    <Stack gap="inset" aria-busy="true">
      <Text variant="caption" as="span" role="status" style={SECONDARY}>
        {slow && slowNote ? slowNote : label}
      </Text>
      {skeleton}
    </Stack>
  );
}

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

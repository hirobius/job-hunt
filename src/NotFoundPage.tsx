// An unknown route (`#/nope`, a mistyped or stale link) says so instead of silently showing
// Companies. Like Documents and the legal pages it has no tab selected; one action goes home.
import { Box, Button, Stack, Text } from '@hirobius/design-system';
import { FIND_TAB, navigate } from './route';

export default function NotFoundPage() {
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="normal" align="start">
        <Text variant="title" as="h1">
          Page not found
        </Text>
        <Text variant="body" as="p" tone="secondary">
          This link doesn&apos;t match a page here. It may be old or mistyped.
        </Text>
        <Button
          variant="primary"
          onClick={() => navigate({ tab: FIND_TAB, sub: null, jobId: null })}
        >
          Go to Review
        </Button>
      </Stack>
    </Box>
  );
}

import { Box, Link, Stack, Typography } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

const REPO_URL = 'https://github.com/hirobius/job-hunt';

/**
 * Designed "off" state for the AI features.
 *
 * The calls run server-side on an Anthropic API key (see ADR 0002). With no key
 * the functions return `not_configured`; rather than surface that as an error,
 * we show this intentional graceful-degradation panel — the rest of the app is
 * fully usable without it.
 */
export default function AiNotConfigured({ feature = 'The AI features' }: { feature?: string }) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'action.hover',
        p: 2.5,
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AutoAwesomeOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Live demo — AI runs on your own key
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {feature} stay dormant until an Anthropic API key is configured on the server — which
          keeps this public demo free to host and safe to share. Everything else in Apply Board
          works without it; this is the designed “off” state, not an error.
        </Typography>

        <Typography variant="body2" color="text.secondary">
          Running your own copy? Set{' '}
          <Box
            component="code"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.85em',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: 'action.selected',
            }}
          >
            ANTHROPIC_API_KEY
          </Box>{' '}
          and both features light up — nothing else changes.
        </Typography>

        <Link
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="body2"
          sx={{ fontWeight: 600 }}
        >
          See how the AI is built →
        </Link>
      </Stack>
    </Box>
  );
}

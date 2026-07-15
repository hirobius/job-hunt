import { Box, Container, Divider, Stack, Typography } from './ui/box';
import { Button, Card } from '@hirobius/design-system';
import { CASES } from './caseStudies';

const eyebrowSx = {
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 600,
  color: 'primary.main',
  fontSize: '0.72rem',
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ mt: 5 }}>
      <Typography variant="h2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function CaseStudyView({ slug }: { slug: string }) {
  const c = CASES[slug];
  const back = () => {
    const qp = new URLSearchParams(window.location.search);
    qp.delete('case');
    const s = qp.toString();
    window.location.href = window.location.pathname + (s ? '?' + s : '');
  };

  if (!c) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Case study not found
        </Typography>
        <Button variant="secondary" onClick={back}>
          Back to Apply Board
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Button variant="tertiary" onClick={back} style={{ marginBottom: 24, paddingLeft: 0 }}>
        ← Apply Board
      </Button>

      {/* Hero */}
      <Typography sx={eyebrowSx}>{c.eyebrow}</Typography>
      <Typography variant="h1" sx={{ mt: 1, mb: 1.5 }}>
        {c.title}
      </Typography>
      <Typography
        variant="subtitle1"
        color="text.secondary"
        sx={{ fontSize: '1.15rem', maxWidth: 640 }}
      >
        {c.tagline}
      </Typography>

      <Stack direction="row" spacing={1.5} sx={{ mt: 2.5, flexWrap: 'wrap', gap: 1 }}>
        {c.liveUrl && (
          <Button variant="primary" asChild>
            <a href={c.liveUrl} target="_blank" rel="noopener noreferrer">
              View live
            </a>
          </Button>
        )}
      </Stack>

      <Stack
        spacing={1}
        sx={{
          mt: 3,
          p: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {c.meta.map(([label, value]) => (
          <Box key={label} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography
              variant="caption"
              sx={{
                minWidth: 84,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                pt: '2px',
              }}
            >
              {label}
            </Typography>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Stack>

      <Box sx={{ mt: 3, pl: 2, borderLeft: 3, borderColor: 'primary.main' }}>
        <Typography variant="body1" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
          <Box component="span" sx={{ ...eyebrowSx, mr: 1 }}>
            Proves
          </Box>
          {c.proves}
        </Typography>
      </Box>

      <Section title="Problem">
        {c.problem.map((p, i) => (
          <Typography key={i} variant="body1" sx={{ mb: 1.5 }}>
            {p}
          </Typography>
        ))}
      </Section>

      <Section title="Approach">
        {c.approach.map((p, i) => (
          <Typography key={i} variant="body1" sx={{ mb: 1.5 }}>
            {p}
          </Typography>
        ))}
      </Section>

      <Section title="Key decisions & tradeoffs">
        <Stack spacing={1.5}>
          {c.decisions.map((d, i) => (
            <Card key={i} bordered>
              <Typography variant="h3" sx={{ mb: 0.75 }}>
                <Box component="span" sx={{ color: 'primary.main', mr: 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </Box>
                {d.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {d.body}
              </Typography>
            </Card>
          ))}
        </Stack>
      </Section>

      <Section title="Outcome">
        <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
          {c.outcome.map((p, i) => (
            <Typography key={i} component="li" variant="body1">
              {p}
            </Typography>
          ))}
        </Stack>
      </Section>

      <Section title="What I'd do next">
        <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
          {c.next.map((p, i) => (
            <Typography key={i} component="li" variant="body1">
              {p}
            </Typography>
          ))}
        </Stack>
      </Section>

      <Divider sx={{ mt: 5, mb: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Case study rendered inside the product it describes — same React + HDS design system, themed
        from one token file.
      </Typography>
    </Container>
  );
}

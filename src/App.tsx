import { useState } from 'react';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';

function Placeholder({ name }: { name: string }) {
  return (
    <Box sx={{ py: 6, textAlign: 'center' }}>
      <Typography color="text.secondary">
        {name} — porting into the new build next. Your live tool stays on the main site meanwhile.
      </Typography>
    </Box>
  );
}

export default function App() {
  const [tab, setTab] = useState(0);
  return (
    <Container maxWidth="md" sx={{ py: { xs: 2.5, sm: 4 } }}>
      <Typography variant="h1" sx={{ fontSize: 'clamp(2.2rem,7vw,3.4rem)', mb: 2 }}>
        Apply <Box component="span" sx={{ color: 'primary.main' }}>Board</Box>
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Queue" />
        <Tab label="Copy Deck" />
        <Tab label="Discover" />
      </Tabs>

      {tab === 0 && <TrackerView />}
      {tab === 1 && <Placeholder name="Copy Deck" />}
      {tab === 2 && <DiscoverView />}
    </Container>
  );
}

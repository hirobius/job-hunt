import { useState } from 'react';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';
import CopyDeckView from './CopyDeckView';
import CloudSync from './CloudSync';

export default function App() {
  const [tab, setTab] = useState(0);
  return (
    <Container maxWidth="md" sx={{ py: { xs: 2.5, sm: 4 } }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Apply <Box component="span" sx={{ color: 'primary.main' }}>Board</Box>
      </Typography>

      <CloudSync />

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
      {tab === 1 && <CopyDeckView />}
      {tab === 2 && <DiscoverView />}
    </Container>
  );
}

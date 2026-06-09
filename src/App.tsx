import { useEffect, useState } from 'react';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';
import CopyDeckView from './CopyDeckView';
import CloudSync from './CloudSync';
import { addJob, markAppliedByUrl } from './store';

export default function App() {
  const [tab, setTab] = useState(0);

  // Quick-add via ?add=<url> / ?applied=<url> (iOS shortcut, bookmarklet, one-tap links)
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    let acted = false;
    if (qp.get('add')) { addJob(qp.get('add')!, label); acted = true; }
    if (qp.get('applied')) { markAppliedByUrl(qp.get('applied')!, label); acted = true; }
    if (acted) {
      ['add', 'applied', 't', 'title'].forEach((k) => qp.delete(k));
      const s = qp.toString();
      window.history.replaceState(null, '', window.location.pathname + (s ? '?' + s : '') + window.location.hash);
      setTab(0);
    }
  }, []);

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

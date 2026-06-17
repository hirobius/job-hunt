import { useEffect, useState } from 'react';
import { Box, Container, Tab, Tabs, Typography } from '@mui/material';
import TrackerView from './TrackerView';
import DiscoverView from './DiscoverView';
import CopyDeckView from './CopyDeckView';
import CloudSync from './CloudSync';
import CaseStudyView from './CaseStudyView';
import { addJob, markAppliedByUrl, setStatusByUrl } from './store';
import { STATUSES } from './types';

export default function App() {
  const [tab, setTab] = useState(0);

  // Shareable portfolio case-study page: ?case=<slug> renders full-screen (no tab shell).
  const caseSlug = new URLSearchParams(window.location.search).get('case');

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links)
  useEffect(() => {
    if (caseSlug) return; // skip ingestion on the case-study page
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    let acted = false;
    if (qp.get('add')) { addJob(qp.get('add')!, label); acted = true; }
    if (qp.get('applied')) { markAppliedByUrl(qp.get('applied')!, label); acted = true; }
    const st = qp.get('status'), su = qp.get('u');
    if (st && su && (STATUSES as string[]).includes(st)) { setStatusByUrl(su, st as never, label); acted = true; }
    if (acted) {
      ['add', 'applied', 'status', 'u', 't', 'title'].forEach((k) => qp.delete(k));
      const s = qp.toString();
      window.history.replaceState(null, '', window.location.pathname + (s ? '?' + s : '') + window.location.hash);
      setTab(0);
    }
  }, [caseSlug]);

  if (caseSlug) return <CaseStudyView slug={caseSlug} />;

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

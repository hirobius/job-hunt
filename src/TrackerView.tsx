import { useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, IconButton, Link, Menu, MenuItem,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useTracker, hostOf, normStatus, daysSince } from './store';
import type { Job, Status } from './types';

type Filter = 'active' | 'all' | Status | 'retired';

const STATUS_COLOR: Record<Status, 'warning' | 'info' | 'secondary' | 'success' | 'error'> = {
  Saved: 'warning', Applied: 'info', Interviewing: 'secondary', Offer: 'success', Rejected: 'error',
};

function matches(j: Job, f: Filter): boolean {
  if (f === 'active') return !j.archived && (normStatus(j.status) === 'Saved' || !!j.priority);
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
  return !j.archived && normStatus(j.status) === f;
}

export default function TrackerView() {
  const { jobs, add, update, setStatus, remove } = useTracker();
  const [filter, setFilter] = useState<Filter>('active');
  const [url, setUrl] = useState('');
  const [menu, setMenu] = useState<{ el: HTMLElement; job: Job } | null>(null);

  const shown = useMemo(() => {
    return jobs
      .map((j, i) => ({ j, i }))
      .sort((a, b) => {
        const aa = a.j.archived ? 1 : 0, ba = b.j.archived ? 1 : 0;
        if (aa !== ba) return aa - ba;
        const pa = a.j.priority ? 0 : 1, pb = b.j.priority ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.i - b.i;
      })
      .map((x) => x.j)
      .filter((j) => matches(j, filter));
  }, [jobs, filter]);

  const submit = () => { add(url); setUrl(''); };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth size="small" placeholder="Paste a job URL…"
          value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <Button variant="contained" onClick={submit}>Add</Button>
      </Stack>

      <ToggleButtonGroup
        value={filter} exclusive size="small"
        onChange={(_, v) => v && setFilter(v)}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { border: 1, borderColor: 'divider', borderRadius: '999px !important', px: 1.5, py: 0.5, textTransform: 'none' } }}
      >
        <ToggleButton value="active">Active</ToggleButton>
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="Applied">Applied</ToggleButton>
        <ToggleButton value="Interviewing">Interviewing</ToggleButton>
        <ToggleButton value="Offer">Offer</ToggleButton>
        <ToggleButton value="Rejected">Rejected</ToggleButton>
        <ToggleButton value="retired">Retired</ToggleButton>
      </ToggleButtonGroup>

      {shown.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4 }}>
          {jobs.length === 0
            ? 'No saved jobs yet — paste a link above.'
            : filter === 'active'
              ? 'Nothing left to apply to right now — nice. Check Applied or add more jobs.'
              : `Nothing under “${filter}”.`}
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {shown.map((j) => {
            const status = normStatus(j.status);
            const d = daysSince(j.applied);
            const nudge = !j.archived && status === 'Applied' && d != null && d >= 7;
            return (
              <Card key={j.url} variant="outlined" sx={{ opacity: j.archived ? 0.55 : 1 }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link href={j.url} target="_blank" rel="noopener noreferrer" underline="hover" color="text.primary"
                        sx={{ fontWeight: 600, display: 'block', overflowWrap: 'anywhere' }}>
                        {j.label || hostOf(j.url) || 'Saved job'}
                      </Link>
                      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {hostOf(j.url)}
                        {status !== 'Saved' && j.applied ? ` · applied ${d === 0 ? 'today' : d + 'd ago'}` : ''}
                      </Typography>
                    </Box>
                    <Chip label={status} size="small" color={STATUS_COLOR[status]} variant="outlined" />
                    <IconButton size="small" onClick={(e) => setMenu({ el: e.currentTarget, job: j })} aria-label="More actions">
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                    {status === 'Saved' && (
                      <Button size="small" variant="contained" color="info" onClick={() => setStatus(j.url, 'Applied')}>
                        Mark applied
                      </Button>
                    )}
                    {nudge && <Chip size="small" color="warning" label="Follow up" />}
                    {j.priority && <Chip size="small" color="primary" variant="outlined" label="Priority" />}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu && normStatus(menu.job.status) === 'Saved' && (
          <MenuItem onClick={() => { setStatus(menu.job.url, 'Applied'); setMenu(null); }}>Mark applied</MenuItem>
        )}
        {menu && (
          <MenuItem onClick={() => { update(menu.job.url, { priority: !menu.job.priority }); setMenu(null); }}>
            {menu.job.priority ? 'Unpin priority' : 'Pin as priority'}
          </MenuItem>
        )}
        {menu && (
          <MenuItem onClick={() => { update(menu.job.url, { archived: !menu.job.archived }); setMenu(null); }}>
            {menu.job.archived ? 'Unretire' : 'Retire'}
          </MenuItem>
        )}
        {menu && (
          <MenuItem onClick={() => { remove(menu.job.url); setMenu(null); }} sx={{ color: 'error.main' }}>
            Remove
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}

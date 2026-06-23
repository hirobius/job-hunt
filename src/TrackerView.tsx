import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  useJobs,
  addJob,
  updateJob,
  setStatus,
  removeJob,
  logFollowUp,
  prettyTitle,
  shortUrl,
  normStatus,
  daysSince,
} from './store';
import type { Job, Status } from './types';

type Filter = 'active' | 'all' | Status | 'retired';
const FOLLOWUP_DAYS = 7;

const STATUS_COLOR: Record<Status, 'warning' | 'info' | 'secondary' | 'success' | 'error'> = {
  Saved: 'warning',
  Applied: 'info',
  Interviewing: 'secondary',
  Offer: 'success',
  Rejected: 'error',
};

function matches(j: Job, f: Filter): boolean {
  if (f === 'active') return !j.archived && (normStatus(j.status) === 'Saved' || !!j.priority);
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
  return !j.archived && normStatus(j.status) === f;
}

function exportCsv(jobs: Job[]) {
  const rows = [
    [
      'label',
      'url',
      'status',
      'applied',
      'resume',
      'contact',
      'salary',
      'priority',
      'retired',
      'note',
    ],
  ];
  jobs.forEach((j) =>
    rows.push([
      j.label,
      j.url,
      normStatus(j.status),
      j.applied || '',
      j.resume || '',
      j.contact || '',
      j.salary || '',
      j.priority ? 'yes' : '',
      j.archived ? 'yes' : '',
      j.note || '',
    ]),
  );
  const csv = rows
    .map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply-board.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function research(label: string) {
  const q = encodeURIComponent(label || '');
  return [
    ['Glassdoor', `https://www.glassdoor.com/Search/results.htm?keyword=${q}`],
    ['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
    ['levels.fyi', `https://www.levels.fyi/?search=${q}`],
    ['Google', `https://www.google.com/search?q=${q}+careers+reviews`],
  ];
}

export default function TrackerView() {
  const jobs = useJobs();
  const [filter, setFilter] = useState<Filter>('active');
  const [url, setUrl] = useState('');
  const [menu, setMenu] = useState<{ el: HTMLElement; job: Job } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const shown = useMemo(
    () =>
      jobs
        .map((j, i) => ({ j, i }))
        .sort((a, b) => {
          const aa = a.j.archived ? 1 : 0,
            ba = b.j.archived ? 1 : 0;
          if (aa !== ba) return aa - ba;
          const pa = a.j.priority ? 0 : 1,
            pb = b.j.priority ? 0 : 1;
          if (pa !== pb) return pa - pb;
          return a.i - b.i;
        })
        .map((x) => x.j)
        .filter((j) => matches(j, filter)),
    [jobs, filter],
  );

  const submit = () => {
    addJob(url);
    setUrl('');
  };
  const fld = (j: Job, key: keyof Job, label: string, multiline = false) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      value={(j[key] as string) || ''}
      onChange={(e) => updateJob(j.url, { [key]: e.target.value })}
    />
  );

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Paste a job URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <Button variant="contained" onClick={submit}>
          Add
        </Button>
      </Stack>

      <Stack direction="row" alignItems="center" sx={{ mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          size="small"
          onChange={(_, v) => v && setFilter(v)}
          sx={{
            flexWrap: 'wrap',
            gap: 0.5,
            '& .MuiToggleButton-root': {
              border: 1,
              borderColor: 'divider',
              borderRadius: '999px !important',
              px: 1.5,
              py: 0.5,
              textTransform: 'none',
            },
          }}
        >
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="Applied">Applied</ToggleButton>
          <ToggleButton value="Interviewing">Interviewing</ToggleButton>
          <ToggleButton value="Offer">Offer</ToggleButton>
          <ToggleButton value="Rejected">Rejected</ToggleButton>
          <ToggleButton value="retired">Retired</ToggleButton>
        </ToggleButtonGroup>
        <Button
          size="small"
          sx={{ ml: 'auto' }}
          disabled={!jobs.length}
          onClick={() => exportCsv(jobs)}
        >
          Export CSV
        </Button>
      </Stack>

      {shown.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4 }}>
          {jobs.length === 0
            ? 'No saved jobs yet — paste a link above, or save some from Discover.'
            : filter === 'active'
              ? 'Nothing left to apply to right now — nice. Check Applied or add more jobs.'
              : `Nothing under “${filter}”.`}
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {shown.map((j) => {
            const status = normStatus(j.status);
            const dApplied = daysSince(j.applied);
            const tracksFollowup = status === 'Applied' || status === 'Interviewing';
            const refAge = daysSince(j.followUp || j.applied);
            const due = !j.archived && tracksFollowup && refAge != null && refAge >= FOLLOWUP_DAYS;
            const isOpen = !!open[j.url];
            return (
              <Card key={j.url} variant="outlined" sx={{ opacity: j.archived ? 0.55 : 1 }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={j.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        color="text.primary"
                        sx={{ fontWeight: 600, display: 'block', overflowWrap: 'anywhere' }}
                      >
                        {j.label || prettyTitle(j.url)}
                      </Link>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ overflowWrap: 'anywhere' }}
                      >
                        {shortUrl(j.url)}
                        {status !== 'Saved' && j.applied
                          ? ` · applied ${dApplied === 0 ? 'today' : dApplied + 'd ago'}`
                          : ''}
                        {j.followUp
                          ? ` · followed up ${daysSince(j.followUp) === 0 ? 'today' : daysSince(j.followUp) + 'd ago'}`
                          : ''}
                      </Typography>
                    </Box>
                    {status !== 'Saved' && (
                      <Chip
                        label={status}
                        size="small"
                        color={STATUS_COLOR[status]}
                        variant="outlined"
                      />
                    )}
                    <IconButton
                      size="small"
                      onClick={(e) => setMenu({ el: e.currentTarget, job: j })}
                      aria-label="More actions"
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1.25 }}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {status === 'Saved' && (
                      <Button
                        size="small"
                        variant="contained"
                        color="info"
                        onClick={() => setStatus(j.url, 'Applied')}
                      >
                        Mark applied
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setOpen((p) => ({ ...p, [j.url]: !p[j.url] }))}
                    >
                      {isOpen ? 'Hide' : 'Details'}
                    </Button>
                    {tracksFollowup && due && (
                      <>
                        <Chip size="small" color="warning" label="Follow up now" />
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => logFollowUp(j.url)}
                        >
                          Log follow-up
                        </Button>
                      </>
                    )}
                    {tracksFollowup && !due && refAge != null && (
                      <Typography variant="caption" color="text.secondary">
                        Follow up in {FOLLOWUP_DAYS - refAge}d
                      </Typography>
                    )}
                    {j.priority && (
                      <Chip size="small" color="primary" variant="outlined" label="Priority" />
                    )}
                  </Stack>

                  <Collapse in={isOpen}>
                    <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                      {fld(j, 'label', 'Title')}
                      {fld(j, 'note', 'Notes', true)}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        {fld(j, 'contact', 'Contact / referral')}
                        {fld(j, 'resume', 'Résumé version')}
                      </Stack>
                      {fld(j, 'salary', 'Salary')}
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {research(j.label).map(([name, href]) => (
                          <Button
                            key={name}
                            size="small"
                            variant="outlined"
                            component={Link}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {name}
                          </Button>
                        ))}
                      </Box>
                    </Stack>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu && normStatus(menu.job.status) === 'Saved' && (
          <MenuItem
            onClick={() => {
              setStatus(menu.job.url, 'Applied');
              setMenu(null);
            }}
          >
            Mark applied
          </MenuItem>
        )}
        {menu && (
          <MenuItem
            onClick={() => {
              updateJob(menu.job.url, { priority: !menu.job.priority });
              setMenu(null);
            }}
          >
            {menu.job.priority ? 'Unpin priority' : 'Pin as priority'}
          </MenuItem>
        )}
        {menu && (
          <MenuItem
            onClick={() => {
              updateJob(menu.job.url, { archived: !menu.job.archived });
              setMenu(null);
            }}
          >
            {menu.job.archived ? 'Unretire' : 'Retire'}
          </MenuItem>
        )}
        {menu && (
          <MenuItem
            onClick={() => {
              removeJob(menu.job.url);
              setMenu(null);
            }}
            sx={{ color: 'error.main' }}
          >
            Remove
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}

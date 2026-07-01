import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Fade,
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
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import {
  useJobs,
  addJob,
  updateJob,
  setStatus,
  removeJob,
  logFollowUp,
  prettyTitle,
  shortUrl,
} from './store';
import { deriveJobState } from './jobState';
import { sortJobs, SORTS, type SortKey } from './jobSort';
import EmptyState from './EmptyState';
import type { Job, Status } from './types';

// Lazy so the AI code (and its chunks) only load when the user opens them —
// keeps the initial Queue bundle lean.
const AiIntakeDialog = lazy(() => import('./ai/AiIntakeDialog'));
const TailorDialog = lazy(() => import('./ai/TailorDialog'));

type Filter = 'active' | 'all' | Status | 'retired';

const STATUS_COLOR: Record<Status, 'warning' | 'info' | 'secondary' | 'success' | 'error'> = {
  Saved: 'warning',
  Applied: 'info',
  Interviewing: 'secondary',
  Offer: 'success',
  Rejected: 'error',
};

function matches(j: Job, f: Filter): boolean {
  const s = deriveJobState(j);
  if (f === 'active') return s.isActive;
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
  return !j.archived && s.status === f;
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
      deriveJobState(j).status,
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
  const [sort, setSort] = useState<SortKey>('recent');
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const [url, setUrl] = useState('');
  const [menu, setMenu] = useState<{ el: HTMLElement; job: Job } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMounted, setAiMounted] = useState(false); // mount once, then animate open/close
  const openAi = () => {
    setAiMounted(true);
    setAiOpen(true);
  };
  const [tailorJob, setTailorJob] = useState<Job | null>(null);
  // Transient "Saved ✓" flash after a detail field autosaves (per job url).
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashSaved = (u: string) => {
    setSavedUrl(u);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedUrl(null), 1200);
  };

  const shown = useMemo(
    () => sortJobs(jobs, sort).filter((j) => matches(j, filter)),
    [jobs, filter, sort],
  );
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '';

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
      onChange={(e) => {
        updateJob(j.url, { [key]: e.target.value });
        flashSaved(j.url);
      }}
    />
  );

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Paste a job URL…"
          slotProps={{ htmlInput: { 'aria-label': 'Job URL' } }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <Stack direction="row" spacing={1} sx={{ flex: 'none' }}>
          <Button variant="contained" onClick={submit} sx={{ flex: { xs: 1, sm: 'none' } }}>
            Add
          </Button>
          <Button
            variant="outlined"
            startIcon={<AutoAwesomeOutlinedIcon />}
            onClick={openAi}
            sx={{ flex: { xs: 1, sm: 'none' }, whiteSpace: 'nowrap' }}
          >
            Add with AI
          </Button>
        </Stack>
      </Stack>

      {/* Filters get the full row to themselves (horizontally scrollable — a partially
          visible pill is the scroll affordance); sort/export live on their own line below.
          Sharing one row squeezed the filters to a single pill on phones. */}
      <Box sx={{ mb: 0.5, overflowX: 'auto', pb: 0.5 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          size="small"
          aria-label="Filter jobs by status"
          onChange={(_, v) => v && setFilter(v)}
          sx={{
            flexWrap: 'nowrap',
            gap: 0.5,
            '& .MuiToggleButton-root': {
              flex: 'none',
              border: 1,
              borderColor: 'divider',
              borderRadius: '999px !important',
              px: 1.5,
              py: 0.5,
              textTransform: 'none',
              whiteSpace: 'nowrap',
            },
          }}
        >
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="Saved">Saved</ToggleButton>
          <ToggleButton value="Applied">Applied</ToggleButton>
          <ToggleButton value="Interviewing">Interviewing</ToggleButton>
          <ToggleButton value="Offer">Offer</ToggleButton>
          <ToggleButton value="Rejected">Rejected</ToggleButton>
          <ToggleButton value="retired">Retired</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="flex-end"
        sx={{ mb: 2 }}
      >
        <Button
          size="small"
          startIcon={<SwapVertIcon />}
          onClick={(e) => setSortAnchor(e.currentTarget)}
          aria-haspopup="true"
          sx={{ whiteSpace: 'nowrap' }}
        >
          {sortLabel}
        </Button>
        <Button size="small" disabled={!jobs.length} onClick={() => exportCsv(jobs)}>
          Export CSV
        </Button>
      </Stack>

      <Menu anchorEl={sortAnchor} open={!!sortAnchor} onClose={() => setSortAnchor(null)}>
        {SORTS.map((s) => (
          <MenuItem
            key={s.key}
            selected={s.key === sort}
            onClick={() => {
              setSort(s.key);
              setSortAnchor(null);
            }}
          >
            {s.label}
          </MenuItem>
        ))}
      </Menu>

      {shown.length === 0 ? (
        <EmptyState
          message={
            jobs.length === 0
              ? 'No saved jobs yet — paste a link above, or save some from Discover.'
              : filter === 'active'
                ? 'Nothing left to apply to right now — nice. Check Applied or add more jobs.'
                : `Nothing under “${filter}”.`
          }
        />
      ) : (
        <Stack spacing={1.25}>
          {shown.map((j) => {
            const s = deriveJobState(j);
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
                        {s.status !== 'Saved' && s.appliedDaysAgo != null
                          ? ` · applied ${s.appliedDaysAgo === 0 ? 'today' : s.appliedDaysAgo + 'd ago'}`
                          : ''}
                        {s.followUp.loggedDaysAgo != null
                          ? ` · followed up ${s.followUp.loggedDaysAgo === 0 ? 'today' : s.followUp.loggedDaysAgo + 'd ago'}`
                          : ''}
                      </Typography>
                    </Box>
                    {s.status !== 'Saved' && (
                      <Chip
                        label={s.status}
                        size="small"
                        color={STATUS_COLOR[s.status]}
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
                    {s.isApplyable && (
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
                    {s.followUp.due && (
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
                    {s.followUp.daysUntil != null && (
                      <Typography variant="caption" color="text.secondary">
                        Follow up in {s.followUp.daysUntil}d
                      </Typography>
                    )}
                    {j.priority && (
                      <Chip size="small" color="primary" variant="outlined" label="Priority" />
                    )}
                  </Stack>

                  <Collapse in={isOpen}>
                    <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                      <Box sx={{ height: 18, textAlign: 'right' }}>
                        <Fade in={savedUrl === j.url}>
                          <Typography variant="caption" color="success.main">
                            Saved ✓
                          </Typography>
                        </Fade>
                      </Box>
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
        {menu && deriveJobState(menu.job).isApplyable && (
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
              setTailorJob(menu.job);
              setMenu(null);
            }}
          >
            Tailor résumé with AI
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

      {aiMounted && (
        <Suspense fallback={null}>
          <AiIntakeDialog open={aiOpen} onClose={() => setAiOpen(false)} />
        </Suspense>
      )}
      {tailorJob && (
        <Suspense fallback={null}>
          <TailorDialog open job={tailorJob} onClose={() => setTailorJob(null)} />
        </Suspense>
      )}
    </Box>
  );
}

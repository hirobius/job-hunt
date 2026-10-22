// A saved job's own page (#127, #130): `#/queue/<jobId>`, inside the Pipeline tab. A header
// (badges, title, one next step, menu) over the job's three sections as tabs. The open section is in
// the URL (`?section=screening`, Overview left out; return paths), written in place, so coming back
// to the job (Back from its Company page, from Find more like this) opens the section it was on.
import { useEffect } from 'react';
import {
  Badge,
  Box,
  Skeleton,
  Stack,
  Text,
  Sidebar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useAtLeast,
} from '@hirobius/design-system';
import { findJobById, useJobs } from './store';
import { titleOf } from './jobRow';
import { usePageTitle } from './pageTitle';
import { goBackTo, navigate, openJob, originOf, useRoute } from './route';
import { scrollToTop } from './scrollMemory';
import { useCloudSync } from './account/accountContext';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobRail from './JobRail';
import JobScreening from './JobScreening';
import JobInterviews from './JobInterviews';
import type { Job } from './types';

// Three sections (rev-3 F, Adrian 2026-10-21): Overview holds the details, to-dos, notes and the
// job's documents; then Screening and Interviews. Few enough for a 390px phone, and HDS TabsList
// fades its own edge and keeps the selected tab in view if they ever outrun it.
function JobSections({
  job,
  tab,
  setTab,
}: {
  job: Job;
  tab: string;
  setTab: (tab: string) => void;
}) {
  const n = job.events?.length ?? 0;
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Job sections" className="rjb-job-tabs">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="screening">Screening</TabsTrigger>
        {/* Every count is the small neutral pill (rev-2 #2), as on the panels. */}
        <TabsTrigger value="interviews">
          <Stack as="span" direction="row" gap="px8" align="center">
            Interviews
            {n > 0 && <Badge count={n} label={`${n} booked`} />}
          </Stack>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" variant="bare">
        <Box sx={{ pt: 'sm' }}>
          <JobOverview job={job} />
        </Box>
      </TabsContent>
      <TabsContent value="screening" variant="bare">
        <Box sx={{ pt: 'sm' }}>
          <JobScreening job={job} />
        </Box>
      </TabsContent>
      <TabsContent value="interviews" variant="bare">
        <Box sx={{ pt: 'sm' }}>
          <JobInterviews job={job} />
        </Box>
      </TabsContent>
    </Tabs>
  );
}

const SECTIONS = ['overview', 'screening', 'interviews'];

/** The header over the tabs. The open section comes from the route, so the header's Add interview
 *  can switch to Interviews and a link can open one (Next 7 days opens Interviews). */
function JobDetail({ job, showBack }: { job: Job; showBack: boolean }) {
  const section = useRoute().section;
  const tab = section && SECTIONS.includes(section) ? section : 'overview';
  // In place: a section is a view of this entry, not a step Back walks through.
  const setTab = (t: string) => navigate({ section: t === 'overview' ? null : t }, true);
  return (
    <Box>
      <JobHeader job={job} showBack={showBack} onAddInterview={() => setTab('interviews')} />
      <JobSections job={job} tab={tab} setTab={setTab} />
    </Box>
  );
}

function JobPageSkeleton() {
  return (
    <Box aria-busy="true" sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Text variant="ui" as="p" role="status" tone="secondary">
        Looking for this job. It may still be syncing to this device.
      </Text>
      <Stack gap="normal" aria-hidden="true">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="35%" />
        <Skeleton variant="rectangular" height={120} />
      </Stack>
    </Box>
  );
}

export default function JobPage({ jobId }: { jobId: string }) {
  const job = findJobById(jobId, useJobs());
  usePageTitle(job ? titleOf(job) : 'Job');
  // An unknown id may just not have synced onto this device yet: wait until sync has settled,
  // then fall back to the page that linked here (else the Pipeline) without a new history entry.
  const { settled } = useCloudSync();
  const route = useRoute();
  const origin = originOf(route);

  useEffect(() => {
    if (job || !settled) return;
    const back = originOf(route);
    if (back) goBackTo(back);
    else openJob(null, true);
    // Only when the job or sync changes: the route is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, settled]);

  // Opening a job from far down the list should start at its top, not at the list's scroll offset
  // (coming back to it restores where it was instead).
  useEffect(() => {
    scrollToTop();
  }, [jobId]);

  // HDS Sidebar only wraps with CSS, so below lg it would stack the list above the job: choose in
  // JS and show the job alone, with a Back link, instead.
  const wide = useAtLeast('lg');

  // Not found yet: it may be about to sync in, so wait quietly. Once sync has settled the effect
  // above has already sent us back to the Pipeline.
  if (!job) return <JobPageSkeleton />;

  // Keyed by job, so every field's draft resets when the job changes. At lg the rail stands in for
  // Back to the Pipeline, but a job opened from elsewhere (Companies, a Company page) shows its Back.
  const detail = <JobDetail key={job.url} job={job} showBack={!wide || !!origin} />;
  if (wide)
    return (
      <Sidebar side="start" sideWidth="22rem" contentMin="50%" gap="normal">
        <JobRail openId={jobId} />
        {detail}
      </Sidebar>
    );
  return <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>{detail}</Box>;
}

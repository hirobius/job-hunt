// A Company's page (#230, epic #225; #471 slice 2): `#/apply/company/<slug>`, in the Apply tab's
// right column at lg. A Company is derived from the company
// names on Jobs (src/companies.ts), so this page lists what it holds: its Jobs, the Documents on
// them or naming it, and its own Notes, which can be added and edited here (each save a Version).
// Rev-3 mock: "← Pipeline" on the page's left edge, then Jobs, Documents and Notes as Pipeline
// panels (count badges on the first two); a job row reads like a Pipeline card.
import { useContext, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  InlineLink,
  Sidebar,
  Skeleton,
  Stack,
  Text,
  Textarea,
  useAtLeast,
} from '@hirobius/design-system';
import JobRail from './JobRail';
import { EmptyState } from './hds-gaps/EmptyState';
import { Building2 } from 'lucide-react';
import { addCompanyNote, useCompany } from './companies';
import {
  DOCUMENT_KINDS,
  getAllDocuments,
  isFinalCopy,
  removeDocument,
  restoreDocument,
  saveVersion,
  type Document,
} from './documents';
import { collapseRow } from './feedback';
import { notifyRemoved, showNotice } from './saveNotice';
import { buildHash, linkTo, navigate, parseHash, useRoute, type Route } from './route';
import BackLink from './BackLink';
import { backClick, useBack } from './back';
import { jobIdOf } from './store';
import { JobBadges, RowPrimaryAction } from './JobRowParts';
import { titleOf } from './jobRow';
import { deriveJobState, savedAgo } from './jobState';
import { Panel, PanelBody, PanelRow } from './PipelinePanel';
import { JobPostingTitle } from './PostingLink';
import type { Job } from './types';
import { usePageTitle } from './pageTitle';
import CompanyLogo from './CompanyLogo';
import { CloudSyncContext } from './account/accountContext';

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;
// Fields fill the column (a Box sx, not an inline style: the #133 ratchet).
const kindLabel = (d: Document) => DOCUMENT_KINDS.find((k) => k.kind === d.kind)?.label ?? d.kind;
const latest = (d: Document) => d.versions[d.versions.length - 1];
const versions = (n: number) => (n === 1 ? '1 version' : `${n} versions`);
const day = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/** "Applied 10 days ago", else "Saved 3 days ago". */
function jobMeta(job: Job): string {
  const d = deriveJobState(job).appliedDaysAgo;
  if (d == null) return savedAgo(job);
  return d <= 0 ? 'Applied today' : `Applied ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/** One job, like a Pipeline card: badges above the title (the row's link, a 40px target) with the
 *  posting's icon link beside it, a meta line, and the one next step on the right. */
function CompanyJobRow({ job }: { job: Job }) {
  const meta = jobMeta(job);
  // The job page remembers this Company page, so its Back returns here (return paths).
  const href = linkTo({ tab: 'apply', jobId: jobIdOf(job.url) }, useRoute());
  return (
    <PanelRow>
      <Stack direction="row" gap="xs" align="center" justify="space-between">
        <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
          <Stack gap="px4">
            <JobBadges job={job} />
            <JobPostingTitle job={job}>
              <Text variant="body" as="h3" weight="bold" className="rjb-row-title">
                <InlineLink href={href} externalIcon={false}>
                  {titleOf(job)}
                </InlineLink>
              </Text>
            </JobPostingTitle>
            {meta && (
              <Text variant="caption" as="p" tone="secondary">
                {meta}
              </Text>
            )}
          </Stack>
        </Box>
        <RowPrimaryAction job={job} size="md" />
      </Stack>
    </PanelRow>
  );
}

const Quiet = ({ children }: { children: ReactNode }) => (
  <Text variant="caption" as="p" tone="secondary">
    {children}
  </Text>
);

/** Remove a company Note (#305, soft like every Remove): its row collapses, then it goes, and a
 *  notice offers Undo, which puts it back in its place. Read when the removal lands. A notes-only
 *  company's last note takes its page with it: `last` goes back from there, and Undo reopens it. */
function removeNote(id: string, from: Element, last?: { back: () => void; reopen: string }) {
  collapseRow(from, () => {
    const all = getAllDocuments();
    const at = all.findIndex((x) => x.id === id);
    const note = all[at];
    if (!note || !removeDocument(id)) return;
    last?.back();
    notifyRemoved('Removed the note', () => {
      if (!restoreDocument(note, at))
        return showNotice({
          title: "The note couldn't be put back",
          description: "This device's storage is full.",
          actions: [],
        });
      if (last) navigate(parseHash(last.reopen), false, { restore: true });
    });
  });
}

/** One company Note: its latest text, saved as a new Version when it changes. `name` tells it
 *  apart from the others ("Note 2 of 3"), for its field and its Remove. */
function NoteEditor({
  note,
  name,
  last,
}: {
  note: Document;
  name: string;
  last?: { back: () => void; reopen: string };
}) {
  const text = latest(note).text;
  const [draft, setDraft] = useState(text);
  // A newer Version synced in: an untouched draft follows it, so Save never re-saves older text.
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    if (draft === seen) setDraft(text);
    setSeen(text);
  }
  return (
    <Stack gap="tight">
      <Box className="rjb-form-full">
        <Textarea
          aria-label={name}
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </Box>
      <Stack direction="row" gap="normal" align="center" wrap="wrap">
        <Button
          variant="secondary"
          size="sm"
          disabled={draft === text}
          onClick={() => saveVersion(note.id, draft)}
        >
          Save note
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          aria-label={`Remove ${name.toLowerCase()}`}
          onClick={(e) => removeNote(note.id, e.currentTarget, last)}
        >
          Remove
        </Button>
        <Quiet>{`Saved ${day(latest(note).savedAt)} · ${versions(note.versions.length)}`}</Quiet>
      </Stack>
    </Stack>
  );
}

function NewNote({ company, action }: { company: string; action: string }) {
  const [draft, setDraft] = useState('');
  return (
    <Stack gap="tight">
      <Box className="rjb-form-full">
        <Textarea
          aria-label="New note"
          placeholder="Note"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </Box>
      <Box>
        <Button
          variant="secondary"
          size="sm"
          disabled={!draft.trim()}
          onClick={() => {
            addCompanyNote(company, draft);
            setDraft('');
          }}
        >
          {action}
        </Button>
      </Box>
    </Stack>
  );
}

const PIPELINE: Route = { tab: 'apply', sub: null, pillar: null, jobId: null };

/** An unknown slug before sync settles: its jobs may still be on their way (like the job page). */
function CompanyPageSkeleton() {
  return (
    <Box aria-busy="true" sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Text variant="ui" as="p" role="status" tone="secondary">
        Looking for this company. It may still be syncing to this device.
      </Text>
      <Stack gap="normal" aria-hidden="true">
        <Skeleton variant="text" width="45%" />
        <Skeleton variant="rectangular" height={120} />
      </Stack>
    </Box>
  );
}

export default function CompanyPage({ slug }: { slug: string }) {
  const company = useCompany(slug);
  usePageTitle(company?.name ?? 'Company');
  const back = useBack(PIPELINE, 'Apply');
  const route = useRoute();
  // HDS Sidebar only wraps with CSS: choose in JS (like JobPage).
  const wide = useAtLeast('lg');
  // Read the context directly: this page also renders on its own in tests, outside the provider.
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  if (!company && !settled) return <CompanyPageSkeleton />;
  if (!company)
    return (
      <EmptyState
        framed
        icon={Building2}
        title="No company here"
        description="Companies come from the company name on a job. This one may have been renamed."
        action={
          // Usually renamed from the job page it was opened from: back there, by name.
          <Button asChild variant="secondary">
            <a href={back.href} onClick={backClick(back)}>
              {back.recorded ? `Back to ${back.label}` : 'Go to the Pipeline'}
            </a>
          </Button>
        }
      />
    );

  const docs = company.documents.length;
  // The one note is all that keeps this page: removing it goes back (like Remove on a job page).
  const onlyNote = !company.jobs.length && !docs && company.notes.length === 1;
  const page = (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="normal">
        <Stack gap="tight">
          {/* "← Pipeline", the job page's Back, with no leading padding so the arrow sits on the
              page gutter with the title (`.rjb-back-link`; its box stays inside the gutter). Opened
              from a job, it names that job and goes back to it (return paths). */}
          <BackLink fallback={PIPELINE} fallbackLabel="Apply" />
          <Text variant="title" as="h1">
            {company.name}
          </Text>
          {/* The mark sits with the job count, so the Back arrow and the heading keep one edge. */}
          <Stack direction="row" gap="px8" align="center">
            <CompanyLogo company={company.name} postings={company.jobs.map((j) => j.url)} />
            <Quiet>{company.jobs.length === 1 ? '1 job' : `${company.jobs.length} jobs`}</Quiet>
          </Stack>
        </Stack>

        <Panel
          label="Jobs"
          title="Jobs"
          count={company.jobs.length}
          countLabel={company.jobs.length === 1 ? '1 job' : `${company.jobs.length} jobs`}
        >
          {company.jobs.length ? (
            <ul aria-label={`Jobs at ${company.name}`} style={LIST}>
              {company.jobs.map((j) => (
                <CompanyJobRow key={j.url} job={j} />
              ))}
            </ul>
          ) : (
            <PanelBody>
              <Quiet>No jobs at this company right now. Its notes stay here.</Quiet>
            </PanelBody>
          )}
        </Panel>

        <Panel
          label="Documents"
          title="Documents"
          count={docs}
          countLabel={docs === 1 ? '1 document' : `${docs} documents`}
        >
          {docs ? (
            <ul aria-label={`Documents for ${company.name}`} style={LIST}>
              {company.documents.map((d) => (
                <PanelRow key={d.id}>
                  <Stack gap="px2">
                    <Text variant="ui" as="span">
                      {/* One tap to where it is edited, whose Back names this company (return
                          paths): a job's own document lives on its job page (#328), a Base one
                          in the editor. */}
                      {isFinalCopy(d) ? (
                        // An uploaded file: the text editor has nothing to edit (its job has it).
                        d.title || kindLabel(d)
                      ) : (
                        <InlineLink
                          href={linkTo(
                            !d.base && d.jobUrl && company.jobs.some((j) => j.url === d.jobUrl)
                              ? { tab: 'apply', jobId: jobIdOf(d.jobUrl) }
                              : { tab: 'copy-deck', sub: encodeURIComponent(d.id) },
                            route,
                          )}
                          externalIcon={false}
                        >
                          {d.title || kindLabel(d)}
                        </InlineLink>
                      )}
                    </Text>
                    <Text variant="caption" as="span" tone="secondary">
                      {`${kindLabel(d)} · ${versions(d.versions.length)}`}
                    </Text>
                  </Stack>
                </PanelRow>
              ))}
            </ul>
          ) : (
            <PanelBody>
              <Quiet>None sent yet.</Quiet>
            </PanelBody>
          )}
        </Panel>

        <Panel label="Notes" title="Notes">
          <PanelBody>
            <Stack gap="normal">
              {company.notes.length > 0 && (
                <Stack as="ul" gap="normal" aria-label={`Notes on ${company.name}`} style={LIST}>
                  {company.notes.map((n, i, all) => (
                    <li key={n.id}>
                      <NoteEditor
                        note={n}
                        name={all.length > 1 ? `Note ${i + 1} of ${all.length}` : 'Note'}
                        last={onlyNote ? { back: back.go, reopen: buildHash(route) } : undefined}
                      />
                    </li>
                  ))}
                </Stack>
              )}
              <NewNote
                company={company.name}
                action={company.notes.length ? 'Add note' : 'Save note'}
              />
            </Stack>
          </PanelBody>
        </Panel>
      </Stack>
    </Box>
  );
  // At lg the Apply list sits beside it, as beside a job (#471 slice 2: Company in the right
  // column). Below lg it stands alone with its Back.
  if (wide)
    return (
      <Sidebar side="start" sideWidth="22rem" contentMin="50%" gap="normal">
        <JobRail openId="" />
        {page}
      </Sidebar>
    );
  return page;
}

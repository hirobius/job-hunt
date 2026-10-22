// The job page's Overview (#130; rev-3 F, three tabs): Details, To-dos, Notes and Documents as
// panels. Details reads as a facts list; Edit turns the same panel into its fields (title,
// company, location, pay, link, contact, with seniority and résumé version under More fields).
// A job saved from a bare link has nothing to read yet, so its card starts in edit. Remove lives
// in the header's menu. The company links to its Company page (#230, `#/company/<slug>`).
import { useRef, useState } from 'react';
import { ExternalLink, Pencil } from 'lucide-react';
import {
  Box,
  Button,
  Disclosure,
  Icon,
  InlineLink,
  Input,
  MetadataList,
  Stack,
  Switcher,
  Text,
} from '@hirobius/design-system';
import { jobIdOf, setJobUrl, updateJob } from './store';
import { companyHash, openJob } from './route';
import { companySlug, relinkCompanyNotes } from './companies';
import { jobFacts } from './jobFacts';
import { useSavedFlash } from './useSavedFlash';
import UseTemplate from './UseTemplate';
import { Panel, PanelBody } from './PipelinePanel';
import { NotesPanel, TodosPanel } from './TodosNotes';
import JobDocuments from './JobDocuments';
import JobFinalCopies from './JobFinalCopies';
import { DocumentDownload } from './DocumentDownload';
import { useDocuments } from './documents';
import { documentsForJob, sentSummary } from './jobDocuments';
import type { Job } from './types';

/** A text field that writes straight through to the job and tells the page it saved. */
function JobField({
  job,
  field,
  label,
  onSaved,
}: {
  job: Job;
  field: keyof Job;
  label: string;
  onSaved: () => void;
}) {
  // The company name as it was when the field was entered: on leaving it, that name's company
  // Notes follow the rename when no other job keeps it (#230, companies.ts).
  const before = useRef('');
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <Input
        label={label}
        value={(job[field] as string) || ''}
        onFocus={(e) => {
          before.current = e.target.value;
        }}
        onBlur={(e) => {
          if (field === 'company') relinkCompanyNotes(before.current, e.target.value);
        }}
        onChange={(e) => {
          updateJob(job.url, { [field]: e.target.value });
          onSaved();
        }}
      />
    </Box>
  );
}

/** The job's link. It is the job's identity (its page id comes from it), so it saves on blur and
 *  the page follows the job to its new id. */
function LinkField({ job }: { job: Job }) {
  const [draft, setDraft] = useState(job.url);
  const [error, setError] = useState(false);
  const commit = () => {
    if (draft.trim() === job.url) return setError(false);
    const next = setJobUrl(job.url, draft);
    setError(!next);
    if (next) openJob(jobIdOf(next), true);
  };
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <Input
        type="url"
        label="Link"
        value={draft}
        error={error}
        errorMessage={error ? 'Use a full link that no other saved job has.' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Box>
  );
}

function DetailsEditor({ job, onDone }: { job: Job; onDone: () => void }) {
  const { saved, flash } = useSavedFlash();
  const field = (key: keyof Job, label: string) => (
    <JobField job={job} field={key} label={label} onSaved={flash} />
  );
  // No form-control cap: the single fields (Title, Link) line up with the paired rows.
  return (
    <Box className="rjb-form-full">
      <Stack gap="normal">
        {field('label', 'Title')}
        <Switcher gap="tight">
          {field('company', 'Company')}
          {field('location', 'Location')}
        </Switcher>
        <Switcher gap="tight">
          {field('salary', 'Pay')}
          {field('contact', 'Contact')}
        </Switcher>
        <LinkField job={job} />
        <Disclosure label="More fields" variant="nav">
          <Switcher gap="tight">
            {field('seniority', 'Seniority')}
            {field('resume', 'Résumé version')}
          </Switcher>
        </Disclosure>
        <Stack direction="row" gap="tight" align="center" justify="end">
          <Text
            variant="caption"
            as="span"
            tone="success"
            aria-hidden={!saved}
            style={{
              opacity: saved ? 1 : 0,
              transition:
                'opacity var(--hds-motion-productive-duration) var(--hds-motion-productive-easing)',
            }}
          >
            Saved ✓
          </Text>
          <Button size="md" variant="tertiary" onClick={onDone}>
            Done
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** A company name as a link to its Company page; the bare name when it has no page (no slug). */
function companyLink(name: string) {
  const slug = companySlug(name);
  return slug ? (
    <InlineLink href={companyHash(slug)} externalIcon={false}>
      {name}
    </InlineLink>
  ) : (
    name
  );
}

/** The posting link as the domain alone (rev-3 C): an external-link icon, then the domain cut
 *  with an ellipsis when it is long. It opens the posting in a new tab. */
function postingLink(job: Job, domain: string) {
  return (
    <Stack direction="row" gap="px4" align="center">
      <Icon icon={ExternalLink} size="small" />
      <Box className="rjb-truncate" sx={{ minWidth: 0 }}>
        <InlineLink href={job.url} externalIcon={false}>
          {domain}
        </InlineLink>
      </Box>
    </Stack>
  );
}

/** The Details panel: the facts as a two-column list, Edit in its header. Research links sit in
 *  the header's menu (rev-3 review). */
function DetailsPanel({ job }: { job: Job }) {
  const [editing, setEditing] = useState(!(job.label && job.company));
  const facts = jobFacts(job);
  return (
    <Panel
      label="Details"
      title="Details"
      trailing={
        !editing && (
          <Button
            size="md"
            variant="tertiary"
            iconLeft={<Icon icon={Pencil} />}
            aria-label="Edit details"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        )
      }
    >
      <PanelBody>
        {editing ? (
          <DetailsEditor job={job} onDone={() => setEditing(false)} />
        ) : (
          <MetadataList
            orientation="horizontal"
            items={facts.map((f) => ({
              term: f.term,
              description:
                f.term === 'Company'
                  ? companyLink(f.description)
                  : f.term === 'Link'
                    ? postingLink(job, f.description)
                    : f.description,
            }))}
          />
        )}
      </PanelBody>
    </Panel>
  );
}

/** The job's documents (#228): what went out, Use template, and every document with its
 *  Versions and final copies behind one row, so the Overview stays short on a phone. */
function DocumentsPanel({ job }: { job: Job }) {
  const docs = documentsForJob(useDocuments(), job.url);
  const sent = sentSummary(docs);
  return (
    <Panel
      label="Documents"
      title="Documents"
      count={docs.length}
      countLabel={`${docs.length} documents`}
      trailing={<UseTemplate job={job} />}
      description={sent ? `Sent: ${sent}` : undefined}
    >
      <PanelBody>
        {/* Every document behind one row. With none yet there is no "None yet" filler: a quiet
            line opens New document, Use a Base document and Upload a final copy (rev-3 review). */}
        <Disclosure
          variant={docs.length ? 'row' : 'nav'}
          label={docs.length ? 'All documents' : 'Add a document'}
          preview={docs.length ? 'Versions, Sent copies and final files' : undefined}
        >
          <JobDocuments
            job={job}
            versionActions={(doc, version) => (
              <DocumentDownload doc={doc} version={version} job={job} />
            )}
            uploadSlot={<JobFinalCopies jobUrl={job.url} />}
          />
        </Disclosure>
      </PanelBody>
    </Panel>
  );
}

export default function JobOverview({ job }: { job: Job }) {
  return (
    // Roomy: the sections 40 apart.
    <Stack gap="inset">
      <DetailsPanel job={job} />
      <TodosPanel job={job} />
      <NotesPanel job={job} />
      <DocumentsPanel job={job} />
    </Stack>
  );
}

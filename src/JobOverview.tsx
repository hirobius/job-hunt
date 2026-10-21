// The job page's Overview (#130; rev-3 F, three tabs): Details, To-dos, Notes and Documents as
// panels. Details reads as a facts list; Edit turns the same panel into its fields (title,
// company, location, pay, link, contact, with seniority and résumé version under More fields).
// A job saved from a bare link has nothing to read yet, so its card starts in edit. Remove lives
// in the header's menu. The company links to its Company page (#230, `#/company/<slug>`).
import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
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
import { jobFacts, researchLinks } from './jobFacts';
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
        size="sm"
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
        size="sm"
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
  return (
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
        <Button size="md" variant="secondary" onClick={onDone}>
          Done
        </Button>
      </Stack>
    </Stack>
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

/** The Details panel: the facts as a two-column list, Edit in its header, research links last. */
function DetailsPanel({ job }: { job: Job }) {
  const [editing, setEditing] = useState(!(job.label && job.company));
  // Notes have their own panel below, so the facts skip them.
  const facts = jobFacts(job).filter((f) => f.term !== 'Notes');
  return (
    <Panel
      label="Details"
      title="Details"
      trailing={
        !editing && (
          <Button
            size="md"
            variant="secondary"
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
          <Stack gap="normal">
            <MetadataList
              orientation="horizontal"
              items={facts.map((f) => ({
                term: f.term,
                description: f.term === 'Company' ? companyLink(f.description) : f.description,
              }))}
            />
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              <Text variant="caption" as="span" tone="secondary">
                Research
              </Text>
              {researchLinks(job.label).map(([name, href]) => (
                <InlineLink key={name} href={href}>
                  {name}
                </InlineLink>
              ))}
            </Stack>
          </Stack>
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
    >
      <PanelBody>
        <Stack gap="tight">
          {sent && (
            <Text variant="caption" as="p" tone="secondary">
              {`Sent: ${sent}`}
            </Text>
          )}
          <Disclosure
            variant="row"
            label="All documents"
            preview={docs.length ? 'Versions, Sent copies and final files' : 'None yet'}
          >
            <JobDocuments
              job={job}
              versionActions={(doc, version) => (
                <DocumentDownload doc={doc} version={version} job={job} />
              )}
              uploadSlot={<JobFinalCopies jobUrl={job.url} />}
            />
          </Disclosure>
        </Stack>
      </PanelBody>
    </Panel>
  );
}

export default function JobOverview({ job }: { job: Job }) {
  return (
    <Stack gap="normal">
      <DetailsPanel job={job} />
      <TodosPanel job={job} />
      <NotesPanel job={job} />
      <DocumentsPanel job={job} />
    </Stack>
  );
}

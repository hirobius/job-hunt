// A Company's page (#230, epic #225): `#/company/<slug>`. A Company is derived from the company
// names on Jobs (src/companies.ts), so this page lists what it holds: its Jobs, the Documents on
// them or naming it, and its own Notes, which can be added and edited here (each save a Version).
// Rev-3 mock, roomy layout: "← Pipeline" on the page's left edge, then Jobs (the Pipeline's job
// cards, without the company initial), Documents and Notes as sections 40 apart.
import { useState, type ReactNode } from 'react';
import { Box, Button, Icon, Stack, Text, Textarea } from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { ArrowLeft, Building2 } from 'lucide-react';
import { addCompanyNote, useCompany } from './companies';
import { DOCUMENT_KINDS, saveVersion, type Document } from './documents';
import JobCard from './JobCard';
import { Panel, PanelBody, PanelRow, PanelRows } from './PipelinePanel';
// Fields fill the column (a Box sx, not an inline style: the #133 ratchet).
const FULL = { '& > *, & textarea': { width: '100%' } } as const;
const kindLabel = (d: Document) => DOCUMENT_KINDS.find((k) => k.kind === d.kind)?.label ?? d.kind;
const latest = (d: Document) => d.versions[d.versions.length - 1];
const versions = (n: number) => (n === 1 ? '1 version' : `${n} versions`);
const day = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const Quiet = ({ children }: { children: ReactNode }) => (
  <Text variant="caption" as="p" tone="secondary">
    {children}
  </Text>
);

/** One company Note: its latest text, saved as a new Version when it changes. */
function NoteEditor({ note }: { note: Document }) {
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
      <Box sx={FULL}>
        <Textarea
          aria-label="Note"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </Box>
      <Stack direction="row" gap="normal" align="center" wrap="wrap">
        <Button
          variant="tertiary"
          size="md"
          disabled={draft === text}
          onClick={() => saveVersion(note.id, draft)}
        >
          Save note
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
      <Box sx={FULL}>
        <Textarea
          aria-label="New note"
          placeholder="What you learn about this company"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </Box>
      <Box>
        <Button
          variant="tertiary"
          size="md"
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

export default function CompanyPage({ slug }: { slug: string }) {
  const company = useCompany(slug);
  if (!company)
    return (
      <EmptyState
        framed
        icon={Building2}
        title="No company here"
        description="Companies come from the company name on a job. This one may have been renamed."
        action={
          <Button asChild variant="tertiary">
            <a href="#/queue">Go to the Pipeline</a>
          </Button>
        }
      />
    );

  const docs = company.documents.length;
  return (
    // Roomy rhythm: Back, 12 to the title, 4 to its count; then 40 to each section.
    <Stack gap="inset">
      <Stack gap="medium">
        {/* "← Pipeline", the job page's Back, with no leading padding so the arrow sits on the
            page gutter with the title (`.rjb-back-link`; its box stays inside the gutter). */}
        <Box>
          {/* A link (it navigates). HDS Button asChild drops iconLeft, so the arrow is the link's
              own child. */}
          <Button asChild className="rjb-back-link" variant="tertiary" size="md">
            <a href="#/queue" aria-label="Back to Pipeline">
              <Icon icon={ArrowLeft} />
              Pipeline
            </a>
          </Button>
        </Box>
        <Stack gap="px4">
          <Text variant="title" as="h2">
            {company.name}
          </Text>
          <Quiet>{company.jobs.length === 1 ? '1 job' : `${company.jobs.length} jobs`}</Quiet>
        </Stack>
      </Stack>

      <Panel
        kind="list"
        label="Jobs"
        title="Jobs"
        count={company.jobs.length}
        countLabel={company.jobs.length === 1 ? '1 job' : `${company.jobs.length} jobs`}
      >
        {company.jobs.length ? (
          <PanelRows label={`Jobs at ${company.name}`}>
            {company.jobs.map((j) => (
              // The Pipeline's job card; no initial, since every job here is this company's.
              <PanelRow key={j.url} flush>
                <JobCard job={j} avatar={false} titleAs="h4" />
              </PanelRow>
            ))}
          </PanelRows>
        ) : (
          <Quiet>No jobs at this company right now. Its notes stay here.</Quiet>
        )}
      </Panel>

      <Panel
        label="Documents"
        title="Documents"
        count={docs}
        countLabel={docs === 1 ? '1 document' : `${docs} documents`}
      >
        {docs ? (
          <PanelRows label={`Documents for ${company.name}`}>
            {company.documents.map((d) => (
              <PanelRow key={d.id}>
                <Stack gap="px2">
                  <Text variant="ui" as="span" className="rjb-semibold">
                    {d.title || kindLabel(d)}
                  </Text>
                  <Text variant="caption" as="span" tone="secondary">
                    {`${kindLabel(d)} · ${versions(d.versions.length)}`}
                  </Text>
                </Stack>
              </PanelRow>
            ))}
          </PanelRows>
        ) : (
          <PanelBody>
            <Quiet>None sent yet.</Quiet>
          </PanelBody>
        )}
      </Panel>

      <Panel label="Notes" title="Notes">
        <PanelBody>
          <Stack gap="normal">
            {company.notes.map((n) => (
              <NoteEditor key={n.id} note={n} />
            ))}
            <NewNote
              company={company.name}
              action={company.notes.length ? 'Add note' : 'Save note'}
            />
          </Stack>
        </PanelBody>
      </Panel>
    </Stack>
  );
}

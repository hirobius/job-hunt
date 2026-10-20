// A Company's page (#230, epic #225): `#/company/<slug>`. A Company is derived from the company
// names on Jobs (src/companies.ts), so this page lists what it holds: its Jobs, the Documents on
// them or naming it, and its own Notes, which can be added and edited here (each save a Version).
import { useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  EmptyState,
  Icon,
  InlineLink,
  Stack,
  Text,
  Textarea,
} from '@hirobius/design-system';
import { ArrowLeft, Building2 } from 'lucide-react';
import { addCompanyNote, useCompany } from './companies';
import { DOCUMENT_KINDS, saveVersion, type Document } from './documents';
import { jobHash } from './route';
import { jobIdOf } from './store';
import { StatusBadge } from './JobRowParts';

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;
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

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  // A native <section>: Stack doesn't pass aria-* through.
  return (
    <section aria-labelledby={id}>
      <Stack gap="tight">
        <Text variant="body" as="h3" id={id} weight="bold">
          {title}
        </Text>
        {children}
      </Stack>
    </section>
  );
}

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
        <Textarea label="Note" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
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
        <Quiet>{`Saved ${day(latest(note).savedAt)} · ${versions(note.versions.length)}`}</Quiet>
      </Stack>
    </Stack>
  );
}

function NewNote({ company }: { company: string }) {
  const [draft, setDraft] = useState('');
  return (
    <Stack gap="tight">
      <Box sx={FULL}>
        <Textarea
          label="New note"
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
          Add note
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
        icon={Building2}
        title="No company here"
        description="Companies come from the company name on a job. This one may have been renamed."
        action={
          <InlineLink href="#/queue" externalIcon={false}>
            Go to the Pipeline
          </InlineLink>
        }
      />
    );

  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="spacious">
        <Stack gap="tight">
          <Box>
            {/* HDS Button asChild drops iconLeft, so the arrow is the link's own child. */}
            <Button asChild variant="tertiary" size="sm">
              <a href="#/queue">
                <Icon icon={ArrowLeft} />
                Back to Pipeline
              </a>
            </Button>
          </Box>
          <Text variant="title" as="h2">
            {company.name}
          </Text>
          <Quiet>{company.jobs.length === 1 ? '1 job' : `${company.jobs.length} jobs`}</Quiet>
        </Stack>

        <Section id="company-jobs" title="Jobs">
          {company.jobs.length ? (
            <Stack as="ul" gap="tight" style={LIST}>
              {company.jobs.map((j) => (
                <li key={j.url}>
                  <Stack direction="row" gap="normal" align="center" wrap="wrap">
                    <InlineLink href={jobHash(jobIdOf(j.url))} externalIcon={false}>
                      {j.label || j.url}
                    </InlineLink>
                    <StatusBadge job={j} />
                  </Stack>
                </li>
              ))}
            </Stack>
          ) : (
            <Quiet>No jobs at this company right now. Its notes stay here.</Quiet>
          )}
        </Section>

        <Section id="company-documents" title="Documents">
          {company.documents.length ? (
            <Stack as="ul" gap="tight" style={LIST}>
              {company.documents.map((d) => (
                <li key={d.id}>
                  <Stack gap="px2">
                    <Text variant="ui" as="span">
                      {d.title || kindLabel(d)}
                    </Text>
                    <Text variant="caption" as="span" tone="secondary">
                      {`${kindLabel(d)} · ${versions(d.versions.length)}`}
                    </Text>
                  </Stack>
                </li>
              ))}
            </Stack>
          ) : (
            <Quiet>No documents yet.</Quiet>
          )}
        </Section>

        <Section id="company-notes" title="Notes">
          {company.notes.length ? (
            company.notes.map((n) => <NoteEditor key={n.id} note={n} />)
          ) : (
            <Quiet>No notes yet. Add what you learn about this company.</Quiet>
          )}
          <NewNote company={company.name} />
        </Section>
      </Stack>
    </Box>
  );
}

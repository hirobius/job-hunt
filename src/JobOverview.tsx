// The job page's Overview (#130): the details card, then the secondary tools (templates, research
// links). The card reads as a facts list; Edit turns the same card into its fields (title,
// company, location, pay, link, contact, with seniority and résumé version under More fields).
// A job saved from a bare link has nothing to read yet, so its card starts in edit. Remove lives
// in the header's menu.
import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Box,
  Button,
  Card,
  Disclosure,
  Icon,
  Input,
  MetadataList,
  Stack,
  Switcher,
  Text,
} from '@hirobius/design-system';
import { jobIdOf, setJobUrl, updateJob } from './store';
import { openJob } from './route';
import { relinkCompanyNotes } from './companies';
import { jobFacts, researchLinks } from './jobFacts';
import { useSavedFlash } from './useSavedFlash';
import UseTemplate from './UseTemplate';
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
        style={{ width: '100%' }}
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
    <Card bordered padding="component">
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
            aria-hidden={!saved}
            style={{
              color: 'var(--semantic-color-feedback-success)',
              opacity: saved ? 1 : 0,
              transition:
                'opacity var(--hds-motion-productive-duration) var(--hds-motion-productive-easing)',
            }}
          >
            Saved ✓
          </Text>
          <Button size="sm" variant="secondary" onClick={onDone}>
            Done
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

export default function JobOverview({ job }: { job: Job }) {
  const [editing, setEditing] = useState(!(job.label && job.company));
  const facts = jobFacts(job);

  return (
    <Stack gap="normal">
      <Stack gap="tight">
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <Text variant="body" as="h3" className="rjb-semibold">
            Details
          </Text>
          {!editing && (
            <Button
              size="sm"
              variant="tertiary"
              iconLeft={<Icon icon={Pencil} />}
              aria-label="Edit details"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
        </Stack>
        {editing ? (
          <DetailsEditor job={job} onDone={() => setEditing(false)} />
        ) : (
          <MetadataList
            variant="divided"
            items={facts.map((f) => ({ term: f.term, description: f.description }))}
          />
        )}
      </Stack>
      <Stack direction="row" wrap="wrap" gap="tight" align="center">
        <UseTemplate job={job} />
        {researchLinks(job.label).map(([name, href]) => (
          <Button key={name} size="sm" variant="secondary" asChild>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {name}
            </a>
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

// The job page's Overview (#130): the facts it has, an Edit details disclosure holding every
// editable field, and the secondary tools (templates, research links). Owns the "Saved ✓" flash.
import { useState } from 'react';
import {
  Box,
  Button,
  Disclosure,
  Input,
  MetadataList,
  Stack,
  Switcher,
  Text,
  useToast,
} from '@hirobius/design-system';
import { DestructiveSection } from '@hirobius/design-system/patterns';
import { removeJob, updateJob } from './store';
import { openJob } from './route';
import { titleOf } from './jobRow';
import { jobFacts, researchLinks } from './jobFacts';
import { useSavedFlash } from './useSavedFlash';
import UseTemplate from './UseTemplate';
import type { Job } from './types';

/** A text field that writes straight through to the job and tells the page it saved. */
export function JobField({
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
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <Input
        size="sm"
        label={label}
        value={(job[field] as string) || ''}
        onChange={(e) => {
          updateJob(job.url, { [field]: e.target.value });
          onSaved();
        }}
        style={{ width: '100%' }}
      />
    </Box>
  );
}

export default function JobOverview({ job }: { job: Job }) {
  const { saved, flash } = useSavedFlash();
  const { toast } = useToast();
  // A job saved from a bare link has nothing to read yet, so the editor starts open.
  const [editOpen, setEditOpen] = useState(!(job.label && job.company));
  const facts = jobFacts(job);
  const field = (key: keyof Job, label: string) => (
    <JobField job={job} field={key} label={label} onSaved={flash} />
  );

  return (
    <Stack gap="normal">
      <MetadataList
        variant="divided"
        items={facts.map((f) => ({ term: f.term, description: f.description }))}
      />
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
      <Disclosure label="Edit details" variant="nav" open={editOpen} onOpenChange={setEditOpen}>
        <Stack gap="normal">
          <Box sx={{ height: 18, textAlign: 'right' }}>
            <Text
              variant="caption"
              as="span"
              style={{
                color: 'var(--semantic-color-feedback-success)',
                opacity: saved ? 1 : 0,
                transition: 'opacity 0.2s',
              }}
            >
              Saved ✓
            </Text>
          </Box>
          {field('label', 'Title')}
          <Switcher gap="tight">
            {field('company', 'Company')}
            {field('location', 'Location')}
          </Switcher>
          <Switcher gap="tight">
            {field('seniority', 'Seniority')}
            {field('salary', 'Salary')}
          </Switcher>
          <Switcher gap="tight">
            {field('contact', 'Contact / referral')}
            {field('resume', 'Résumé version')}
          </Switcher>
        </Stack>
      </Disclosure>
      <DestructiveSection
        level={3}
        title="Remove this job"
        description="Deletes the job, its to-dos, notes and interviews from this device and your account."
        actionLabel="Remove this job"
        confirmLabel="Remove job"
        confirmBody={`“${titleOf(job)}” will be gone for good.`}
        onConfirm={() => {
          removeJob(job.url);
          openJob(null, true);
          toast({ title: 'Job removed', description: titleOf(job) });
        }}
      />
    </Stack>
  );
}

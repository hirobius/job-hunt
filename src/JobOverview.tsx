// The job page's body (#130; one page since #416, Adrian's Q5): Details, Notes, then Documents and
// Decks as plain lists of external links. To-dos, screening and interviews left the page; their
// data stays on the Job (storage, sync, Back up, CSV). Details reads as a facts list; Edit turns the same panel into its fields (title,
// company, location, pay, link, contact, with seniority and résumé version under More fields).
// A job saved from a bare link has nothing to read yet, so its card starts in edit. Remove lives
// in the header's menu. The company links to its Company page (#230, `#/company/<slug>`).
import { useEffect, useRef, useState } from 'react';
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
  VisuallyHidden,
} from '@hirobius/design-system';
import { jobIdOf, setJobDeadline, setJobUrl, updateJob } from './store';
import { companyHash, getRoute, linkTo, navigate, parseHash, useRoute, type Route } from './route';
import { companySlug, relinkCompanyNotes } from './companies';
import { jobFacts } from './jobFacts';
import { useSavedFlash } from './useSavedFlash';
import { Panel, PanelBody } from './PipelinePanel';
import { NotesPanel } from './TodosNotes';
import LinksPanel from './JobLinks';
import { DECK_LINKS, DOC_LINKS } from './decks';
import { useFocusAfter } from './useFocusAfter';
import type { Job } from './types';

/** A text field that writes straight through to the job and tells the page it saved. */
function JobField({
  job,
  field,
  label,
  onSaved,
  autoFocus,
}: {
  job: Job;
  field: keyof Job;
  label: string;
  onSaved: () => void;
  autoFocus?: boolean;
}) {
  // The company name as it was when the field was entered: on leaving it, that name's company
  // Notes follow the rename when no other job keeps it (#230, companies.ts).
  const before = useRef('');
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <Input
        size="sm"
        label={label}
        autoFocus={autoFocus}
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

/** The day applications close (#419): an HDS date input onto the job's `deadline`. A source that
 *  states one fills it; a day typed here sets it, clearing the field removes it. Saved on blur
 *  (or Enter): a year typed digit by digit passes through days like 0002-11-03 on the way. */
function DeadlineField({ job, onSaved }: { job: Job; onSaved: () => void }) {
  const [draft, setDraft] = useState(job.deadline || '');
  const commit = () => {
    if (draft === (job.deadline || '')) return;
    setJobDeadline(job.url, draft);
    onSaved();
  };
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <Input
        size="sm"
        type="date"
        label="Applications close"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Box>
  );
}

/** The job whose link was just changed here: its page opens again with the fields open and focus
 *  on Link (the page remounts under the new id), so the edit carries on where it was. */
let relinked: string | null = null;

/** The job's link. It is the job's identity (its page id comes from it), so it saves on blur and
 *  the page follows the job to its new id. */
function LinkField({ job, autoFocus }: { job: Job; autoFocus?: boolean }) {
  const [draft, setDraft] = useState(job.url);
  const [error, setError] = useState(false);
  // `leavingTo` is where focus is going: leaving for Done closes the editor on the new page,
  // so Done needs no second click.
  const commit = (leavingTo?: EventTarget | null) => {
    if (draft.trim() === job.url) return setError(false);
    const next = setJobUrl(job.url, draft);
    setError(!next);
    const toDone = leavingTo instanceof Element && !!leavingTo.closest('[data-details-done]');
    if (next && !toDone) relinked = next;
    // In place, the page follows the job to its new id and keeps where it was opened from.
    if (next) navigate({ jobId: jobIdOf(next), from: getRoute().from ?? null }, true);
  };
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <Input
        size="sm"
        type="url"
        label="Link"
        autoFocus={autoFocus}
        value={draft}
        error={error}
        errorMessage={error ? 'Use a full link that no other saved job has.' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.relatedTarget)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Box>
  );
}

/** Which field takes focus as the editor opens: Title from Edit, Link after a new link, none when
 *  the page itself opened in edit (a bare link: focus stays with the page). */
type OpenFocus = 'title' | 'link' | null;

function DetailsEditor({ job, onDone, focus }: { job: Job; onDone: () => void; focus: OpenFocus }) {
  const { saved, flash } = useSavedFlash();
  const field = (key: keyof Job, label: string) => (
    <JobField
      job={job}
      field={key}
      label={label}
      onSaved={flash}
      autoFocus={key === 'label' && focus === 'title'}
    />
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
        <LinkField job={job} autoFocus={focus === 'link'} />
        <DeadlineField job={job} onSaved={flash} />
        <Disclosure label="More fields" variant="nav">
          <Switcher gap="tight">
            {field('seniority', 'Seniority')}
            {field('resume', 'Résumé version')}
          </Switcher>
        </Disclosure>
        <Stack direction="row" gap="tight" align="center" justify="end">
          {/* Announced as well as shown: the visible tick fades, the status says it once. */}
          <VisuallyHidden role="status">{saved ? 'Saved' : ''}</VisuallyHidden>
          <Text
            variant="caption"
            as="span"
            tone="success"
            aria-hidden
            style={{
              opacity: saved ? 1 : 0,
              transition:
                'opacity var(--hds-motion-productive-duration) var(--hds-motion-productive-easing)',
            }}
          >
            Saved ✓
          </Text>
          <Button size="md" variant="secondary" onClick={onDone} data-details-done="">
            Done
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** A company name as a link to its Company page; the bare name when it has no page (no slug). The
 *  Company page remembers this job (its section too), so its Back returns here (return paths). */
function companyLink(name: string, from: Route) {
  const slug = companySlug(name);
  return slug ? (
    <InlineLink href={linkTo(parseHash(companyHash(slug)), from)} externalIcon={false}>
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
  const [editing, setEditing] = useState<false | { focus: OpenFocus }>(() => {
    if (relinked === job.url) return { focus: 'link' };
    return job.label && job.company ? false : { focus: null };
  });
  // Cleared once mounted, not in the initializer (StrictMode runs that twice).
  useEffect(() => {
    if (relinked === job.url) relinked = null;
  }, [job.url]);
  // Done gives focus back to Edit.
  const { ref, focus } = useFocusAfter();
  const route = useRoute();
  const facts = jobFacts(job);
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
            ref={ref('edit')}
            onClick={() => setEditing({ focus: 'title' })}
          >
            Edit
          </Button>
        )
      }
    >
      <PanelBody>
        {editing ? (
          <DetailsEditor
            job={job}
            focus={editing.focus}
            onDone={() => {
              setEditing(false);
              focus('edit');
            }}
          />
        ) : (
          <MetadataList
            orientation="horizontal"
            items={facts.map((f) => ({
              term: f.term,
              description:
                f.term === 'Company'
                  ? companyLink(f.description, route)
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

export default function JobOverview({ job }: { job: Job }) {
  return (
    <Stack gap="px24">
      <DetailsPanel job={job} />
      <NotesPanel job={job} />
      <LinksPanel job={job} kind={DOC_LINKS} />
      <LinksPanel job={job} kind={DECK_LINKS} />
    </Stack>
  );
}

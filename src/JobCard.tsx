import { useRef, useState } from 'react';
import {
  EllipsisVertical,
  Building2,
  MapPin,
  GraduationCap,
  DollarSign,
  Star,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button as UiButton,
  Card as HdsCard,
  Input as HdsInput,
  Menu as HdsMenu,
  Textarea,
  Icon,
  Box,
  Stack,
  Text,
  Disclosure,
  InlineLink,
  Switcher,
} from '@hirobius/design-system';
import {
  updateJob,
  setStatus,
  removeJob,
  logFollowUp,
  prettyTitle,
  hostOf,
  jobIdOf,
} from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { verdictTone, modeLabel, blockerLabel } from './screening';
import { ScreeningEditor } from './ScreeningEditor';
import UseTemplate from './UseTemplate';
import InterviewLog from './InterviewLog';
import { TodosNotes } from './TodosNotes';
import type { Job, Status } from './types';

// One saved job's card (#127): extracted from TrackerView so the Pipeline list and the job route
// (#/queue/<jobId>) render the same thing. Owns its own Details-open and "Saved ✓" state.
// Status → HDS Badge tone (the semantic feedback tokens; Interviewing = inProgress).
const STATUS_TONE: Record<Status, 'warning' | 'info' | 'inProgress' | 'success' | 'danger'> = {
  Saved: 'warning',
  Applied: 'info',
  Interviewing: 'inProgress',
  Offer: 'success',
  Rejected: 'danger',
};

function research(label: string) {
  const q = encodeURIComponent(label || '');
  return [
    ['Glassdoor', `https://www.glassdoor.com/Search/results.htm?keyword=${q}`],
    ['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
    ['levels.fyi', `https://www.levels.fyi/?search=${q}`],
    ['Google', `https://www.google.com/search?q=${q}+careers+reviews`],
  ];
}

export default function JobCard({
  job: j,
  defaultDetailsOpen = false,
}: {
  job: Job;
  defaultDetailsOpen?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(defaultDetailsOpen);
  // Transient "Saved ✓" flash after a detail field autosaves.
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashSaved = () => {
    setSavedFlash(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1200);
  };
  // Single-line fields are HDS Input; multiline (Notes) is HDS Textarea (both HDS since #11).
  const fld = (j: Job, key: keyof Job, label: string, multiline = false) =>
    multiline ? (
      <Textarea
        label={label}
        rows={2}
        value={(j[key] as string) || ''}
        onChange={(e) => {
          updateJob(j.url, { [key]: e.target.value });
          flashSaved();
        }}
        style={{ width: '100%' }}
      />
    ) : (
      <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
        <HdsInput
          size="sm"
          label={label}
          value={(j[key] as string) || ''}
          onChange={(e) => {
            updateJob(j.url, { [key]: e.target.value });
            flashSaved();
          }}
          style={{ width: '100%' }}
        />
      </Box>
    );
  const s = deriveJobState(j);

  // Eyebrow = status-aware timing (the status word itself lives in the badge).
  const eyebrow =
    s.status === 'Saved'
      ? 'Saved'
      : [
          s.appliedDaysAgo != null
            ? `Applied ${s.appliedDaysAgo === 0 ? 'today' : s.appliedDaysAgo + 'd ago'}`
            : s.status,
          s.followUp.loggedDaysAgo != null
            ? `followed up ${s.followUp.loggedDaysAgo === 0 ? 'today' : s.followUp.loggedDaysAgo + 'd ago'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
  // Icon-led facts — only those the job actually has.
  const facts: Array<{ icon: LucideIcon; text: string }> = [];
  if (j.company) facts.push({ icon: Building2, text: j.company });
  if (j.location) facts.push({ icon: MapPin, text: j.location });
  if (j.seniority) facts.push({ icon: GraduationCap, text: j.seniority });
  if (j.salary) facts.push({ icon: DollarSign, text: j.salary });
  const host = hostOf(j.url);
  return (
    <HdsCard bordered padding="none" style={{ opacity: j.archived ? 0.55 : 1 }}>
      <Box
        sx={{
          p: 'sm',
          borderLeft: j.priority
            ? '3px solid var(--semantic-accent-rest)'
            : '3px solid transparent',
        }}
      >
        {/* Eyebrow + title | status badge · pin · overflow */}
        <Stack direction="row" gap="gap" align="start">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Text
              variant="caption"
              as="span"
              style={{
                color: 'var(--semantic-color-content-secondary)',
                display: 'block',
              }}
            >
              {eyebrow}
            </Text>
            <Text
              variant="body"
              as="h3"
              style={{
                marginTop: 'calc(var(--primitive-space-1) * 0.5)',
                overflowWrap: 'anywhere',
              }}
            >
              <InlineLink href={j.url} externalIcon={false}>
                {j.label || prettyTitle(j.url)}
              </InlineLink>
            </Text>
          </Box>
          {s.status !== 'Saved' && <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>}
          <UiButton
            size="sm"
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={Star} />}
            label={j.priority ? 'Unpin priority' : 'Pin as priority'}
            aria-pressed={!!j.priority}
            onClick={() => updateJob(j.url, { priority: !j.priority })}
            style={j.priority ? { color: 'var(--semantic-accent-rest)' } : undefined}
          />
          <HdsMenu>
            <HdsMenu.Trigger asChild>
              <UiButton
                size="sm"
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={EllipsisVertical} />}
                label="More actions"
              />
            </HdsMenu.Trigger>
            <HdsMenu.Content align="end">
              {s.isApplyable && (
                <HdsMenu.Item onSelect={() => setStatus(j.url, 'Applied')}>
                  Mark applied
                </HdsMenu.Item>
              )}
              <HdsMenu.Item onSelect={() => navigate({ tab: 'queue', jobId: jobIdOf(j.url) })}>
                Open job page
              </HdsMenu.Item>
              <HdsMenu.Item onSelect={() => updateJob(j.url, { priority: !j.priority })}>
                {j.priority ? 'Unpin priority' : 'Pin as priority'}
              </HdsMenu.Item>
              <HdsMenu.Item onSelect={() => updateJob(j.url, { archived: !j.archived })}>
                {j.archived ? 'Unretire' : 'Retire'}
              </HdsMenu.Item>
              <HdsMenu.Separator />
              {/* Reverse interop (issue #57): seed Discover's Title search with this
                  job's title and jump there — pipeline feeds discovery. */}
              <HdsMenu.Item
                onSelect={() => {
                  setDiscoverSeed(j.label || prettyTitle(j.url));
                  navigate({ tab: 'discover', sub: 'titles' });
                }}
              >
                Find more like this
              </HdsMenu.Item>
              <HdsMenu.Separator />
              <HdsMenu.Item
                onSelect={() => removeJob(j.url)}
                style={{ color: 'var(--semantic-color-feedback-error)' }}
              >
                Remove
              </HdsMenu.Item>
            </HdsMenu.Content>
          </HdsMenu>
        </Stack>

        {/* Icon-led facts line — company · location · seniority · salary */}
        {facts.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2.5,
              mt: 'xs',
              alignItems: 'center',
            }}
          >
            {facts.map((f, i) => {
              const Icon = f.icon;
              return (
                <Box
                  key={i}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.8,
                    minWidth: 0,
                  }}
                >
                  <Icon
                    size={14}
                    style={{
                      color: 'var(--semantic-color-content-secondary)',
                      flexShrink: 0,
                    }}
                  />
                  <Text
                    variant="caption"
                    as="span"
                    style={{
                      color: 'var(--semantic-color-content-secondary)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {f.text}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Screening chips — verdict / mode / dealbreakers / applicant count (issue #60) */}
        {(j.verdict || j.mode || (j.blockers && j.blockers.length > 0) || j.applicants != null) && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              mt: 'xs',
              alignItems: 'center',
            }}
          >
            {j.verdict && (
              <Badge tone={verdictTone(j.verdict)}>
                {j.verdict.charAt(0).toUpperCase() + j.verdict.slice(1)}
              </Badge>
            )}
            {j.mode && (
              <Badge tone="neutral">
                {modeLabel(j.mode)}
                {j.travelPct != null ? ` · ${j.travelPct}% travel` : ''}
              </Badge>
            )}
            {j.blockers?.map((b) => (
              <Badge key={b} tone="danger">
                {blockerLabel(b)}
              </Badge>
            ))}
            {j.applicants != null && (
              <Text
                variant="caption"
                as="span"
                style={{ color: 'var(--semantic-color-content-secondary)' }}
              >
                {j.applicants} applied
              </Text>
            )}
          </Box>
        )}

        {/* Meta chips — source host + notes indicator */}
        {(host || j.note) && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              mt: 'xs',
              alignItems: 'center',
            }}
          >
            {host && <Badge tone="neutral">{host}</Badge>}
            {j.note && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.7 }}>
                <StickyNote
                  size={13}
                  style={{ color: 'var(--semantic-color-content-secondary)' }}
                />
                <Text
                  variant="caption"
                  as="span"
                  style={{ color: 'var(--semantic-color-content-secondary)' }}
                >
                  Notes
                </Text>
              </Box>
            )}
          </Box>
        )}

        {/* Actions */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            gap: 'xs',
            alignItems: 'center',
            flexWrap: 'wrap',
            mt: 3,
          }}
        >
          {s.isApplyable && (
            <UiButton
              size="sm"
              variant="primary"
              tone="info"
              onClick={() => setStatus(j.url, 'Applied')}
            >
              Mark applied
            </UiButton>
          )}
          <UseTemplate job={j} />
          {s.followUp.due && (
            <>
              <Badge tone="warning">Follow up now</Badge>
              <UiButton
                size="sm"
                variant="secondary"
                tone="warning"
                onClick={() => logFollowUp(j.url)}
              >
                Log follow-up
              </UiButton>
            </>
          )}
          {s.followUp.daysUntil != null && (
            <Text
              variant="caption"
              as="span"
              style={{ color: 'var(--semantic-color-content-secondary)' }}
            >
              Follow up in {s.followUp.daysUntil}d
            </Text>
          )}
        </Box>

        {/* Per-role to-dos + notes (self-contained expander) */}
        <Box sx={{ mt: 'xs' }}>
          <TodosNotes job={j} />
        </Box>

        <Disclosure label="Details" variant="nav" open={detailsOpen} onOpenChange={setDetailsOpen}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 3 }}>
            <Box sx={{ height: 18, textAlign: 'right' }}>
              <Text
                variant="caption"
                as="span"
                style={{
                  color: 'var(--semantic-color-feedback-success)',
                  opacity: savedFlash ? 1 : 0,
                  transition: 'opacity 0.2s',
                }}
              >
                Saved ✓
              </Text>
            </Box>
            {fld(j, 'label', 'Title')}
            <Switcher gap="tight">
              {fld(j, 'company', 'Company')}
              {fld(j, 'location', 'Location')}
            </Switcher>
            <Switcher gap="tight">
              {fld(j, 'seniority', 'Seniority')}
              {fld(j, 'salary', 'Salary')}
            </Switcher>
            <ScreeningEditor job={j} />
            <InterviewLog job={j} />
            {fld(j, 'note', 'Notes', true)}
            <Switcher gap="tight">
              {fld(j, 'contact', 'Contact / referral')}
              {fld(j, 'resume', 'Résumé version')}
            </Switcher>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {research(j.label).map(([name, href]) => (
                <UiButton key={name} size="sm" variant="secondary" asChild>
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </UiButton>
              ))}
            </Box>
          </Box>
        </Disclosure>
      </Box>
    </HdsCard>
  );
}

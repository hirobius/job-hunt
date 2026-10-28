// Role Radar's engine, as parts of Live postings (docs/specs/role-radar.md): the evidence editor,
// one posting's Fit and gap, and the roll-up of what the postings ask for. The logic lives in
// src/radar/ (rules only, no AI); these only render it.
import { useId, useState } from 'react';
import {
  Badge,
  Box,
  Card,
  Disclosure,
  InlineLink,
  Stack,
  Text,
  Textarea,
} from '@hirobius/design-system';
import { EVIDENCE_MAX } from './radar/evidenceStore';
import type { FitGap } from './radar/fitGap';
import type { Patterns } from './radar/patterns';

export function EvidenceEditor({
  text,
  count,
  onChange,
}: {
  text: string;
  count: number;
  onChange: (text: string) => void;
}) {
  return (
    // Inline in Refine (rev-3 J): the label with its count, a helper line, then a 5-row field
    // that grows by hand. No placeholder: the helper says what goes in.
    <Stack gap="px8">
      <Stack gap="px4">
        <Stack direction="row" gap="px8" align="center">
          <Text variant="ui" as="span">
            Your evidence
          </Text>
          <Badge count={count} label={`${count} skills`} />
        </Stack>
        <Text variant="caption" as="p" tone="secondary">
          One skill per line, like Design tokens: token pipeline (link). Each posting then gets a
          fit, and Fit notes only ever cite these.
        </Text>
      </Stack>
      <Textarea
        aria-label="Your evidence"
        rows={5}
        resize="vertical"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      {text.length >= EVIDENCE_MAX && (
        <Text variant="caption" role="status" tone="secondary">
          Trimmed to the {EVIDENCE_MAX.toLocaleString('en-US')} character limit; anything past it is
          not kept.
        </Text>
      )}
    </Stack>
  );
}

/** One posting's Fit (what your evidence covers, with its proof) and Gap. Shown in the row's
 *  "Why this fit" dialog, so the row itself stays badge, source, title, company, facts (rev-3 K). */
export function FitGapBody({ fg }: { fg: FitGap }) {
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="secondary">
        Fit
      </Text>
      {fg.fit.length ? (
        <ul aria-label="Fit">
          {fg.fit.map((f) => (
            <li key={f.ask.id}>
              <Text variant="ui" as="span">
                {f.ask.label}
                {f.proof && ': '}
                {f.url ? <InlineLink href={f.url}>{f.proof || f.ask.label}</InlineLink> : f.proof}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text variant="ui">Nothing it asks for is in your evidence yet.</Text>
      )}
      <Text variant="caption" tone="secondary">
        Gap
      </Text>
      {fg.gap.length ? (
        <ul aria-label="Gap">
          {fg.gap.map((a) => (
            <li key={a.id}>
              <Text variant="ui" as="span">
                {a.label}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text variant="ui">No gaps against the asks the radar knows.</Text>
      )}
    </Stack>
  );
}

export function PatternsSummary({ patterns }: { patterns: Patterns }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const list = (name: string, items: { label: string; count: number }[]) => (
    <Box sx={{ minWidth: 0 }}>
      <Stack gap="xs">
        <Text variant="ui" as="h4" id={`${id}-${name}`}>
          {name}
        </Text>
        {items.length ? (
          <ul aria-label={name}>
            {items.map((d) => (
              <li key={d.label}>
                <Text variant="ui" as="span">
                  {d.label} · {d.count} of {patterns.total}
                </Text>
              </li>
            ))}
          </ul>
        ) : (
          <Text variant="caption" tone="secondary">
            None yet.
          </Text>
        )}
      </Stack>
    </Box>
  );
  // The same row as Calibrate and Refine (rev-3 J): a bold name over a one-line preview.
  return (
    <Card padding="none" className="rjb-disclosure-vertical">
      <Box sx={{ px: 'sm', pb: open ? 'sm' : 0 }}>
        <Disclosure
          variant="row"
          label={
            <Text variant="body" as="span" weight="bold">
              What these postings ask for
            </Text>
          }
          open={open}
          onOpenChange={setOpen}
          preview={`${patterns.covered.length} covered, ${patterns.thin.length} thin, across ${patterns.total} postings`}
        >
          <Stack gap="px16">
            {list('Covered by your evidence', patterns.covered)}
            {list('Thin or not shown', patterns.thin)}
          </Stack>
        </Disclosure>
      </Box>
    </Card>
  );
}

// Role Radar's engine, as parts of Live postings (docs/specs/role-radar.md): the evidence editor,
// one posting's Fit and gap, and the roll-up of what the postings ask for. The logic lives in
// src/radar/ (rules only, no AI); these only render it.
import { useId } from 'react';
import { Disclosure, InlineLink, Stack, Text, Textarea } from '@hirobius/design-system';
import type { FitGap } from './radar/fitGap';
import type { Patterns } from './radar/patterns';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

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
    // Starts open while empty (it's the ask); collapsed once filled, so the postings lead.
    <Disclosure label={`Your evidence (${count})`} variant="panel" defaultOpen={!text}>
      <Stack gap="xs">
        <Text variant="caption" style={SECONDARY}>
          One skill per line, as “Skill: what shows it (link)”. Each posting then gets a fit, and
          Fit notes only ever cite these. Kept on this device.
        </Text>
        <Textarea
          aria-label="Your evidence"
          rows={5}
          value={text}
          placeholder={
            'Design tokens: token pipeline with generated outputs (https://…)\nAccessibility: automated contrast and axe checks'
          }
          onChange={(e) => onChange(e.target.value)}
        />
      </Stack>
    </Disclosure>
  );
}

export function FitGapDetails({ fg }: { fg: FitGap }) {
  return (
    <Disclosure label={`Fit and gap (${fg.fit.length} · ${fg.gap.length})`}>
      <Stack gap="xs">
        <Text variant="caption" style={SECONDARY}>
          Fit
        </Text>
        {fg.fit.length ? (
          <ul aria-label="Fit" style={{ margin: 0 }}>
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
        <Text variant="caption" style={SECONDARY}>
          Gap
        </Text>
        {fg.gap.length ? (
          <ul aria-label="Gap" style={{ margin: 0 }}>
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
    </Disclosure>
  );
}

export function PatternsSummary({ patterns }: { patterns: Patterns }) {
  const id = useId();
  const list = (name: string, items: { label: string; count: number }[]) => (
    <Stack gap="xs" style={{ minWidth: 0 }}>
      <Text variant="ui" as="h4" id={`${id}-${name}`} style={{ margin: 0 }}>
        {name}
      </Text>
      {items.length ? (
        <ul aria-label={name} style={{ margin: 0 }}>
          {items.map((d) => (
            <li key={d.label}>
              <Text variant="ui" as="span">
                {d.label} · {d.count} of {patterns.total}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text variant="caption" style={SECONDARY}>
          None yet.
        </Text>
      )}
    </Stack>
  );
  return (
    <Disclosure label={`What these postings ask for (${patterns.total})`} variant="panel">
      <Stack gap="px16">
        {list('Covered by your evidence', patterns.covered)}
        {list('Thin or not shown', patterns.thin)}
      </Stack>
    </Disclosure>
  );
}

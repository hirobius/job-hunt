// A comma/enter-separated chip editor for a string[] field: a track's terms in Manage track, its
// must-include words in Live postings' Calibrate.
import { useId, useState } from 'react';
import { Box, Button, Icon, Input as HdsInput, Stack, Text } from '@hirobius/design-system';
import { X } from 'lucide-react';

/** A field label in the HDS Input label's style (UI 14, medium, primary), so every field in the
 *  dialog reads the same. */
export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: string }) {
  return (
    // Text's props have no htmlFor (they are HTMLElement's); the spread passes it to the label.
    <Text variant="ui" as="label" weight="medium" {...{ htmlFor }}>
      {children}
    </Text>
  );
}

export function ChipEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Stack gap="px8">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
        {/* A term is a static pill; only its X removes it (rev-3 mock), so a stray tap on the
            text can't drop a term. HDS Tag is always one whole button, so this is a Box pill
            with an icon Button: `.rjb-term` / `.rjb-term-x` in base.css. Tag's soft fill, no edge (HDS 0.31). */}
        {values.map((v) => (
          <Box
            key={v}
            as="span"
            className="rjb-term"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              bgcolor: 'var(--semantic-color-surface-muted)',
              borderRadius: 'pill',
              pl: 'sm',
              maxWidth: '100%',
            }}
          >
            <Text variant="ui" as="span" className="rjb-truncate">
              {v}
            </Text>
            <Button
              size="sm"
              variant="tertiary"
              iconOnly
              iconLeft={<Icon icon={X} size="small" />}
              label={`Remove ${v}`}
              className="rjb-term-x"
              onClick={() => onChange(values.filter((x) => x !== v))}
            />
          </Box>
        ))}
        {values.length === 0 && (
          <Text variant="caption" as="span" tone="secondary">
            none yet
          </Text>
        )}
      </Box>
      <Box sx={{ display: 'contents', '& input': { maxWidth: 260 } }}>
        <HdsInput
          id={id}
          size="sm"
          aria-label={placeholder}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
      </Box>
    </Stack>
  );
}

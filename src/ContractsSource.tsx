// Live postings on a Contracts track (#275): the one source row, SAM.gov. It says where it reads
// (the track's state, else all states, the last 30 days), how the read went (the function's own
// words on a failure, so a missing key names SAM_GOV_API_KEY and where to set it) and holds the
// track's NAICS codes (synced with the track's must-include entry, feed/mustInclude.ts).
import { useState } from 'react';
import { Badge, Box, Button, Card, Stack, Text } from '@hirobius/design-system';
import { ChipEditor } from './ChipEditor';
import {
  DEFAULT_NAICS,
  MAX_NAICS,
  POSTED_WITHIN_DAYS,
  cleanNaics,
  stateName,
} from './contracts/sam';
import { setMustInclude } from './feed/mustInclude';

export type ContractsStatus =
  | { kind: 'reading' }
  | { kind: 'ok'; count: number }
  | { kind: 'error'; message: string }
  | { kind: 'idle' };

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export function ContractsSource({
  categoryId,
  naics,
  state,
  status,
}: {
  categoryId: string;
  naics: string[];
  /** Two-letter state from the track's location; absent = all states. */
  state?: string;
  status: ContractsStatus;
}) {
  const [hint, setHint] = useState('');
  const save = (next: string[]) => setMustInclude(categoryId, { naics: next });
  const onChange = (next: string[]) => {
    const clean = cleanNaics(next);
    const added = next.length > naics.length;
    if (added && clean.length === naics.length)
      setHint(
        naics.length >= MAX_NAICS
          ? `At most ${MAX_NAICS} codes.`
          : 'A NAICS code is 2 to 6 digits, like 332322.',
      );
    else setHint('');
    save(clean);
  };
  const where = state ? stateName(state) : 'All states';
  return (
    <Card as="section" aria-label="Contracts source" padding="none">
      <Box sx={{ px: 'sm', py: 'sm' }}>
        <Stack gap="normal">
          <Stack direction="row" gap="px8" align="center" justify="space-between">
            <Box sx={{ minWidth: 0 }}>
              <Stack gap="px4">
                <Text variant="body" as="h3" weight="bold">
                  SAM.gov
                </Text>
                <Text variant="caption" as="p" tone="secondary">
                  {`Federal solicitations posted in the last ${POSTED_WITHIN_DAYS} days · ${where}`}
                </Text>
              </Stack>
            </Box>
            {status.kind === 'error' && <Badge tone="warning">Off</Badge>}
            {status.kind === 'ok' && <Badge tone="success">On</Badge>}
          </Stack>
          <Box role="status">
            {status.kind === 'error' ? (
              <Text variant="caption" as="p" tone="danger">
                {status.message}
              </Text>
            ) : status.kind === 'reading' ? (
              <Text variant="caption" as="p" tone="secondary">
                Reading SAM.gov…
              </Text>
            ) : status.kind === 'ok' ? (
              <Text variant="caption" as="p" tone="secondary">
                {`${status.count} open ${status.count === 1 ? 'solicitation' : 'solicitations'} for these codes`}
              </Text>
            ) : (
              <Text variant="caption" as="p" tone="secondary">
                Add a NAICS code to search.
              </Text>
            )}
          </Box>
          <ChipEditor
            label="NAICS codes"
            placeholder="Add a NAICS code"
            values={naics}
            onChange={onChange}
          />
          {hint && (
            <Text variant="caption" as="p" tone="danger">
              {hint}
            </Text>
          )}
          {!sameList(naics, DEFAULT_NAICS) && (
            <Box>
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => {
                  setHint('');
                  save([...DEFAULT_NAICS]);
                }}
              >
                Use the default codes
              </Button>
            </Box>
          )}
        </Stack>
      </Box>
    </Card>
  );
}

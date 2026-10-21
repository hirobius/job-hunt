// The Privacy policy and Terms pages (#43): `#/legal/privacy` and `#/legal/terms`, opened from the
// Menu. Like Documents they have no tab: the page names itself and links back to Companies. The
// text is data in `legal.ts`; while it is unapproved (`LEGAL_DRAFT`) the page says it is a draft.
import { ArrowLeft } from 'lucide-react';
import { Alert, Box, Button, Icon, InlineLink, Stack, Text } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import {
  CONTACT_EMAIL,
  LEGAL_DRAFT,
  LEGAL_ROUTE,
  LEGAL_UPDATED,
  legalDocFor,
  PRIVACY,
  TERMS,
} from './legal';
import { useRoute } from './route';

export default function LegalPage() {
  const doc = legalDocFor(useRoute().sub);
  const other = doc === TERMS ? PRIVACY : TERMS;
  return (
    // The 760 content measure, like the job page and Documents: this is prose.
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="spacious">
        <Stack gap="normal">
          <PageHeader
            level={2}
            breadcrumb={
              // HDS Button asChild drops iconLeft, so the arrow is the link's own child.
              <Button asChild variant="tertiary" size="sm">
                <a href="#/discover">
                  <Icon icon={ArrowLeft} />
                  Back to Companies
                </a>
              </Button>
            }
            title={doc.title}
          />
          <Text variant="caption" tone="secondary">
            {LEGAL_DRAFT ? 'Draft of' : 'Last updated'} {LEGAL_UPDATED}
          </Text>
          {LEGAL_DRAFT && (
            <Alert tone="info">This is a draft under review and may change before launch.</Alert>
          )}
          <Text variant="body" as="p">
            See also the{' '}
            <InlineLink href={`#/${LEGAL_ROUTE}/${other.slug}`}>{other.title}</InlineLink>.
          </Text>
        </Stack>
        {doc.sections.map((s) => (
          <Stack key={s.heading} gap="normal" as="section" aria-label={s.heading}>
            <Text variant="body" as="h3" className="rjb-semibold">
              {s.heading}
            </Text>
            {s.paragraphs.map((p) => (
              <Text key={p} variant="body" as="p">
                {withEmailLink(p)}
              </Text>
            ))}
            {s.list && (
              <Box as="ul" sx={{ pl: 'md', listStyleType: 'disc' }}>
                {s.list.map((li) => (
                  <Text key={li} variant="body" as="li">
                    {li}
                  </Text>
                ))}
              </Box>
            )}
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/** The contact address reads as a mailto link wherever the text names it. */
function withEmailLink(text: string) {
  const [before, ...rest] = text.split(CONTACT_EMAIL);
  if (!rest.length) return text;
  return (
    <>
      {before}
      <InlineLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</InlineLink>
      {rest.join(CONTACT_EMAIL)}
    </>
  );
}

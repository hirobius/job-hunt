// The Privacy policy and Terms pages (#43): `#/legal/privacy` and `#/legal/terms`, opened from the
// Menu. Like Documents they have no tab: the page names itself and links back to Companies. The
// text is data in `legal.ts`; while it is unapproved (`LEGAL_DRAFT`) the page says it is a draft.
import { Alert, Box, InlineLink, Stack, Text } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import { CONTACT_EMAIL, LEGAL_DRAFT, LEGAL_UPDATED, legalDocFor, PRIVACY, TERMS } from './legal';
import { buildHash, navigate, useRoute, type Route } from './route';
import BackLink from './BackLink';
import { inPlaceClick } from './back';
import { usePageTitle } from './pageTitle';

const TODAY: Route = { tab: 'today', sub: null, pillar: null, jobId: null };

export default function LegalPage() {
  const route = useRoute();
  const doc = legalDocFor(route.sub);
  usePageTitle(doc.title);
  const other = doc === TERMS ? PRIVACY : TERMS;
  // The two pages swap in place and keep where they were first opened from, so Back still goes
  // there, not to the other legal page (return paths).
  const swap = () => navigate({ sub: other.slug, from: route.from ?? null }, true);
  const otherHref = buildHash({ ...route, sub: other.slug });
  return (
    // The 760 content measure, like the job page and Documents: this is prose.
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="spacious">
        <Stack gap="normal">
          <PageHeader
            level={1}
            breadcrumb={
              // "← Companies" (rev-3 #s-legal), flush on the page gutter like Documents' and the
              // Company page's Back (`.rjb-back-link`); opened from another page (the Account
              // menu, anywhere), it names that page and goes back there (return paths).
              <BackLink fallback={TODAY} fallbackLabel="Find" />
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
            See also the {/* InlineLink takes no onClick: the link's click bubbles to this span. */}
            <span onClick={inPlaceClick(swap)}>
              <InlineLink href={otherHref}>{other.title}</InlineLink>
            </span>
            .
          </Text>
        </Stack>
        {doc.sections.map((s) => (
          <Stack key={s.heading} gap="normal" as="section" aria-label={s.heading}>
            <Text variant="body" as="h2" className="rjb-semibold">
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

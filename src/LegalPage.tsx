// Privacy and Terms (#43; #471 slice 4: one dialog with two tabs, not two pages). It opens over the
// page it was asked from (`?legal=privacy|terms` in that page's hash), so a link opens it and a
// reload keeps it; the tabs swap in place, and the browser's Back or Close shuts it. Old
// `#/legal/<doc>` links redirect here (route.ts). The text is data in `legal.ts`; while it is
// unapproved (`LEGAL_DRAFT`) the dialog says it is a draft.
import {
  Alert,
  Box,
  Dialog,
  InlineLink,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@hirobius/design-system';
import { CONTACT_EMAIL, LEGAL_DRAFT, LEGAL_UPDATED, legalDocFor, PRIVACY, TERMS } from './legal';
import { closeDialog, openLegal, useRoute } from './route';
import { usePageTitle } from './pageTitle';
import { useDialogFocus } from './dialogFocus';

type LegalDoc = typeof PRIVACY;

function focusClose(e: Event) {
  // HDS's close button is named by its sr-only text ("Close"), not an aria-label.
  const close = [...((e.target as HTMLElement | null)?.querySelectorAll('button') ?? [])].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'Close',
  );
  if (!close) return;
  e.preventDefault();
  close.focus({ preventScroll: true });
}

export default function LegalPage() {
  const route = useRoute();
  const doc = legalDocFor(route.legal ?? null);
  usePageTitle(doc.title);
  const onCloseAutoFocus = useDialogFocus(!!route.legal);
  return (
    <Dialog open={!!route.legal} onOpenChange={(o) => !o && closeDialog()}>
      <Dialog.Content
        size="lg"
        className="rjb-dialog"
        onCloseAutoFocus={onCloseAutoFocus}
        // Open on Close, not the first tab or link in the text (retro quick wins, 2026-11-08): a
        // screen reader starts at the top and a phone shows no stray ring mid-dialog.
        onOpenAutoFocus={focusClose}
      >
        <Dialog.Header>
          <Dialog.Title>Privacy and terms</Dialog.Title>
          <Dialog.Description>
            <Text variant="caption" as="span" tone="secondary">
              {LEGAL_DRAFT ? 'Draft of' : 'Last updated'} {LEGAL_UPDATED}
            </Text>
          </Dialog.Description>
        </Dialog.Header>
        <Box className="rjb-dialog-body">
          {/* The two documents swap in place: Back closes the dialog, never walks the tabs. */}
          <Tabs value={doc.slug} onValueChange={(v) => openLegal(v, true)}>
            <Stack gap="normal">
              <TabsList aria-label="Privacy and terms">
                <TabsTrigger value={PRIVACY.slug}>{PRIVACY.title}</TabsTrigger>
                <TabsTrigger value={TERMS.slug}>{TERMS.title}</TabsTrigger>
              </TabsList>
              {LEGAL_DRAFT && (
                <Alert tone="info">
                  This is a draft under review and may change before launch.
                </Alert>
              )}
              {[PRIVACY, TERMS].map((d) => (
                <TabsContent key={d.slug} value={d.slug} variant="bare">
                  <LegalBody doc={d} />
                </TabsContent>
              ))}
            </Stack>
          </Tabs>
        </Box>
      </Dialog.Content>
    </Dialog>
  );
}

function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <Stack gap="spacious">
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

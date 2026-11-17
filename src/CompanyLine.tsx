// The company line: the company's 24px mark, then its name, in one row. One component, so a
// Find card, the posting's detail, the job page header and the rail rows cannot drift apart.
// No company says `noCompany` instead (no mark).
import { Stack, Text } from '@hirobius/design-system';
import CompanyLogo from './CompanyLogo';

export default function CompanyLine({
  company,
  url,
  noCompany = 'Company not stated',
  as = 'p',
  variant = 'ui',
}: {
  company: string | undefined;
  /** The posting's link: its domain can be the logo's source (companyLogo.ts). */
  url?: string;
  /** The line shown when there is no company. */
  noCompany?: string;
  as?: 'p' | 'span';
  variant?: 'ui' | 'caption';
}) {
  const name = company?.trim() ?? '';
  if (!name)
    return (
      <Text variant={variant} as={as} tone="secondary">
        {noCompany}
      </Text>
    );
  return (
    <Stack direction="row" gap="px8" align="center" data-rjb-company-line="">
      <CompanyLogo inline company={name} postings={url ? [url] : []} />
      <Text variant={variant} as={as} className="min-w-0">
        {name}
      </Text>
    </Stack>
  );
}

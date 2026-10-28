// The legal pages' route slug and titles (#43), apart from their wording in legal.ts: the shell,
// the Account menu and route labels need only these, so the full text stays in LegalPage's
// chunk (#371).
import type { LegalSlug } from './legal';

/** The route slug for the legal pages: `#/legal/privacy`, `#/legal/terms`. */
export const LEGAL_ROUTE = 'legal';

export const LEGAL_TITLES: Record<LegalSlug, string> = {
  privacy: 'Privacy policy',
  terms: 'Terms of use',
};

/** An unknown or missing sub-slug is the Privacy policy (like `legalDocFor`). */
export const legalTitleFor = (sub: string | null): string =>
  LEGAL_TITLES[sub === 'terms' ? 'terms' : 'privacy'];

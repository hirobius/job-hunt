// The product name lives here and only here (#55). Change these values to rename the app. The header wordmark, the page <title> and meta
// tags (index.html placeholders, filled by the `brand-html` plugin in vite.config.ts), toasts and
// export filenames all read from it; `brand.test.ts` fails if the name is hard-coded elsewhere.
//
// Not covered on purpose: stored data identifiers. The backup format id (`app: 'apply-board'` in
// backup.ts) and calendar event UIDs (ics.ts) stay fixed so old backups restore and re-exported
// events update instead of duplicating.
export const BRAND = {
  /** Display name, all lowercase (Adrian 2026-11-08): the wordmark, <title> ("Find · roleflame"),
   *  the manifest, emails and docs copy. Identifiers, URLs and the repo keep their own case. */
  name: 'roleflame',
  /** The wordmark: the flame (src/brand/flame.svg) before the name (Adrian 2026-10-30). The name is
   *  roleflame (Adrian 2026-11-02, hirobius/ops#1092, lowercase since 2026-11-08; was hiraga, Stoke,
   *  RoleForge). */
  wordmark: { flame: 'before' },
  /** Lowercase, URL/file-safe: download filenames. */
  slug: 'roleflame',
  /** One line for <meta name="description">. */
  description:
    'A job-application tracker and discovery board: screen postings, track your pipeline, and generate targeted searches.',
} as const;

// The product name lives here and only here (#55). It is a working name while names are shopped
// around: change these values to rename the app. The header wordmark, the page <title> and meta
// tags (index.html placeholders, filled by the `brand-html` plugin in vite.config.ts), toasts and
// export filenames all read from it; `brand.test.ts` fails if the name is hard-coded elsewhere.
//
// Not covered on purpose: stored data identifiers. The backup format id (`app: 'apply-board'` in
// backup.ts) and calendar event UIDs (ics.ts) stay fixed so old backups restore and re-exported
// events update instead of duplicating.
export const BRAND = {
  /** Display name. */
  name: 'RoleForge',
  /** Header wordmark: the second part takes the accent colour. Joined, it must equal `name`. */
  wordmark: ['Role', 'Forge'] as const,
  /** Lowercase, URL/file-safe: download filenames. */
  slug: 'roleforge',
  /** One line for <meta name="description">. */
  description:
    'A job-application tracker and discovery board: screen postings, track your pipeline, and generate targeted searches.',
} as const;

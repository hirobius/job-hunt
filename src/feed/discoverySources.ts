// Per-source switch for the discovery sources this app has not yet seen answer from a browser (the
// build sandbox cannot reach them), like SOURCE_ENABLED in fetchFeed.ts. Both are ON by default
// (docs/specs/discovery-methods.md, open question 7). Turn one off here if its first deployed check
// shows it blocked or gone; a failure is already isolated and named in the UI either way.
export const DISCOVERY_SOURCE_ENABLED: Record<'yc' | 'github', boolean> = {
  /** yc-oss.github.io, the community mirror of YC's directory. UNVERIFIED LIVE. */
  yc: true,
  /** api.github.com repository search for design-system organisations. UNVERIFIED LIVE. */
  github: true,
};

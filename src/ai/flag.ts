// The build-time feature flag for "Screen with AI" (vite.config.ts defines it from flagRule.ts).
declare const __RF_AI_SCREENING__: boolean | undefined;

export const AI_SCREENING: boolean =
  typeof __RF_AI_SCREENING__ !== 'undefined' && __RF_AI_SCREENING__ === true;

// When "Screen with AI" is built in (a pure rule, read by vite.config.ts at build time). On in dev,
// tests, local builds and Vercel previews; OFF on Vercel production until Adrian approves it.
// RF_AI_SCREENING=on|off overrides either way.
export function aiScreeningOn(env: { VERCEL_ENV?: string; RF_AI_SCREENING?: string }): boolean {
  if (env.RF_AI_SCREENING === 'on') return true;
  if (env.RF_AI_SCREENING === 'off') return false;
  return env.VERCEL_ENV !== 'production';
}

// The old Companies screens (DiscoverView: Watched, Apply now, ATS search, Live postings, Find
// boards, Manage track) until #389 deletes them. The final shell (simplify Q6) has no Companies
// tab: route.ts sends their routes to Today, so the app never shows them. Their own tests (and the
// e2e specs that drive them, through `window.__RJB_LEGACY_SCREENS__`) switch them back on, so what
// they pin keeps passing until the screens and this switch go together.
declare global {
  interface Window {
    __RJB_LEGACY_SCREENS__?: boolean;
  }
}

let on = typeof window !== 'undefined' && window.__RJB_LEGACY_SCREENS__ === true;

/** Whether the old Companies screens are reachable (tests only). */
export const legacyScreens = (): boolean => on;

/** Tests only: reach the old Companies screens (true) or not (false, the app's own state). */
export function setLegacyScreens(value: boolean): void {
  on = value;
}

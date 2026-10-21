// Reset local data (#46; rev-3 O): drop every app key from this browser, then reload. The cloud
// session (Supabase's own key) stays, so a signed-in user's synced jobs come back on load.
export function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('rjb_'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage blocked: the reload still clears the in-memory state */
  }
  window.location.reload();
}

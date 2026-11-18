/* global localStorage, document, window -- runs in the browser before the app */
// Runs before first paint (a blocking script from 'self', so the CSP allows it): apply the stored
// colour mode (else the OS's) so there's no flash or layout jump. ColorModeProvider keeps it in
// sync after.
(function () {
  var mode = 'dark';
  try {
    if (window.matchMedia)
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    /* no matchMedia: default */
  }
  try {
    var s = localStorage.getItem('rjb_color_mode');
    if (s === 'light' || s === 'dark') mode = s;
  } catch {
    /* storage blocked: default */
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', mode);
  if (mode === 'dark') root.classList.add('dark');
  // Pause animations (motionPref.ts, per device): the app's own motion reads this attribute
  // (base.css), so a paused device shows no enter or collapse on its first paint either.
  try {
    if (localStorage.getItem('rjb_ui_pause_motion') === '1')
      root.setAttribute('data-rjb-motion', 'paused');
  } catch {
    /* storage blocked: motion follows the system setting */
  }
})();

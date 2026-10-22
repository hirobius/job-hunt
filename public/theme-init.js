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
})();

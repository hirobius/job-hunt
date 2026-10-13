/* global localStorage, document -- runs in the browser before the app */
// Runs before first paint (a blocking script from 'self', so the CSP allows it): apply the stored
// colour mode and density so there's no flash or layout jump. ColorModeProvider keeps it in sync after.
(function () {
  var mode = 'dark';
  try {
    var s = localStorage.getItem('rjb_color_mode');
    if (s === 'light' || s === 'dark') mode = s;
  } catch {
    /* storage blocked: default */
  }
  var root = document.documentElement;
  var dense = true;
  try {
    dense = localStorage.getItem('rjb_ui_density') !== 'comfortable';
  } catch {
    /* storage blocked: default */
  }
  if (dense) root.setAttribute('data-density', 'compact');
  root.setAttribute('data-theme', mode);
  if (mode === 'dark') root.classList.add('dark');
})();

// Applies a remembered colour theme before the page paints. External file (strict CSP).
(function () {
  // A meta CSP cannot stop framing; on hosts without the _headers file, leave any frame.
  try {
    if (window.top !== window.self) window.top.location.replace(window.self.location.href);
  } catch (e) {
    /* cross-origin parent refused navigation: nothing else to do */
  }
  try {
    var t = window.localStorage.getItem('mnum-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage blocked: follow the system setting */
  }
})();

// Vercel Web Analytics for the public Lab (lab.aabdurashidov.ch, hosted on Vercel since 17 Nov 2026).
// - Page paths only: query strings and fragments are removed before an event leaves the browser.
// - The owner's own devices are not counted: open the Lab one time with ?me=1 on a device (?me=0 counts it again).
//   This is separate from aabdurashidov.ch (another site, so another browser storage).
// - No cookies, no names, no personal data. Outside Vercel (local copy) the insights script is absent: nothing is sent.
(function () {
  var KEY = 'lab-me', me = false;
  try {
    var m = /[?&]me=([01])(?:&|$)/.exec(location.search);
    if (m) {
      if (m[1] === '1') localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY);
      history.replaceState(null, '', location.pathname + location.hash);
    }
    me = localStorage.getItem(KEY) === '1';
  } catch (e) { /* no storage: the device is counted */ }
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', function (event) {
    if (me) return null;
    return Object.assign({}, event, { url: String(event.url).split(/[?#]/)[0] });
  });
})();

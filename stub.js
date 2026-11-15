/* Placeholder pages: the shell and a calm "coming next" sentence. */
(function () {
  'use strict';
  var page = (location.pathname.split('/').pop() || '').replace('.html', '') || 'today';
  Lab.shell({ page: page });
  Promise.all([Lab.load('company_room'), Lab.load('macro_room'), Lab.load('deals_room')]).then(function (r) {
    Lab.status();
  }).catch(Lab.fail);
})();

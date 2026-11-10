/* Lab v1 (frozen): fills two fields that the current public room files leave out. */
(function () {
  'use strict';
  var plain = window.fetch;
  window.fetch = function (url, options) {
    return plain.call(this, url, options).then(function (response) {
      if (!/(_room|markets)\.json/.test(String(url))) return response;
      var read = response.json.bind(response);
      response.json = function () {
        return read().then(function (d) {
          if (d && typeof d === 'object') {
            if (d.built == null) d.built = d.fundamentals_built || d.as_of || d.universe_as_of || '';
            if (d.private === false && d.price_source == null) d.price_source = 'hidden (prices private)';
          }
          return d;
        });
      };
      return response;
    });
  };
})();

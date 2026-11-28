/* CSV downloads (Wave 1, 28 Nov 2026). Pure text helpers, tested in export.test.cjs, plus one browser helper that saves
   the file. The file is built in the browser from the public JSON; nothing is sent anywhere.
   Rules: comma separated, CRLF line ends, a UTF-8 byte-order mark so that Excel reads the names right; numbers stay
   plain numbers; a text cell that starts with = + - @, a tab or a line break gets a leading apostrophe, so that a
   spreadsheet does not run it as a formula. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cell(v) {
    if (v == null) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    var s = String(v);
    if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(header, rows) {
    return [header].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }
  function fileName(stem, asOf) {
    var day = /^\d{4}-\d{2}-\d{2}/.exec(String(asOf || '')) ;
    return String(stem).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + (day ? '-' + day[0] : '') + '.csv';
  }
  /* browser only: save the text as a file */
  function save(name, text) {
    var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }
  return { cell: cell, csv: csv, fileName: fileName, save: save };
});

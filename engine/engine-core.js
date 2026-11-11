/* Physics engine for the published web version.
 * Boots Pyodide (Python compiled to WebAssembly), unpacks SymPy and the app's own
 * Python package, and answers the same JSON API the local server does.
 * Works in a Web Worker, on the main thread, and in Node (for tests).
 * Archives ship base64-encoded as .txt because published pages cannot serve .zip.
 */
(function (root) {
  'use strict';
  async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('could not load ' + url + ' (' + r.status + ')');
    return r.text();
  }
  function b64ToBytes(t) {
    const bin = atob(t.trim());
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  async function bootEngine(opts) {
    const base = opts.base;                        // absolute URL ending in '/'
    const progress = opts.progress || function () {};
    const v = opts.version ? '?v=' + encodeURIComponent(opts.version) : '';   // defeats stale caches after an update
    const loadPyodide = opts.loadPyodide || root.loadPyodide;
    const manifest = JSON.parse(await fetchText(base + 'engine/manifest.json' + v));
    progress('Downloading the Python runtime', 0.05);
    const stdlib = b64ToBytes(await fetchText(base + manifest.stdlib + v));
    const realFetch = root.fetch.bind(root);
    const VIRTUAL = base + 'py/virtual/python_stdlib.zip';
    root.fetch = function (u, o) {
      return String(u) === VIRTUAL ? Promise.resolve(new Response(stdlib)) : realFetch(u, o);
    };
    progress('Starting Python', 0.25);
    const py = await loadPyodide({ indexURL: base + 'py/', stdLibURL: VIRTUAL });
    root.fetch = realFetch;
    let step = 0;
    for (const w of manifest.wheels) {
      progress('Loading ' + w.name, 0.35 + 0.35 * (step++ / manifest.wheels.length));
      py.unpackArchive(b64ToBytes(await fetchText(base + w.file + v)).buffer, 'wheel');
    }
    progress('Loading the problem bank', 0.75);
    py.FS.mkdirTree('/mp');
    py.unpackArchive(b64ToBytes(await fetchText(base + manifest.app + v)).buffer, 'zip', { extractDir: '/mp' });
    py.runPython("import sys; sys.path.insert(0, '/mp/backend')");
    progress('Importing SymPy and 353 problem templates', 0.85);
    const web = py.pyimport('app.webapi');
    const info = JSON.parse(web.boot(opts.saved ? JSON.stringify(opts.saved) : ''));
    progress('Ready', 1);
    return {
      info: info,
      request: function (method, url, body) {
        return JSON.parse(web.request(method, url, body === undefined || body === null ? '' : JSON.stringify(body)));
      },
      snapshot: function () { return JSON.parse(web.snapshot()); },
    };
  }
  root.bootEngine = bootEngine;
  if (typeof module !== 'undefined') module.exports = { bootEngine: bootEngine };
})(typeof self !== 'undefined' ? self : globalThis);

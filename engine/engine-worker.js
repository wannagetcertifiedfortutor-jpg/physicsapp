/* Web Worker wrapper: messages in {id, type, ...}, messages out {id, ok, value|error} plus progress events. */
let engine = null;
let booting = null;
self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'boot') {
      if (!booting) {
        booting = (async () => {
          const v = m.version ? '?v=' + encodeURIComponent(m.version) : '';
          importScripts(m.base + 'py/pyodide.js', m.base + 'engine/engine-core.js' + v);
          engine = await self.bootEngine({ base: m.base, saved: m.saved, version: m.version, progress: (label, frac) => self.postMessage({ type: 'progress', label, frac }) });
          return engine.info;
        })();
      }
      self.postMessage({ id: m.id, ok: true, value: await booting });
    } else if (m.type === 'request') {
      if (!engine) await booting;
      self.postMessage({ id: m.id, ok: true, value: engine.request(m.method, m.url, m.body) });
    } else if (m.type === 'snapshot') {
      self.postMessage({ id: m.id, ok: true, value: engine.snapshot() });
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });
  }
};

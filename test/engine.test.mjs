import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../src/engine.js');
const S = require('../src/sample.js');

const withTimes = () => {
  const s = structuredClone(S);
  s.models.forEach(m => m.tasks.forEach(t => { if (t.hh == null) t.hh = t.skill ? 4 : 0; if (t.wait == null) t.wait = 8; }));
  return s;
};

test('el ejemplo se programa sin errores', () => {
  const r = E.schedule(withTimes());
  assert.deepEqual(r.errors, []);
  assert.ok(r.makespan > 0);
});

test('respeta precedencias', () => {
  const r = E.schedule(withTimes());
  for (const t of r.tasks) for (const p of t.preds) assert.ok(t.start >= p.end, `${t.key} empieza antes que ${p.key}`);
});

test('ningún operario hace dos tareas a la vez', () => {
  const r = E.schedule(withTimes());
  for (const w of r.workers) {
    const segs = w.segs.slice().sort((a, b) => a.s - b.s);
    for (let i = 1; i < segs.length; i++) assert.ok(segs[i].s >= segs[i - 1].e, w.name);
  }
});

test('respeta la capacidad de cada estación', () => {
  const r = E.schedule(withTimes());
  for (const s of r.stations) for (let t = 0; t < r.makespan; t++) {
    const n = s.visits.filter(v => v.enter <= t && (v.leave ?? Infinity) > t).length;
    assert.ok(n <= s.cap, `${s.id} en ${t}: ${n} > ${s.cap}`);
  }
});

test('detecta precedencias circulares', () => {
  const errs = E.validateModel({ tasks: [{ id: 'A', preds: ['B'] }, { id: 'B', preds: ['A'] }] });
  assert.ok(errs.some(e => /ciclo/.test(e)));
});

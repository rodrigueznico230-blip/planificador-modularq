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

test('una cuadrilla hace con sus 3 operarios las tareas con puesto asignado', () => {
  const s = withTimes();
  s.crews = [{ id: 'C1', name: 'Cuadrilla 1', members: ['W1', 'W2', 'W6'] }];
  const m = s.models.find(x => x.id === 'M2');
  m.tasks.forEach((t, i) => { if (t.skill) t.pos = [['A'], ['A', 'B'], ['C']][i % 3]; });
  s.projects = [{ id: 'P1', name: 'X', model: 'M2', qty: 2, release: s.calendar.start, due: '2027-03-01', prio: 1, crews: ['C1'] }];
  const r = E.schedule(s);
  assert.deepEqual(r.errors, []);
  const ids = { A: 'W1', B: 'W2', C: 'W6' };
  for (const t of r.tasks) {
    if (!t.tpl.pos || !t.tpl.pos.length || !t.hh) continue;
    const got = [...t.crew].map(i => r.workers[i].id).sort();
    assert.deepEqual(got, t.tpl.pos.map(p => ids[p]).sort(), t.key);
  }
});

test('con dos cuadrillas el proyecto se divide en lotes consecutivos', () => {
  const s = withTimes();
  s.crews = [{ id: 'C1', name: 'A', members: ['W1', 'W2', 'W6'] }, { id: 'C2', name: 'B', members: ['W3', 'W5', 'W8'] }];
  s.projects = [{ id: 'P1', name: 'X', model: 'M2', qty: 4, release: s.calendar.start, due: '2027-03-01', prio: 1, crews: ['C1', 'C2'] }];
  const r = E.schedule(s);
  assert.deepEqual(r.projects[0].units.map(u => u.crew), ['C1', 'C1', 'C2', 'C2']);
});

test('el estándar por estación se aplica a todos los formatos y el ajuste del modelo lo reemplaza', () => {
  const s = withTimes();
  s.crews = [{ id: 'C1', name: 'Cuadrilla 1', members: ['W1', 'W2', 'W6'] }];
  const m = s.models.find(x => x.id === 'M2');
  const work = m.tasks.filter(t => t.skill);
  s.stdPos = {};
  work.forEach(t => { (s.stdPos[t.station] = s.stdPos[t.station] || {})[E.normKey(t.name)] = ['B']; });
  work[0].pos = ['A', 'C'];       // ajuste propio
  work[1].pos = ['0'];            // sin puesto en este modelo
  s.projects = [{ id: 'P1', name: 'X', model: 'M2', qty: 1, release: s.calendar.start, due: '2027-03-01', prio: 1, crews: ['C1'] }];
  const r = E.schedule(s);
  assert.deepEqual(r.errors, []);
  const ids = t => [...t.crew].map(i => r.workers[i].id).sort();
  for (const t of r.tasks) {
    if (!t.hh || !t.tpl.skill) continue;
    if (t.tpl === work[0]) assert.deepEqual(ids(t), ['W1', 'W6']);
    else if (t.tpl === work[1]) assert.equal(t.fixed, null);
    else assert.deepEqual(ids(t), ['W2'], t.key);
  }
  assert.equal(E.normKey('  Colocación de PUERTA. '), 'colocacion de puerta');
});

test('las tareas de apoyo las hace un operario designado o cualquiera de la planta, aunque no sea de la cuadrilla', () => {
  const s = withTimes();
  s.crews = [{ id: 'C1', name: 'Cuadrilla 1', members: ['W1', 'W2', 'W6'] }];
  const m = s.models.find(x => x.id === 'M2');
  const work = m.tasks.filter(t => t.skill);
  work.forEach(t => { t.pos = ['A']; });
  const outsider = s.workers.find(w => !['W1', 'W2', 'W6'].includes(w.id) && w.skills.includes(work[0].skill));
  work[0].pos = ['@' + outsider.id];        // designado fuera de la cuadrilla
  work[1].pos = ['B', '@' + outsider.id];   // puesto + designado
  work[2].pos = ['*'];                      // cualquiera de la planta
  s.projects = [{ id: 'P1', name: 'X', model: 'M2', qty: 1, release: s.calendar.start, due: '2027-03-01', prio: 1, crews: ['C1'] }];
  const r = E.schedule(s);
  assert.deepEqual(r.errors, []);
  const ids = t => [...t.crew].map(i => r.workers[i].id).sort();
  const byTpl = tpl => r.tasks.find(t => t.tpl === tpl);
  assert.deepEqual(ids(byTpl(work[0])), [outsider.id]);
  assert.deepEqual(ids(byTpl(work[1])), ['W2', outsider.id].sort());
  assert.equal(byTpl(work[2]).fixed, null);
});

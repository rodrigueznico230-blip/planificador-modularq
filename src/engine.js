/* ==========================================================================
   Motor de programación multi-proyecto
   - Simulación por hora hábil (granularidad 1 h)
   - Restricciones: precedencias, liberación del proyecto, capacidad de
     estaciones (unidades simultáneas), especialidad y cuadrilla mín/máx,
     disponibilidad (%) de cada operario, esperas tecnológicas (curado/secado)
   - Regla de despacho: continuidad de lo iniciado > prioridad del proyecto >
     fecha de compromiso > peso posicional (camino restante) > orden de unidad
   ========================================================================== */
(function (root) {
  'use strict';

  const DAY_MS = 86400000;

  function parseISO(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  }
  function toISO(ms) {
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- Calendario ---------------- */
  const Q = 4; // resolución: 4 intervalos de 15 minutos por hora

  function makeCalendar(cal, maxDays) {
    const start = parseISO(cal.start);
    const hol = new Set((cal.holidays || []).map(h => String(h).trim()).filter(Boolean));
    const days = [];
    let slot = 0;
    for (let i = 0; i < maxDays; i++) {
      const ms = start + i * DAY_MS;
      const iso = toISO(ms);
      const dow = new Date(ms).getUTCDay();
      const isHol = hol.has(iso);
      const hours = isHol ? 0 : Math.max(0, Math.round(Number(cal.hours[dow]) || 0));
      days.push({ i, ms, iso, dow, hours, slots: hours * Q, holiday: isHol, slot0: slot });
      slot += hours * Q;
    }
    const slotDay = new Int32Array(slot);
    for (const d of days) for (let h = 0; h < d.slots; h++) slotDay[d.slot0 + h] = d.i;
    return {
      start, days, totalSlots: slot, slotDay, Q,
      dayOfSlot(s) {
        if (s <= 0) return days[0];
        if (s >= slot) return days[days.length - 1];
        return days[slotDay[s]];
      },
      /* posición continua en días calendario (para dibujar) */
      posStart(s) {
        if (s >= slot) return days.length;
        const d = days[slotDay[Math.max(0, s)]];
        return d.i + (s - d.slot0) / d.slots;
      },
      posEnd(sExcl) {
        if (sExcl <= 0) return 0;
        const s = Math.min(sExcl, slot) - 1;
        const d = days[slotDay[s]];
        return d.i + (s - d.slot0 + 1) / d.slots;
      },
      /* primer slot hábil en o después de la fecha */
      slotAtDate(iso) {
        const idx = Math.round((parseISO(iso) - start) / DAY_MS);
        if (idx <= 0) return 0;
        if (idx >= days.length) return slot;
        return days[idx].slot0;
      },
      /* fin del día hábil de la fecha (exclusivo) */
      slotEndOfDate(iso) {
        let idx = Math.round((parseISO(iso) - start) / DAY_MS);
        if (idx < 0) return 0;
        if (idx >= days.length) return slot;
        return days[idx].slot0 + days[idx].slots;
      },
      /* días hábiles entre dos slots (con signo) */
      workdaysBetween(a, b) {
        const da = this.dayOfSlot(Math.max(0, a - 1)).i, db = this.dayOfSlot(Math.max(0, b - 1)).i;
        const lo = Math.min(da, db), hi = Math.max(da, db);
        let n = 0;
        for (let i = lo + 1; i <= hi; i++) if (days[i].hours > 0) n++;
        return db >= da ? n : -n;
      }
    };
  }

  /* ---------------- Validación de modelos ---------------- */
  function validateModel(model) {
    const errs = [];
    const ids = new Set(model.tasks.map(t => t.id));
    for (const t of model.tasks) {
      for (const p of t.preds || []) if (!ids.has(p)) errs.push(`${t.id}: el precedente ${p} no existe.`);
      if ((+t.hh || 0) > 0 && (+t.cmin || 1) > (+t.cmax || 1)) errs.push(`${t.id}: la cuadrilla mínima supera a la máxima.`);
    }
    // ciclos
    const state = {};
    const byId = Object.fromEntries(model.tasks.map(t => [t.id, t]));
    let cyc = false;
    function dfs(id) {
      if (state[id] === 1) { cyc = true; return; }
      if (state[id] === 2 || !byId[id]) return;
      state[id] = 1;
      for (const p of byId[id].preds || []) dfs(p);
      state[id] = 2;
    }
    model.tasks.forEach(t => dfs(t.id));
    if (cyc) errs.push('Las precedencias forman un ciclo: revisá la columna de precedentes.');
    return errs;
  }

  /* peso posicional: horas del camino más largo desde la tarea hasta el final */
  function positionalWeights(model) {
    const succ = {};
    model.tasks.forEach(t => (succ[t.id] = []));
    model.tasks.forEach(t => (t.preds || []).forEach(p => succ[p] && succ[p].push(t.id)));
    const byId = Object.fromEntries(model.tasks.map(t => [t.id, t]));
    const memo = {};
    function w(id, depth) {
      if (memo[id] != null) return memo[id];
      if (depth > 500) return 0;
      const t = byId[id];
      const own = (+t.hh || 0) / Math.max(1, +t.cmax || 1) + (+t.wait || 0);
      let m = 0;
      for (const s of succ[id]) m = Math.max(m, w(s, depth + 1));
      return (memo[id] = own + m);
    }
    model.tasks.forEach(t => w(t.id, 0));
    return memo;
  }

  /* ---------------- Programación ---------------- */
  function schedule(S, opts) {
    opts = opts || {};
    const MAX_DAYS = opts.maxDays || 540;
    const cal = makeCalendar(S.calendar, MAX_DAYS);
    const errors = [];
    const warnings = [];

    const stations = S.stations.map(s => ({ ...s, cap: Math.max(1, Math.round(+s.cap || 1)) }));
    const stIdx = Object.fromEntries(stations.map((s, i) => [s.id, i]));
    const workers = S.workers.filter(w => w.active !== false).map(w => ({
      ...w, eff: 1, avail: Math.max(0.05, Math.min(1, (+w.pct || 100) / 100)), skillSet: new Set(w.skills || [])
    }));
    const models = Object.fromEntries(S.models.map(m => [m.id, m]));
    const wIdx = Object.fromEntries(workers.map((w, i) => [w.id, i]));
    // Cuadrillas: 3 puestos (A, B, C) → operarios concretos
    const crews = Object.fromEntries((S.crews || []).map(c => [c.id, { ...c, idx: (c.members || []).map(id => (id && wIdx[id] != null ? wIdx[id] : null)) }]));
    const POS = { A: 0, B: 1, C: 2 };

    const units = [];
    const tasks = [];
    const projects = [];

    S.projects.forEach((p, pi) => {
      const m = models[p.model];
      const pr = {
        id: p.id, name: p.name, client: p.client, model: p.model, modelName: m ? m.name : '—',
        qty: Math.max(0, Math.round(+p.qty || 0)), color: pi, prio: +p.prio || 2,
        release: p.release, due: p.due, units: [], excluded: false, reason: ''
      };
      pr.crews = (p.crews || []).filter(id => crews[id]);
      projects.push(pr);
      if (!m) { pr.excluded = true; pr.reason = 'El proyecto no tiene un modelo válido.'; errors.push(`${p.name}: elegí un modelo.`); return; }
      if (!pr.qty) { pr.excluded = true; pr.reason = 'Cantidad en cero.'; return; }
      const mErr = validateModel(m);
      if (mErr.length) { pr.excluded = true; pr.reason = mErr[0]; errors.push(`${p.name} (${m.name}): ${mErr[0]}`); return; }
      // especialidades suficientes
      for (const t of m.tasks) {
        if ((+t.hh || 0) <= 0) continue;
        if (pr.crews.length && (t.pos || []).length) continue; // la hace la cuadrilla asignada
        const q = workers.filter(w => w.skillSet.has(t.skill)).length;
        if (q < Math.max(1, +t.cmin || 1)) {
          pr.excluded = true;
          pr.reason = `La tarea “${t.name}” necesita ${t.cmin} operario(s) de ${t.skill || 'sin especialidad'} y hay ${q}.`;
          errors.push(`${p.name}: ${pr.reason}`);
          return;
        }
        if (stIdx[t.station] == null) {
          pr.excluded = true; pr.reason = `La tarea “${t.name}” no tiene estación asignada.`;
          errors.push(`${p.name}: ${pr.reason}`); return;
        }
      }
      const pw = positionalWeights(m);
      const relSlot = cal.slotAtDate(p.release || S.calendar.start);
      const dueSlot = cal.slotEndOfDate(p.due || S.calendar.start);
      pr.relSlot = relSlot; pr.dueSlot = dueSlot;
      for (let u = 0; u < pr.qty; u++) {
        // Lotes consecutivos: con 2 cuadrillas y 10 módulos, 1–5 → primera, 6–10 → segunda
        const crew = pr.crews.length ? crews[pr.crews[Math.floor(u * pr.crews.length / pr.qty)]] : null;
        const unit = {
          key: `${p.id}#${u + 1}`, project: pr, n: u + 1, tasks: [], st: {},
          start: null, end: null, crew: crew ? crew.id : null
        };
        m.tasks.forEach((t, ti) => {
          const task = {
            key: `${unit.key}:${t.id}`, unit, tpl: t, order: ti,
            hh: Math.max(0, +t.hh || 0), rem: Math.max(0, +t.hh || 0),
            cmin: Math.max(1, Math.round(+t.cmin || 1)), cmax: Math.max(1, Math.round(+t.cmax || 1)),
            wait: Math.max(0, Math.round((+t.wait || 0) * Q)),
            st: stIdx[t.station], pw: pw[t.id] || 0,
            preds: [], status: 0, // 0 espera, 1 en curso, 2 mano de obra terminada (curando), 3 terminada
            start: null, laborEnd: null, end: null, crew: new Set(), lastCrew: [], workedSlots: 0, fixed: null
          };
          // Puestos fijos de la cuadrilla: la tarea la hacen exactamente esos operarios
          if (crew && (t.pos || []).length) {
            const ids = [...new Set(t.pos)].map(ps => crew.idx[POS[ps]]);
            if (ids.every(i => i != null)) { task.fixed = ids; task.cmin = task.cmax = ids.length; }
          }
          unit.tasks.push(task);
          tasks.push(task);
          const so = unit.st[task.st] || (unit.st[task.st] = { total: 0, done: 0, in: false, enter: null, leave: null });
          so.total++;
        });
        const byTpl = Object.fromEntries(unit.tasks.map(x => [x.tpl.id, x]));
        unit.tasks.forEach(x => { x.preds = (x.tpl.preds || []).map(id => byTpl[id]).filter(Boolean); });
        pr.units.push(unit);
        units.push(unit);
      }
    });

    const occ = new Int32Array(stations.length);
    const occSlots = new Float64Array(stations.length);
    const wSeg = workers.map(() => []);
    const wDay = workers.map(() => new Map()); // dayIndex -> horas ocupadas
    const skillDay = {}; // skill -> Map(dayIndex -> horas)

    const freeBuf = new Uint8Array(workers.length);
    const bySkill = new Map();
    for (const sk of new Set(workers.flatMap(w => [...w.skillSet]))) {
      bySkill.set(sk, workers.map((w, i) => i).filter(i => workers[i].skillSet.has(sk))
        .sort((a, b) => (workers[a].skillSet.size - workers[b].skillSet.size) || (workers[b].avail - workers[a].avail) || (a - b)));
    }
    const relSlots = [...new Set(projects.filter(p => !p.excluded && p.relSlot != null).map(p => p.relSlot))];
    let pending = tasks.length;
    let t = 0;
    const maxT = cal.totalSlots;

    // Lista de disponibles por conteo de precedentes pendientes (evita recorrer todas las tareas en cada hora)
    for (const x of tasks) { x.succ = []; x.waitPreds = x.preds.length; }
    for (const x of tasks) for (const p of x.preds) p.succ.push(x);
    let avail = tasks.filter(x => x.waitPreds === 0);
    let curing = [];

    function leaveIfDone(task, at) {
      const so = task.unit.st[task.st];
      so.done++;
      if (so.done >= so.total && so.in) { so.in = false; so.leave = at; occ[task.st]--; }
    }
    function finish(x) {
      x.status = 3; pending--; leaveIfDone(x, x.end);
      for (const s of x.succ) if (--s.waitPreds === 0) avail.push(s);
    }

    while (pending > 0 && t < maxT) {
      // 1) cerrar esperas terminadas
      if (curing.length) {
        const still = [];
        for (const x of curing) { if (x.end <= t) finish(x); else still.push(x); }
        curing = still;
      }
      if (!pending) break;

      // 2) tareas disponibles
      avail = avail.filter(x => x.status < 2);
      const ready = [];
      for (const x of avail) if (t >= x.unit.project.relSlot) ready.push(x);
      if (!ready.length) { for (let s2 = 0; s2 < stations.length; s2++) occSlots[s2] += occ[s2]; t++; continue; }
      ready.sort((a, b) =>
        (b.status - a.status) ||
        (a.unit.project.prio - b.unit.project.prio) ||
        (a.unit.project.dueSlot - b.unit.project.dueSlot) ||
        (b.pw - a.pw) || (a.unit.n - b.unit.n) || (a.order - b.order));

      const canEnter = x => {
        const so = x.unit.st[x.st];
        return so.in || occ[x.st] < stations[x.st].cap;
      };
      const enter = x => {
        const so = x.unit.st[x.st];
        if (!so.in && so.enter == null) { so.in = true; so.enter = t; occ[x.st]++; }
        if (x.start == null) { x.start = t; if (x.unit.start == null || t < x.unit.start) x.unit.start = t; }
      };

      // 3) esperas puras (sin mano de obra)
      let startedWait = false;
      for (const x of ready) {
        if (x.hh > 0 || x.status !== 0) continue;
        if (!canEnter(x)) continue;
        enter(x);
        x.status = 2; x.laborEnd = t; x.end = t + x.wait;
        curing.push(x);
        startedWait = true;
      }

      // 4) asignación de operarios
      let changedNow = false; // un inicio o un fin cambia el orden de prioridades del intervalo siguiente
      const dNow = cal.days[cal.slotDay[t]];
      const slotOfDay = t - dNow.slot0;
      const free = freeBuf;
      for (let i = 0; i < workers.length; i++) free[i] = slotOfDay < Math.round(dNow.slots * workers[i].avail) ? 1 : 0;
      const crews = new Map();
      // Prioridad: quienes ya venían en la tarea, luego el orden fijo por especialidad (menos polivalentes primero)
      const pick = (x, n) => {
        if (x.fixed) return x.fixed.filter(wi => free[wi]);
        const out = [];
        for (const wi of x.lastCrew) { if (out.length >= n) return out; if (free[wi] && workers[wi].skillSet.has(x.tpl.skill)) out.push(wi); }
        const order = bySkill.get(x.tpl.skill) || [];
        for (const wi of order) { if (out.length >= n) break; if (free[wi] && !out.includes(wi)) out.push(wi); }
        return out;
      };
      for (const x of ready) {
        if (x.hh <= 0 || x.status === 2) continue;
        if (x.status === 0 && !canEnter(x)) continue;
        const c = pick(x, x.cmin);
        if (c.length < x.cmin) continue;
        for (const wi of c) free[wi] = 0;
        crews.set(x, c);
        if (x.status === 0) { enter(x); x.status = 1; changedNow = true; }
      }
      for (const [x, c] of crews) {
        let cap = c.reduce((s, wi) => s + workers[wi].eff / Q, 0);
        while (c.length < x.cmax && cap < x.rem - 1e-9) {
          const more = pick(x, 1);
          if (!more.length) break;
          free[more[0]] = 0; c.push(more[0]); cap += workers[more[0]].eff / Q;
        }
      }

      // 5) avance
      const day = cal.slotDay[t];
      for (const [x, c] of crews) {
        let done = 0;
        for (const wi of c) {
          done += workers[wi].eff / Q;
          x.crew.add(wi);
          const segs = wSeg[wi];
          const last = segs[segs.length - 1];
          if (last && last.task === x && last.e === t) last.e = t + 1; else segs.push({ task: x, s: t, e: t + 1 });
          wDay[wi].set(day, (wDay[wi].get(day) || 0) + 1 / Q);
          const sk = x.tpl.skill;
          (skillDay[sk] || (skillDay[sk] = new Map())).set(day, ((skillDay[sk].get(day)) || 0) + 1 / Q);
        }
        x.lastCrew = c.slice();
        x.workedSlots++;
        x.rem -= done;
        if (x.rem <= 1e-6) {
          x.rem = 0; x.status = 2; x.laborEnd = t + 1; x.end = t + 1 + x.wait;
          curing.push(x);
          changedNow = true;
        }
      }
      for (let s = 0; s < stations.length; s++) occSlots[s] += occ[s];

      // 6) avance rápido: si nada puede cambiar en los próximos k intervalos, se aplican de una vez
      //    (mismo resultado que simular intervalo por intervalo)
      if (!changedNow && !startedWait && crews.size) {
        let k = dNow.slot0 + dNow.slots - (t + 1);
        for (let i = 0; i < workers.length && k > 0; i++) {
          const b = dNow.slot0 + Math.round(dNow.slots * workers[i].avail);
          if (b > t) k = Math.min(k, b - (t + 1));
        }
        for (const x of curing) k = Math.min(k, x.end - (t + 1));
        for (const r of relSlots) if (r > t) k = Math.min(k, r - (t + 1));
        for (const [x, c] of crews) {
          if (k <= 0) break;
          const pr = c.reduce((a, wi) => a + workers[wi].eff / Q, 0);
          k = Math.min(k, Math.ceil(x.rem / pr - 1e-9) - 1);
          if (c.length > x.cmin) {
            const capPrev = pr - workers[c[c.length - 1]].eff / Q;
            k = Math.min(k, Math.max(0, Math.floor((x.rem - capPrev) / pr - 1e-9)));
          }
        }
        if (k > 0) {
          for (const [x, c] of crews) {
            for (const wi of c) {
              const segs = wSeg[wi]; segs[segs.length - 1].e += k;
              wDay[wi].set(day, wDay[wi].get(day) + k / Q);
              const sk = x.tpl.skill; skillDay[sk].set(day, skillDay[sk].get(day) + k / Q);
              x.rem -= k * workers[wi].eff / Q;
            }
            x.workedSlots += k;
          }
          for (let s = 0; s < stations.length; s++) occSlots[s] += occ[s] * k;
          t += k;
        }
      }
      t++;
    }
    // cerrar esperas que terminan en el último slot
    for (const x of curing) if (x.status === 2) finish(x);

    const unscheduled = tasks.filter(x => x.status !== 3);
    if (unscheduled.length) errors.push(`${unscheduled.length} tarea(s) no entraron en el horizonte de ${MAX_DAYS} días. Revisá la dotación o el calendario.`);

    let makespan = 0;
    for (const u of units) {
      u.end = u.tasks.reduce((m, x) => Math.max(m, x.end || 0), 0);
      makespan = Math.max(makespan, u.end);
    }
    for (const p of projects) {
      if (p.excluded || !p.units.length) continue;
      p.start = Math.min(...p.units.map(u => u.start ?? Infinity));
      p.end = Math.max(...p.units.map(u => u.end || 0));
      p.hh = p.units.reduce((s, u) => s + u.tasks.reduce((a, x) => a + x.hh, 0), 0);
      p.slackDays = cal.workdaysBetween(p.end, p.dueSlot); // + = holgura
      p.status = p.end > p.dueSlot ? 'late' : (p.slackDays <= 2 ? 'risk' : 'ok');
    }

    // estaciones
    const span = Math.max(1, makespan);
    const stationStats = stations.map((s, i) => ({
      ...s, util: occSlots[i] / (s.cap * span),
      visits: units.map(u => u.st[i] ? { unit: u, enter: u.st[i].enter, leave: u.st[i].leave } : null).filter(v => v && v.enter != null)
    }));
    let bottleneck = null;
    stationStats.forEach(s => { if (!bottleneck || s.util > bottleneck.util) bottleneck = s; });

    // operarios
    const lastDay = cal.dayOfSlot(Math.max(0, makespan - 1)).i;
    const firstDay = 0;
    const workerStats = workers.map((w, i) => {
      let avail = 0, busy = 0;
      for (let d = firstDay; d <= lastDay; d++) { avail += Math.round(cal.days[d].slots * w.avail) / Q; busy += wDay[i].get(d) || 0; }
      return { ...w, idx: i, segs: wSeg[i], day: wDay[i], busy, availH: avail, util: avail ? busy / avail : 0 };
    });
    const avgUtil = workerStats.length ? workerStats.reduce((s, w) => s + w.util, 0) / workerStats.length : 0;

    return {
      cal, projects, units, tasks, stations: stationStats, workers: workerStats,
      skillDay, makespan, lastDay, bottleneck, avgUtil, errors, warnings, unscheduled
    };
  }

  const api = { schedule, makeCalendar, validateModel, positionalWeights, parseISO, toISO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlanEngine = api;
})(this);

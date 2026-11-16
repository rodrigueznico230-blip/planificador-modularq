/* ---------- Cuadrillas: equipos de 3, reparto de tareas por puesto (Yamazumi) y hoja diaria ---------- */
const POS = ['A', 'B', 'C'];
const POS_LABEL = { A: 'Operario 1', B: 'Operario 2', C: 'Operario 3' };
const posVar = i => `var(--s${i + 1})`;
const posInk = i => `var(--s${i + 1}-ink)`;
const workerById = id => S.workers.find(w => w.id === id);
const crewName = c => c ? c.name : '';
const memberName = (c, ps) => { const w = c && workerById((c.members || [])[POS.indexOf(ps)]); return w ? w.name : POS_LABEL[ps]; };
const shortName = n => String(n || '').split(/\s+/)[0];
function crewOf(workerId) { return (S.crews || []).find(c => (c.members || []).includes(workerId)); }
function hhm(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + ' min' : ''}`;
}

/* Carga por puesto de un modelo: cada operario del puesto dedica HH / cantidad de puestos */
function crewLoads(m) {
  const load = { A: 0, B: 0, C: 0 }, byTask = { A: [], B: [], C: [] };
  let unassigned = 0, unassignedMin = 0, total = 0;
  for (const t of m.tasks) {
    if (!t.skill) continue;
    const min = (+t.hh || 0) * 60;
    const ps = [...new Set(t.pos || [])].filter(p => POS.includes(p));
    if (!ps.length) { unassigned++; unassignedMin += min; continue; }
    total += min;
    for (const p of ps) { load[p] += min / ps.length; byTask[p].push({ t, min: min / ps.length, share: ps.length }); }
  }
  const max = Math.max(load.A, load.B, load.C);
  const eff = max ? total / (3 * max) : 0;
  return { load, byTask, total, max, eff, unassigned, unassignedMin };
}

/* Reparto automático: equilibra la carga entre los 3 puestos respetando la cuadrilla mínima
   y prefiriendo el puesto cuyo operario (en la cuadrilla de referencia) tiene la especialidad. */
function autoAssign(m, refCrew) {
  const skillsOf = ps => { const w = refCrew && workerById((refCrew.members || [])[POS.indexOf(ps)]); return new Set(w ? w.skills || [] : []); };
  const crewSkills = refCrew ? new Set(POS.flatMap(ps => [...skillsOf(ps)])) : null;
  const load = { A: 0, B: 0, C: 0 };
  // tareas más largas primero para un mejor equilibrio, conservando el orden del modelo en la tabla
  const elig = m.tasks.filter(t => t.skill && (!crewSkills || crewSkills.has(t.skill)));
  m.tasks.forEach(t => { if (!elig.includes(t)) t.pos = []; });
  elig.slice().sort((a, b) => (+b.hh || 0) - (+a.hh || 0)).forEach(t => {
    const k = Math.min(3, Math.max(1, Math.round(+t.cmin || 1)));
    const ranked = POS.slice().sort((a, b) => (skillsOf(b).has(t.skill) - skillsOf(a).has(t.skill)) || (load[a] - load[b]) || a.localeCompare(b));
    t.pos = ranked.slice(0, k).sort();
    t.pos.forEach(p => { load[p] += ((+t.hh || 0) * 60) / k; });
  });
}

function slotClock(s) {
  const d = R.cal.dayOfSlot(s);
  const [h, mi] = String(S.calendar.startTime || '07:00').split(':').map(Number);
  const tot = h * 60 + (mi || 0) + Math.round((s - d.slot0) * 60 / R.cal.Q);
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}
function slotClockEnd(e) {
  const d = R.cal.dayOfSlot(e - 1);
  if (e - 1 - d.slot0 + 1 >= d.slots) {
    const [h, mi] = String(S.calendar.startTime || '07:00').split(':').map(Number);
    const tot = h * 60 + (mi || 0) + d.hours * 60;
    return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
  }
  return slotClock(e);
}

views.cuadrillas = () => {
  S.crews = S.crews || [];
  const tab = S.ui.crewTab || 'equipos';
  const head = pageHead('Cuadrillas',
    'Equipos fijos de 3 operarios. A cada proyecto o lote se le asigna una cuadrilla, y dentro de cada modelo cada tarea tiene su puesto (Operario 1, 2 o 3). Como el reparto es por puesto y no por persona, sirve igual para cualquier cuadrilla y cualquier formato.',
    tab === 'equipos' ? btn(plus + 'Agregar cuadrilla', 'add-crew', true) : tab === 'hoja' ? btn('<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5.5 7V3.5h9V7M5.5 14H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1.5M6 11.5h8v5H6z" stroke-linejoin="round"/></svg>Imprimir hoja', 'print-sheet') : '');
  const tabs = `<div class="mb-5 no-print">${seg('crewTab', [['equipos', 'Equipos'], ['reparto', 'Reparto de tareas'], ['hoja', 'Hoja diaria']], tab)}</div>`;
  return head + tabs + (tab === 'reparto' ? crewAssignView() : tab === 'hoja' ? crewSheetView() : crewTeamsView());
};

/* ---------- Equipos ---------- */
function crewTeamsView() {
  if (!S.crews.length) {
    return card(`<div class="p-10 text-center"><h2 class="text-lg font-semibold">Todavía no hay cuadrillas</h2><p class="mt-2 text-sm text-ink-2 max-w-md mx-auto leading-relaxed">Creá una cuadrilla, elegí sus 3 operarios y asignala a uno o más proyectos en la sección Proyectos. Después repartí las tareas de cada modelo entre los 3 puestos.</p><div class="mt-5">${btn(plus + 'Crear la primera cuadrilla', 'add-crew', true)}</div></div>`);
  }
  const usage = {};
  S.workers.forEach(w => { usage[w.id] = (S.crews || []).filter(c => (c.members || []).includes(w.id)).length; });
  const rw = id => R.workers.find(x => x.id === id);
  const cards = S.crews.map((c, ci) => {
    const projs = S.projects.filter(p => (p.crews || []).includes(c.id));
    const members = POS.map((ps, k) => {
      const id = (c.members || [])[k] || '';
      const r = id && rw(id);
      const dup = id && usage[id] > 1;
      return `<div class="grid grid-cols-12 gap-3 items-center py-2 ${k ? 'border-t border-line-2' : ''}">
        <span class="col-span-1 inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-semibold" style="background:${posVar(k)};color:${posInk(k)}" aria-hidden="true">${k + 1}</span>
        <label class="col-span-7 text-xs text-ink-3" for="cr${ci}m${k}">${POS_LABEL[ps]}<select id="cr${ci}m${k}" class="fld mt-1 ${dup ? 'invalid' : ''}" data-crewmember="${ci}:${k}"><option value="">Sin asignar</option>${S.workers.map(w => `<option value="${esc(w.id)}" ${w.id === id ? 'selected' : ''}>${esc(w.name)}${w.active === false ? ' (inactivo)' : ''}</option>`).join('')}</select>${dup ? '<span class="block mt-1 text-bad">Está en más de una cuadrilla</span>' : ''}</label>
        <div class="col-span-4 text-right pt-4"><div class="text-sm font-semibold num">${r ? pct(r.util) : '—'}</div><div class="text-xs text-ink-3">uso en el plan</div></div></div>`;
    }).join('');
    const utils = (c.members || []).map(id => id && rw(id)).filter(Boolean);
    const avgU = utils.length ? utils.reduce((a, r) => a + r.util, 0) / utils.length : 0;
    const spread = utils.length > 1 ? Math.max(...utils.map(r => r.util)) - Math.min(...utils.map(r => r.util)) : 0;
    const units = projs.reduce((a, p) => { const n = (p.crews || []).length || 1; const q = +p.qty || 0; const idx = p.crews.indexOf(c.id); return a + (Math.floor((idx + 1) * q / n) - Math.floor(idx * q / n)); }, 0);
    return card(`<div class="p-5">
      <div class="flex items-start gap-3"><label class="flex-1 text-xs text-ink-3" for="crn${ci}">Nombre<input id="crn${ci}" class="fld mt-1 text-base font-semibold" value="${esc(c.name)}" data-path="crews.${ci}.name" data-rerender></label><div class="pt-5">${delBtn('del-crew', ci, 'Eliminar ' + c.name)}</div></div>
      <div class="mt-3">${members}</div>
      <div class="mt-4 grid grid-cols-3 gap-3 rounded-md bg-surface-2 p-3 text-center">
        <div><div class="text-lg font-semibold num">${utils.length ? pct(avgU) : '—'}</div><div class="text-xs text-ink-3">uso promedio</div></div>
        <div ${tipAttr('Diferencia entre el operario más cargado y el menos cargado. Cuanto menor, más parejo está repartido el trabajo.')}><div class="text-lg font-semibold num ${spread > 0.2 ? 'text-warn' : ''}">${utils.length > 1 ? Math.round(spread * 100) + ' pts' : '—'}</div><div class="text-xs text-ink-3">desbalance</div></div>
        <div><div class="text-lg font-semibold num">${units}</div><div class="text-xs text-ink-3">módulos a cargo</div></div>
      </div>
      <div class="mt-4"><div class="text-xs font-medium text-ink-3 mb-1.5">Proyectos asignados</div>${projs.length ? `<div class="flex flex-wrap gap-1.5">${projs.map(p => { const pi = S.projects.indexOf(p); return `<span class="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">${swatch(pi, 'w-2 h-2')}${esc(p.name)}${(p.crews || []).length > 1 ? ` <span class="text-ink-3">lote ${(p.crews || []).indexOf(c.id) + 1} de ${(p.crews || []).length}</span>` : ''}</span>`; }).join('')}</div>` : '<p class="text-sm text-ink-3">Ninguno. Asignala desde <a class="text-accent font-medium hover:underline" href="#proyectos">Proyectos</a>.</p>'}</div>
    </div>`);
  }).join('');
  return `<div class="grid md:grid-cols-2 2xl:grid-cols-3 gap-6 items-start">${cards}</div>
    <p class="mt-4 text-xs text-ink-3 leading-relaxed max-w-3xl">Un proyecto con varias cuadrillas se reparte en lotes consecutivos: con 10 módulos y 2 cuadrillas, la primera hace los módulos 1 a 5 y la segunda del 6 al 10. Las tareas sin puesto (instalaciones, subcontratos, control) las toma el resto de la planta según su especialidad.</p>`;
}

/* ---------- Reparto de tareas por puesto (plantilla del modelo) ---------- */
function crewAssignView() {
  if (!S.models.length) return card('<p class="p-8 text-center text-ink-2">Primero cargá un modelo.</p>');
  const m = S.models.find(x => x.id === S.ui.crewModel) || S.models.find(x => x.id === S.ui.model) || S.models[0];
  S.ui.crewModel = m.id;
  const mi = S.models.indexOf(m);
  const ref = S.crews.find(c => c.id === S.ui.crewRef) || S.crews[0] || null;
  const L = crewLoads(m);
  const miss = m.tasks.filter(t => t.skill && (t.hh == null || t.hh === '')).length;
  const names = POS.map(ps => (ref ? memberName(ref, ps) : POS_LABEL[ps]));

  const controls = `<div class="flex flex-wrap items-end gap-4 mb-4 no-print">
    <label class="text-sm text-ink-2" for="crModel">Modelo<select id="crModel" class="fld mt-1 w-80 max-w-full" data-ui="crewModel">${modelOptions(m.id)}</select></label>
    <label class="text-sm text-ink-2" for="crRef">Ver con los nombres de<select id="crRef" class="fld mt-1 w-56" data-ui="crewRef">${S.crews.length ? S.crews.map(c => `<option value="${esc(c.id)}" ${ref && c.id === ref.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">Sin cuadrillas (puestos genéricos)</option>'}</select></label>
    <div class="ml-auto flex flex-wrap gap-2">${btn('Repartir automáticamente', 'auto-assign', true, `title="Equilibra la carga entre los 3 puestos y respeta la cantidad mínima de operarios de cada tarea${ref ? '. Prioriza al operario con la especialidad' : ''}."`)}${btn('Quitar reparto', 'clear-assign')}</div></div>`;

  const kpi = (l, v, n, cls = '') => `<div class="p-4"><div class="text-xs text-ink-2">${l}</div><div class="mt-1 text-xl font-semibold tracking-tight num ${cls}">${v}</div><div class="text-xs text-ink-3 mt-0.5">${n}</div></div>`;
  const kpis = card(`<div class="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
    ${kpi('Trabajo de la cuadrilla', hhm(L.total), 'por módulo, suma de los 3 operarios')}
    ${kpi('Carga del más cargado', hhm(L.max), L.max ? `${esc(names[POS.findIndex(p => L.load[p] === L.max)])}: marca el ritmo` : 'Sin reparto')}
    ${kpi('Eficiencia de balanceo', L.max ? pct(L.eff) : '—', 'Trabajo total ÷ (3 × carga máxima)', L.max && L.eff < 0.85 ? 'text-warn' : '')}
    ${kpi('Tareas sin puesto', String(L.unassigned), L.unassigned ? `${hhm(L.unassignedMin)} que hace el resto de la planta` : 'Toda la secuencia está repartida')}</div>`);

  // Yamazumi por operario
  const Wc = 600, Hc = 340, ml = 52, mr = 92, mt = 20, mb = 52;
  const ymax = Math.max(L.max, 1) * 1.12;
  const stepY = niceStep(ymax / 5);
  const iw = Wc - ml - mr, ih = Hc - mt - mb, bw = 104;
  const y = v => mt + ih - v / ymax * ih;
  let svg = '';
  for (let v = 0; v <= ymax + 1e-9; v += stepY) svg += `<line x1="${ml}" x2="${Wc - mr}" y1="${y(v)}" y2="${y(v)}" stroke="rgb(var(--line))"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="rgb(var(--ink-3))">${nf0.format(v)}</text>`;
  POS.forEach((ps, k) => {
    const cx = ml + iw / 3 * (k + 0.5);
    let acc = 0;
    const segs = L.byTask[ps];
    segs.forEach((sgm, j) => {
      const h = sgm.min, y1 = y(acc + h), y0 = y(acc);
      const hh = Math.max(0.6, y0 - y1 - 2);
      svg += `<g ${tipAttr(`<b>${esc(sgm.t.id)} ${esc(sgm.t.name)}</b><br>${esc(names[k])}: ${hhm(sgm.min)}${sgm.share > 1 ? ` (tarea de ${sgm.share} operarios, ${hhm(sgm.min * sgm.share)} en total)` : ''}<br>Estación ${esc(sgm.t.station)}`)}><rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${hh}" rx="${j === segs.length - 1 ? 4 : 1}" fill="${posVar(k)}"/>${hh > 14 ? `<text x="${cx}" y="${y1 + hh / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="${posInk(k)}">${esc(sgm.t.id)}</text>` : ''}</g>`;
      acc += h;
    });
    svg += `<text x="${cx}" y="${y(L.load[ps]) - 7}" text-anchor="middle" font-size="12" font-weight="600" fill="rgb(var(--ink))">${hhm(L.load[ps])}</text>`;
    svg += `<text x="${cx}" y="${Hc - mb + 20}" text-anchor="middle" font-size="12" font-weight="600" fill="rgb(var(--ink))">${esc(shortName(names[k]))}</text><text x="${cx}" y="${Hc - mb + 36}" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">${POS_LABEL[ps]}, ${segs.length} tareas</text>`;
  });
  if (L.total) {
    const avg = L.total / 3;
    svg += `<line x1="${ml}" x2="${Wc - mr + 4}" y1="${y(avg)}" y2="${y(avg)}" stroke="rgb(var(--ink-2))" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${Wc - mr + 8}" y="${y(avg) - 4}" font-size="11" font-weight="600" fill="rgb(var(--ink-2))">Carga pareja</text><text x="${Wc - mr + 8}" y="${y(avg) + 11}" font-size="11" fill="rgb(var(--ink-2))">${hhm(avg)}</text>`;
  }
  svg += `<text x="14" y="${mt + ih / 2}" transform="rotate(-90 14 ${mt + ih / 2})" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">minutos por módulo</text>`;

  // Yamazumi de la cuadrilla por estación (apilado por operario)
  const stIds = [...new Set(m.tasks.filter(t => t.skill && (t.pos || []).length).map(t => t.station))];
  const perSt = stIds.map(id => { const o = { id, A: 0, B: 0, C: 0 }; POS.forEach(ps => L.byTask[ps].forEach(sg => { if (sg.t.station === id) o[ps] += sg.min; })); o.tot = o.A + o.B + o.C; return o; });
  const maxSt = Math.max(1, ...perSt.map(o => o.tot)) * 1.12;
  const W2 = 600, H2 = 340, ml2 = 52, mr2 = 16, mb2 = 46, mt2 = 20, iw2 = W2 - ml2 - mr2, ih2 = H2 - mt2 - mb2;
  const y2 = v => mt2 + ih2 - v / maxSt * ih2;
  const bw2 = Math.min(48, iw2 / Math.max(1, perSt.length) * 0.6);
  let svg2 = '';
  const step2 = niceStep(maxSt / 5);
  for (let v = 0; v <= maxSt + 1e-9; v += step2) svg2 += `<line x1="${ml2}" x2="${W2 - mr2}" y1="${y2(v)}" y2="${y2(v)}" stroke="rgb(var(--line))"/><text x="${ml2 - 8}" y="${y2(v) + 4}" text-anchor="end" font-size="11" fill="rgb(var(--ink-3))">${nf0.format(v)}</text>`;
  perSt.forEach((o, i) => {
    const cx = ml2 + iw2 / perSt.length * (i + 0.5);
    let acc = 0;
    POS.forEach((ps, k) => {
      if (!o[ps]) return;
      const y1 = y2(acc + o[ps]), y0 = y2(acc), hh = Math.max(0.6, y0 - y1 - 2);
      svg2 += `<rect x="${cx - bw2 / 2}" y="${y1}" width="${bw2}" height="${hh}" rx="2" fill="${posVar(k)}" ${tipAttr(`<b>${esc(o.id)} ${esc((S.stations.find(s => s.id === o.id) || {}).name || '')}</b><br>${esc(names[k])}: ${hhm(o[ps])}`)}/>`;
      acc += o[ps];
    });
    svg2 += `<text x="${cx}" y="${y2(o.tot) - 6}" text-anchor="middle" font-size="10.5" font-weight="600" fill="rgb(var(--ink))">${nf0.format(o.tot)}</text><text x="${cx}" y="${H2 - mb2 + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="rgb(var(--ink))">${esc(o.id)}</text>`;
  });
  const legend = `<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">${POS.map((ps, k) => `<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${posVar(k)}"></span>${esc(names[k])}</span>`).join('')}</div>`;

  // Tabla de reparto agrupada por estación
  let lastSt = null;
  const stName = id => (S.stations.find(x => x.id === id) || {}).name || 'Sin estación';
  const rows = m.tasks.map((t, i) => {
    const grp = t.station !== lastSt ? (lastSt = t.station, `<tr class="bg-surface-2/70 border-t border-line"><td colspan="5" class="px-4 py-2"><span class="text-xs num text-ink-3 mr-3">${esc(t.station || '')}</span><span class="text-sm font-semibold">${esc(stName(t.station))}</span></td></tr>`) : '';
    const min = (+t.hh || 0) * 60;
    const ps = new Set(t.pos || []);
    const cmin = Math.max(1, Math.round(+t.cmin || 1));
    const note = !t.skill ? '<span class="text-xs text-ink-3">Espera, sin mano de obra</span>'
      : `<div class="flex items-center gap-1.5">${POS.map((p, k) => `<button data-act="toggle-pos" data-i="${i}" data-p="${p}" aria-pressed="${ps.has(p)}" title="${esc(names[k])}" class="pos-chip rounded-full border border-line px-2.5 py-0.5 text-xs font-medium transition-colors" style="--c:${posVar(k)};--ci:${posInk(k)}">${esc(shortName(names[k]))}</button>`).join('')}${ps.size && ps.size !== cmin ? `<span class="text-xs text-warn ml-1" title="El modelo indica ${cmin} operario(s) para esta tarea">pide ${cmin}</span>` : ''}${!ps.size ? '<span class="text-xs text-ink-3 ml-1">resto de la planta</span>' : ''}</div>`;
    return grp + `<tr class="border-t border-line-2"><td class="pl-4 pr-2 py-2 text-xs num text-ink-3">${esc(t.id)}</td><td class="px-2 py-2">${esc(t.name)}<div class="text-xs text-ink-3">${esc(t.skill || 'Espera')}</div></td><td class="px-2 py-2 text-right num whitespace-nowrap">${t.skill ? (t.hh == null || t.hh === '' ? '<span class="text-warn">sin tiempo</span>' : nf0.format(min) + ' min') : (t.wait ? t.wait + ' h' : '—')}</td><td class="px-2 py-2 text-right num">${t.skill ? cmin : '—'}</td><td class="px-2 pr-4 py-2">${note}</td></tr>`;
  }).join('');

  const missNote = miss ? `<div class="mb-4 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm">Este modelo tiene <b>${miss} tareas sin tiempo</b>: no suman carga en el diagrama. <a href="#modelos" class="font-medium text-accent hover:underline">Cargar tiempos</a></div>` : '';
  return controls + missNote + `<div class="space-y-6">${kpis}
    <div class="grid xl:grid-cols-2 gap-6 items-start">
    ${card(`<div class="px-5 pt-4"><h2 class="text-base font-semibold">${L.max ? (L.eff >= 0.9 ? 'La carga está pareja entre los 3 operarios' : `${esc(shortName(names[POS.findIndex(p => L.load[p] === L.max)]))} tiene ${hhm(L.max - L.total / 3)} más que la carga pareja`) : 'Repartí las tareas para ver la carga de cada operario'}</h2><p class="text-xs text-ink-3 mt-0.5">Yamazumi por operario: minutos que cada uno dedica a un módulo. Las tareas de 2 o 3 operarios se dividen entre ellos.</p></div><div class="scroll-x px-3 pb-3"><svg viewBox="0 0 ${Wc} ${Hc}" class="w-full" style="min-width:480px" role="img" aria-label="Carga por operario del modelo ${esc(m.name)}">${svg}</svg></div>`)}
    ${card(`<div class="px-5 pt-4 flex flex-wrap items-baseline justify-between gap-2"><div><h2 class="text-base font-semibold">Cuadrilla por estación</h2><p class="text-xs text-ink-3 mt-0.5">Minutos de la cuadrilla en cada estación, separados por operario.</p></div>${legend}</div><div class="scroll-x px-3 pb-3">${perSt.length ? `<svg viewBox="0 0 ${W2} ${H2}" class="w-full" style="min-width:480px" role="img" aria-label="Minutos de la cuadrilla por estación">${svg2}</svg>` : '<p class="p-6 text-sm text-ink-3">Sin tareas repartidas.</p>'}</div>`)}
    </div>
    ${card(`<div class="px-5 pt-4 pb-2"><h2 class="text-base font-semibold">Puestos por tarea</h2><p class="text-xs text-ink-3 mt-0.5">Tocá un nombre para sumarlo o quitarlo de la tarea. Las tareas sin puesto las hace el resto de la planta según su especialidad.</p></div>
      <div class="scroll-x"><table class="w-full text-sm" style="min-width:760px"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-2 font-medium">Código</th><th class="px-2 font-medium">Tarea</th><th class="px-2 font-medium text-right">Tiempo</th><th class="px-2 font-medium text-right" title="Operarios que pide el modelo">Oper.</th><th class="px-2 pr-4 font-medium">Puestos</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
    </div>`;
}

/* ---------- Hoja de procedimiento diario ---------- */
function workerDaySegs(wi, di) {
  const w = R.workers[wi];
  if (!w) return [];
  const out = [];
  for (const sg of w.segs) {
    const d0 = R.cal.slotDay[sg.s], d1 = R.cal.slotDay[sg.e - 1];
    if (d1 < di || d0 > di) continue;
    const day = R.cal.days[di];
    const s = Math.max(sg.s, day.slot0), e = Math.min(sg.e, day.slot0 + day.slots);
    const last = out[out.length - 1];
    if (last && last.task === sg.task && last.e === s) last.e = e; else out.push({ task: sg.task, s, e });
  }
  return out.sort((a, b) => a.s - b.s);
}
function crewSheetView() {
  const active = R.workers;
  if (!active.length) return card('<p class="p-8 text-center text-ink-2">No hay operarios activos.</p>');
  const sel = S.ui.sheetWho || (S.crews[0] ? 'crew:' + S.crews[0].id : 'w:' + active[0].id);
  // primer día con trabajo
  const workDays = R.cal.days.slice(0, R.lastDay + 1).filter(d => d.hours);
  let dayIso = S.ui.sheetDay;
  if (!dayIso || !workDays.some(d => d.iso === dayIso)) dayIso = (workDays[0] || R.cal.days[0]).iso;
  S.ui.sheetDay = dayIso;
  const di = R.cal.days.findIndex(d => d.iso === dayIso);
  const day = R.cal.days[di];
  const ids = sel.startsWith('crew:') ? ((S.crews.find(c => c.id === sel.slice(5)) || {}).members || []).filter(Boolean) : [sel.slice(2)];
  const crew = sel.startsWith('crew:') ? S.crews.find(c => c.id === sel.slice(5)) : crewOf(sel.slice(2));
  const projIdx = new Map(R.projects.map((p, i) => [p, i]));

  const opts = `${S.crews.map(c => `<optgroup label="${esc(c.name)}"><option value="crew:${esc(c.id)}" ${sel === 'crew:' + c.id ? 'selected' : ''}>Toda la cuadrilla (3 hojas)</option>${(c.members || []).filter(Boolean).map(id => { const w = workerById(id); return w ? `<option value="w:${esc(id)}" ${sel === 'w:' + id ? 'selected' : ''}>${esc(w.name)}</option>` : ''; }).join('')}</optgroup>`).join('')}<optgroup label="Todos los operarios">${active.map(w => `<option value="w:${esc(w.id)}" ${sel === 'w:' + w.id && !crewOf(w.id) ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</optgroup>`;
  const di0 = workDays.findIndex(d => d.iso === dayIso);
  const prev = workDays[di0 - 1], next = workDays[di0 + 1];
  const controls = `<div class="flex flex-wrap items-end gap-4 mb-4 no-print">
    <label class="text-sm text-ink-2" for="shWho">Operario o cuadrilla<select id="shWho" class="fld mt-1 w-72" data-ui="sheetWho">${opts}</select></label>
    <div class="text-sm text-ink-2"><label for="shDay">Día</label><div class="mt-1 flex items-center gap-1"><button data-act="sheet-day" data-d="${prev ? prev.iso : ''}" ${prev ? '' : 'disabled'} class="rounded-md border border-line px-2 py-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Día hábil anterior"><svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.5 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><input id="shDay" type="date" class="fld w-44" value="${esc(dayIso)}" min="${esc(R.cal.days[0].iso)}" max="${esc(R.cal.days[R.lastDay].iso)}" data-ui="sheetDay"><button data-act="sheet-day" data-d="${next ? next.iso : ''}" ${next ? '' : 'disabled'} class="rounded-md border border-line px-2 py-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Día hábil siguiente"><svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.5 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>
    <p class="text-xs text-ink-3 max-w-sm ml-auto">Los horarios salen del programa y del inicio de jornada (${esc(S.calendar.startTime || '07:00')}, en Calendario). Cambian si cambia el plan.</p></div>`;

  const sheets = ids.map(id => {
    const wi = R.workers.findIndex(w => w.id === id);
    const w = R.workers[wi];
    if (!w) return card(`<p class="p-6 text-sm text-ink-2">${esc((workerById(id) || {}).name || id)} está inactivo y no tiene tareas programadas.</p>`);
    const segs = day.hours ? workerDaySegs(wi, di) : [];
    const availMin = Math.round(day.slots * w.avail) * 60 / R.cal.Q;
    const busyMin = segs.reduce((a, s) => a + (s.e - s.s) * 60 / R.cal.Q, 0);
    const posOf = (task) => { const c = S.crews.find(cc => cc.id === task.unit.crew); if (!c) return ''; const k = (c.members || []).indexOf(w.id); return k >= 0 ? POS_LABEL[POS[k]] : ''; };
    let cursor = day.slot0;
    const rows = [];
    segs.forEach((sg, n) => {
      if (sg.s > cursor) rows.push(`<tr class="border-t border-line-2 text-ink-3"><td class="pl-4 pr-2 py-2 num whitespace-nowrap">${slotClock(cursor)} – ${slotClock(sg.s)}</td><td colspan="6" class="px-2 py-2 text-xs italic">Sin tarea programada (${hhm((sg.s - cursor) * 60 / R.cal.Q)})</td></tr>`);
      const t = sg.task, pi = projIdx.get(t.unit.project);
      const mates = [...t.crew].filter(x => x !== wi).map(x => R.workers[x].name);
      rows.push(`<tr class="border-t border-line-2 align-top"><td class="pl-4 pr-2 py-2.5 num whitespace-nowrap font-medium">${slotClock(sg.s)} – ${slotClockEnd(sg.e)}</td>
        <td class="px-2 py-2.5"><div class="flex items-center gap-1.5">${swatch(pi, 'w-2 h-2')}<span class="font-medium">${esc(t.unit.project.name)}</span></div><div class="text-xs text-ink-3">Módulo ${t.unit.n} de ${t.unit.project.qty}</div></td>
        <td class="px-2 py-2.5"><span class="num text-ink-3 text-xs">${esc(t.tpl.id)}</span> ${esc(t.tpl.name)}<div class="text-xs text-ink-3">${esc(t.tpl.station)} ${esc((S.stations.find(s => s.id === t.tpl.station) || {}).name || '')}${posOf(t) ? ', ' + posOf(t) : ''}</div></td>
        <td class="px-2 py-2.5 text-right num whitespace-nowrap">${hhm((sg.e - sg.s) * 60 / R.cal.Q)}</td>
        <td class="px-2 py-2.5 text-xs text-ink-2">${mates.length ? esc(mates.join(', ')) : 'Solo'}</td>
        <td class="px-2 py-2.5 text-center"><span class="inline-block w-4 h-4 rounded border border-ink-3/60" aria-label="Casilla para marcar"></span></td>
        <td class="px-2 pr-4 py-2.5"><span class="block h-5 border-b border-dotted border-ink-3/60 min-w-24"></span></td></tr>`);
      cursor = sg.e;
    });
    const endSlot = day.slot0 + Math.round(day.slots * w.avail);
    if (segs.length && cursor < endSlot) rows.push(`<tr class="border-t border-line-2 text-ink-3"><td class="pl-4 pr-2 py-2 num whitespace-nowrap">${slotClock(cursor)} – ${slotClockEnd(endSlot)}</td><td colspan="6" class="px-2 py-2 text-xs italic">Sin tarea programada (${hhm((endSlot - cursor) * 60 / R.cal.Q)})</td></tr>`);
    const wc = crewOf(w.id);
    return `<section class="sheet rounded-lg border border-line bg-surface shadow-sm">
      <header class="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-line">
        <div><div class="text-xs text-ink-3">Hoja de procedimiento diario</div><h2 class="text-xl font-semibold tracking-tight">${esc(w.name)}</h2><div class="text-sm text-ink-2">${wc ? esc(wc.name) + ', ' + POS_LABEL[POS[(wc.members || []).indexOf(w.id)]] : 'Sin cuadrilla'}${w.skills && w.skills.length ? ' (' + esc(w.skills.join(', ')) + ')' : ''}</div></div>
        <div class="text-right"><div class="text-lg font-semibold capitalize">${esc(fDay.format(new Date(day.ms)).replace(/\./g, ''))}</div><div class="text-sm text-ink-2 num">${day.hours ? `${slotClock(day.slot0)} – ${slotClockEnd(day.slot0 + day.slots)}` : 'Día no laborable'}</div></div>
      </header>
      <div class="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
        <div class="py-3"><div class="text-lg font-semibold num">${segs.length}</div><div class="text-xs text-ink-3">tareas</div></div>
        <div class="py-3"><div class="text-lg font-semibold num">${hhm(busyMin)}</div><div class="text-xs text-ink-3">programado</div></div>
        <div class="py-3"><div class="text-lg font-semibold num ${availMin && busyMin / availMin < 0.6 ? 'text-warn' : ''}">${availMin ? pct(busyMin / availMin) : '—'}</div><div class="text-xs text-ink-3">de la jornada</div></div>
      </div>
      <div class="scroll-x"><table class="w-full text-sm" style="min-width:720px"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-2 font-medium">Horario</th><th class="px-2 font-medium">Proyecto</th><th class="px-2 font-medium">Tarea</th><th class="px-2 font-medium text-right">Tiempo</th><th class="px-2 font-medium">Con</th><th class="px-2 font-medium text-center">Hecho</th><th class="px-2 pr-4 font-medium">Observaciones</th></tr></thead>
      <tbody>${rows.length ? rows.join('') : `<tr><td colspan="7" class="px-5 py-8 text-center text-sm text-ink-2">${day.hours ? 'Sin tareas programadas este día.' : 'Día no laborable.'}</td></tr>`}</tbody></table></div>
      <footer class="grid grid-cols-2 gap-6 px-5 py-5 text-xs text-ink-3"><div>Firma del operario<span class="block mt-6 border-b border-ink-3/60"></span></div><div>Firma del jefe de producción<span class="block mt-6 border-b border-ink-3/60"></span></div></footer>
    </section>`;
  });
  return controls + `<div class="space-y-6">${sheets.join('') || card('<p class="p-6 text-sm text-ink-2">Esta cuadrilla no tiene operarios asignados.</p>')}</div>`;
}

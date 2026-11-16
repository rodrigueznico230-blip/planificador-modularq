/* ---------- Cuadrillas: equipos de 3, reparto de tareas por puesto (Yamazumi) y hoja diaria ---------- */
const POS = ['A', 'B', 'C'];
const POS_LABEL = { A: 'Operario 1', B: 'Operario 2', C: 'Operario 3' };
/* Asignación: 'A'|'B'|'C' puestos de la cuadrilla, '@<id>' operario designado (de la cuadrilla o no), '*' cualquier operario habilitado */
const isSupport = x => x === '*' || (typeof x === 'string' && x[0] === '@');
const posVar = i => `var(--s${i + 1})`;
const posInk = i => `var(--s${i + 1}-ink)`;
const workerById = id => S.workers.find(w => w.id === id);
const crewName = c => c ? c.name : '';
const memberName = (c, ps) => { const w = c && workerById((c.members || [])[POS.indexOf(ps)]); return w ? w.name : POS_LABEL[ps]; };
const shortName = n => /^Operario \d$/.test(n) ? 'Op. ' + n.slice(-1) : String(n || '').split(/\s+/)[0];
function crewOf(workerId) { return (S.crews || []).find(c => (c.members || []).includes(workerId)); }
function hhm(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + ' min' : ''}`;
}

/* Carga por puesto de un modelo: cada operario del puesto dedica HH / cantidad de puestos */
function crewLoads(m) {
  const load = { A: 0, B: 0, C: 0 }, byTask = { A: [], B: [], C: [] };
  let unassigned = 0, unassignedMin = 0, total = 0, supportMin = 0;
  for (const t of m.tasks) {
    if (!t.skill) continue;
    const min = (+t.hh || 0) * 60;
    const ap = E.effPos(S, t);
    const ps = [...new Set(ap)].filter(p => POS.includes(p));
    const sup = ap.filter(isSupport);
    if (sup.length) { const share = sup.filter(x => x !== '*').length; const f = ps.length + share ? share / (ps.length + share) : 1; supportMin += min * (ps.length ? f : 1); }
    if (!ps.length) { if (!sup.length) { unassigned++; unassignedMin += min; } continue; }
    if (sup.length) { const k = ps.length + sup.filter(x => x !== '*').length; for (const p of ps) { load[p] += min / k; byTask[p].push({ t, code: t.id, name: t.name, sub: 'Estación ' + t.station + ' · con apoyo', min: min / k, share: k }); } total += min * ps.length / k; continue; }
    total += min;
    for (const p of ps) { load[p] += min / ps.length; byTask[p].push({ t, code: t.id, name: t.name, sub: 'Estación ' + t.station, min: min / ps.length, share: ps.length }); }
  }
  const max = Math.max(load.A, load.B, load.C);
  const eff = max ? total / (3 * max) : 0;
  return { load, byTask, total, max, eff, unassigned, unassignedMin, supportMin };
}

/* Reparto automático: equilibra la carga entre los 3 puestos respetando la cuadrilla mínima
   y prefiriendo el puesto cuyo operario (en la cuadrilla de referencia) tiene la especialidad. */
function autoAssign(m, refCrew) {
  const skillsOf = ps => { const w = refCrew && workerById((refCrew.members || [])[POS.indexOf(ps)]); return new Set(w ? w.skills || [] : []); };
  const crewSkills = refCrew ? new Set(POS.flatMap(ps => [...skillsOf(ps)])) : null;
  const load = { A: 0, B: 0, C: 0 };
  // tareas más largas primero para un mejor equilibrio, conservando el orden del modelo en la tabla
  const elig = m.tasks.filter(t => t.skill && !E.effPos(S, t).some(isSupport) && (!crewSkills || crewSkills.has(t.skill)));
  m.tasks.forEach(t => { if (!elig.includes(t) && !E.effPos(S, t).some(isSupport)) t.pos = stdOf(t).length ? ['0'] : []; });
  elig.slice().sort((a, b) => (+b.hh || 0) - (+a.hh || 0)).forEach(t => {
    const k = Math.min(3, Math.max(1, Math.round(+t.cmin || 1)));
    const ranked = POS.slice().sort((a, b) => (skillsOf(b).has(t.skill) - skillsOf(a).has(t.skill)) || (load[a] - load[b]) || a.localeCompare(b));
    const pick = ranked.slice(0, k).sort();
    t.pos = samePos(pick, stdOf(t)) ? [] : pick;
    pick.forEach(p => { load[p] += ((+t.hh || 0) * 60) / k; });
  });
}

/* ---------- Estándar por estación: un reparto por actividad que vale para todos los formatos ---------- */
const stdOf = t => ((S.stdPos || {})[t.station] || {})[E.normKey(t.name)] || [];
/* 'Planta' (*) es excluyente: cualquier operario habilitado. Puestos y designados se combinan entre sí. */
function togglePos(arr, p) {
  const set = new Set(arr.filter(x => x !== '0'));
  if (p === '*') return set.has('*') ? [] : ['*'];
  set.delete('*');
  set.has(p) ? set.delete(p) : set.add(p);
  return [...set].sort();
}
const samePos = (a, b) => a.length === b.length && a.every((x, i) => x === [...b].sort()[i]);
/* El estándar se arma con los formatos del catálogo; los personalizados se ajustan aparte */
const isCustom = m => /^personalizado$/i.test(String(m.type || '').trim());
const stdModels = () => S.models.filter(m => !isCustom(m));
const stName = id => (S.stations.find(x => x.id === id) || {}).name || 'Sin estación';
function timeRef() {
  const ts = S.timeStudy && S.timeStudy.items ? S.timeStudy.items : [];
  return new Map(ts.map((x, i) => [E.normKey(x.name), { ...x, idx: i }]));
}
/* Actividades de una estación reunidas de todos los formatos (misma actividad = mismo nombre) */
function stdActivities(stId, ref = timeRef()) {
  const map = new Map();
  stdModels().forEach(m => m.tasks.forEach(t => {
    if (t.station !== stId || !t.skill) return;
    const k = E.normKey(t.name);
    let a = map.get(k);
    if (!a) map.set(k, a = { k, name: t.name, models: [], mins: [], cmin: 1, skills: new Set(), first: map.size, overrides: 0 });
    if (!a.models.includes(m)) a.models.push(m);
    if (t.hh != null && t.hh !== '' && +t.hh > 0) a.mins.push(+t.hh * 60);
    a.cmin = Math.max(a.cmin, Math.min(3, Math.round(+t.cmin || 1)));
    a.skills.add(t.skill);
    if (t.pos && t.pos.length) a.overrides++;
  }));
  const std = (S.stdPos || {})[stId] || {};
  const out = [...map.values()].map(a => {
    const r = ref.get(a.k);
    if (r && r.min > 0) { a.min = r.min; a.src = 'crono'; }
    else if (a.mins.length) { a.min = a.mins.reduce((x, y) => x + y, 0) / a.mins.length; a.src = 'prom'; }
    else { a.min = 0; a.src = 'none'; }
    a.ord = r ? r.idx : 1e4 + a.first;
    a.all = (std[a.k] || []).slice();
    a.pos = a.all.filter(p => POS.includes(p));
    a.sup = a.all.filter(isSupport);
    return a;
  });
  return out.sort((x, y) => x.ord - y.ord);
}
function stdLoads(acts) {
  const load = { A: 0, B: 0, C: 0 }, byTask = { A: [], B: [], C: [] };
  let total = 0, assigned = 0, unassignedMin = 0, supportMin = 0, support = 0;
  acts.forEach((a, i) => {
    if (!a.pos.length && !a.sup.length) { unassignedMin += a.min; return; }
    assigned++;
    const named = a.sup.filter(x => x !== '*').length;
    const k = a.pos.length + named;
    if (a.sup.length) { support++; supportMin += a.pos.length ? a.min * named / k : a.min; }
    if (!a.pos.length) return;
    total += a.min * a.pos.length / k;
    a.pos.forEach(p => { load[p] += a.min / k; byTask[p].push({ code: String(i + 1), name: a.name, sub: `${a.models.length} formato${a.models.length === 1 ? '' : 's'}${named ? ' · con apoyo' : ''}`, min: a.min / k, share: k }); });
  });
  const max = Math.max(load.A, load.B, load.C);
  return { load, byTask, total, max, eff: max ? total / (3 * max) : 0, assigned, unassigned: acts.length - assigned, unassignedMin, supportMin, support };
}
function crewSkillSet(refCrew) {
  const crews = refCrew ? [refCrew] : (S.crews || []);
  const set = new Set();
  crews.forEach(c => (c.members || []).forEach(id => { const w = workerById(id); (w && w.skills || []).forEach(k => set.add(k)); }));
  return set;
}
/* Reparto automático de una estación: equilibra minutos de referencia entre los 3 puestos */
function stdAutoAssign(stId, refCrew) {
  const acts = stdActivities(stId);
  const skillsOf = ps => { const w = refCrew && workerById((refCrew.members || [])[POS.indexOf(ps)]); return new Set(w ? w.skills || [] : []); };
  const crewSkills = crewSkillSet(refCrew);
  const std = {};
  const load = { A: 0, B: 0, C: 0 };
  acts.filter(a => a.sup.length).forEach(a => { std[a.k] = a.all; }); // tareas de apoyo: se respetan
  acts.filter(a => !a.sup.length).filter(a => !crewSkills.size || [...a.skills].some(k => crewSkills.has(k)))
    .sort((a, b) => b.min - a.min || a.ord - b.ord)
    .forEach(a => {
      const has = ps => [...a.skills].some(k => skillsOf(ps).has(k));
      const ranked = POS.slice().sort((x, y) => (has(y) - has(x)) || (load[x] - load[y]) || x.localeCompare(y));
      const pick = ranked.slice(0, a.cmin).sort();
      std[a.k] = pick;
      pick.forEach(p => { load[p] += a.min / pick.length; });
    });
  S.stdPos = S.stdPos || {};
  S.stdPos[stId] = std;
  return Object.keys(std).length;
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

function yamaSvg(L, names, aria) {
  const Wc = 600, Hc = 340, ml = 52, mr = 92, mt = 20, mb = 52;
  const ymax = Math.max(L.max, 60) * 1.12;
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
      const y1 = y(acc + sgm.min), y0 = y(acc);
      const hh = Math.max(0.6, y0 - y1 - 2);
      svg += `<g ${tipAttr(`<b>${esc(sgm.code)} ${esc(sgm.name)}</b><br>${esc(names[k])}: ${hhm(sgm.min)}${sgm.share > 1 ? ` (tarea de ${sgm.share} operarios, ${hhm(sgm.min * sgm.share)} en total)` : ''}<br>${esc(sgm.sub)}`)}><rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${hh}" rx="${j === segs.length - 1 ? 4 : 1}" fill="${posVar(k)}"/>${hh > 14 ? `<text x="${cx}" y="${y1 + hh / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="${posInk(k)}">${esc(sgm.code)}</text>` : ''}</g>`;
      acc += sgm.min;
    });
    svg += `<text x="${cx}" y="${y(L.load[ps]) - 7}" text-anchor="middle" font-size="12" font-weight="600" fill="rgb(var(--ink))">${hhm(L.load[ps])}</text>`;
    svg += `<text x="${cx}" y="${Hc - mb + 20}" text-anchor="middle" font-size="12" font-weight="600" fill="rgb(var(--ink))">${esc(shortName(names[k]))}</text><text x="${cx}" y="${Hc - mb + 36}" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">${POS_LABEL[ps]}, ${segs.length} tareas</text>`;
  });
  if (L.total) {
    const avg = L.total / 3;
    svg += `<line x1="${ml}" x2="${Wc - mr + 4}" y1="${y(avg)}" y2="${y(avg)}" stroke="rgb(var(--ink-2))" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${Wc - mr + 8}" y="${y(avg) - 4}" font-size="11" font-weight="600" fill="rgb(var(--ink-2))">Carga pareja</text><text x="${Wc - mr + 8}" y="${y(avg) + 11}" font-size="11" fill="rgb(var(--ink-2))">${hhm(avg)}</text>`;
  }
  svg += `<text x="14" y="${mt + ih / 2}" transform="rotate(-90 14 ${mt + ih / 2})" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">minutos por módulo</text>`;
  return `<svg viewBox="0 0 ${Wc} ${Hc}" class="w-full" style="min-width:480px" role="img" aria-label="${esc(aria)}">${svg}</svg>`;
}
function yamaTitle(L, names) {
  if (!L.max) return 'Repartí las tareas para ver la carga de cada operario';
  if (L.eff >= 0.9) return 'La carga está pareja entre los 3 operarios';
  return `${esc(shortName(names[POS.findIndex(p => L.load[p] === L.max)]))} tiene ${hhm(L.max - L.total / 3)} más que la carga pareja`;
}
/* Barras apiladas por estación y puesto */
function stationStackSvg(perSt, names, aria, sel) {
  const maxSt = Math.max(60, ...perSt.map(o => o.tot + (o.un || 0) + (o.sup || 0))) * 1.12;
  const W2 = 600, H2 = 340, ml2 = 52, mr2 = 16, mb2 = 46, mt2 = 20, iw2 = W2 - ml2 - mr2, ih2 = H2 - mt2 - mb2;
  const y2 = v => mt2 + ih2 - v / maxSt * ih2;
  const bw2 = Math.min(48, iw2 / Math.max(1, perSt.length) * 0.6);
  let svg2 = '';
  const step2 = niceStep(maxSt / 5);
  for (let v = 0; v <= maxSt + 1e-9; v += step2) svg2 += `<line x1="${ml2}" x2="${W2 - mr2}" y1="${y2(v)}" y2="${y2(v)}" stroke="rgb(var(--line))"/><text x="${ml2 - 8}" y="${y2(v) + 4}" text-anchor="end" font-size="11" fill="rgb(var(--ink-3))">${nf0.format(v)}</text>`;
  perSt.forEach((o, i) => {
    const cx = ml2 + iw2 / perSt.length * (i + 0.5);
    if (sel && o.id === sel) svg2 += `<rect x="${cx - iw2 / perSt.length / 2 + 2}" y="${mt2}" width="${iw2 / perSt.length - 4}" height="${ih2 + 24}" rx="6" fill="rgb(var(--accent) / 0.08)"/>`;
    let acc = 0;
    POS.forEach((ps, k) => {
      if (!o[ps]) return;
      const y1 = y2(acc + o[ps]), y0 = y2(acc), hh = Math.max(0.6, y0 - y1 - 2);
      svg2 += `<rect x="${cx - bw2 / 2}" y="${y1}" width="${bw2}" height="${hh}" rx="2" fill="${posVar(k)}" ${tipAttr(`<b>${esc(o.id)} ${esc(stName(o.id))}</b><br>${esc(names[k])}: ${hhm(o[ps])}`)}/>`;
      acc += o[ps];
    });
    if (o.sup) { const y1 = y2(acc + o.sup), y0 = y2(acc); svg2 += `<rect x="${cx - bw2 / 2}" y="${y1}" width="${bw2}" height="${Math.max(0.6, y0 - y1 - 2)}" rx="2" fill="rgb(var(--ink-3) / .45)" ${tipAttr(`<b>${esc(o.id)} ${esc(stName(o.id))}</b><br>Apoyo (fuera de la cuadrilla o cualquier operario): ${hhm(o.sup)}`)}/>`; acc += o.sup; }
    if (o.un) svg2 += `<rect x="${cx - bw2 / 2}" y="${y2(acc + o.un)}" width="${bw2}" height="${Math.max(0.6, y2(acc) - y2(acc + o.un) - 2)}" rx="2" fill="none" stroke="rgb(var(--ink-3))" stroke-dasharray="3 3" ${tipAttr(`<b>${esc(o.id)} ${esc(stName(o.id))}</b><br>Sin puesto: ${hhm(o.un)}`)}/>`;
    const top = o.tot + (o.un || 0) + (o.sup || 0);
    svg2 += `<text x="${cx}" y="${y2(top) - 6}" text-anchor="middle" font-size="10.5" font-weight="600" fill="rgb(var(--ink))">${nf0.format(top)}</text><text x="${cx}" y="${H2 - mb2 + 18}" text-anchor="middle" font-size="11" font-weight="${sel && o.id === sel ? 700 : 600}" fill="rgb(var(${sel && o.id === sel ? '--accent' : '--ink'}))">${esc(o.id)}</text>`;
  });
  return `<svg viewBox="0 0 ${W2} ${H2}" class="w-full" style="min-width:480px" role="img" aria-label="${esc(aria)}">${svg2}</svg>`;
}
const posLegend = names => `<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">${POS.map((ps, k) => `<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${posVar(k)}"></span>${esc(names[k])}</span>`).join('')}<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:rgb(var(--ink-3) / .45)"></span>Apoyo</span></div>`;
const kpiCell = (l, v, n, cls = '') => `<div class="p-4"><div class="text-xs text-ink-2">${l}</div><div class="mt-1 text-xl font-semibold tracking-tight num ${cls}">${v}</div><div class="text-xs text-ink-3 mt-0.5">${n}</div></div>`;
function assignCell(arr, names, act, data, cmin, desig) {
  const cur = new Set(arr);
  const named = arr.filter(x => x[0] === '@').map(x => x.slice(1));
  const free = cur.has('*');
  const nPeople = arr.filter(x => POS.includes(x)).length + named.length;
  const chips = POS.map((p, k) => `<button data-act="${act}" ${data} data-p="${p}" aria-pressed="${cur.has(p)}" title="${esc(names[k])} (puesto de la cuadrilla)" class="pos-chip rounded-full border border-line px-2.5 py-0.5 text-xs font-medium transition-colors" style="--c:${posVar(k)};--ci:${posInk(k)}">${esc(shortName(names[k]))}</button>`).join('');
  const freeChip = `<button data-act="${act}" ${data} data-p="*" aria-pressed="${free}" title="La hace cualquier operario habilitado de la planta, sea o no de la cuadrilla del proyecto" class="pos-chip rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs font-medium transition-colors" style="--c:rgb(var(--ink-2));--ci:rgb(var(--surface))">Planta</button>`;
  const namedChips = named.map(id => { const w = workerById(id); return `<span class="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line pl-2.5 pr-1 py-0.5 text-xs font-medium ${w ? '' : 'text-bad'}" title="Operario designado: hace esta tarea en todos los proyectos, esté o no en la cuadrilla">${esc(w ? shortName(w.name) : id)}<button data-act="${act}" ${data} data-p="@${esc(id)}" class="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-line" aria-label="Quitar ${esc(w ? w.name : id)}"><svg viewBox="0 0 12 12" class="w-2.5 h-2.5" stroke="currentColor" stroke-width="1.6"><path d="M3 3l6 6M9 3l-6 6"/></svg></button></span>`; }).join('');
  const sel = `<select class="fld !py-0.5 !text-xs w-32" data-designate="${esc(desig)}" aria-label="Designar operario"><option value="">Designar…</option>${S.workers.filter(w => w.active !== false && !named.includes(w.id)).map(w => `<option value="${esc(w.id)}">${esc(w.name)}${crewOf(w.id) ? ' (' + esc(crewOf(w.id).name) + ')' : ''}</option>`).join('')}</select>`;
  const warn = nPeople && nPeople !== cmin ? `<span class="text-xs text-warn whitespace-nowrap" title="Pide ${cmin} operario(s)">pide ${cmin}</span>` : '';
  return `<div class="flex flex-wrap items-center gap-1.5">${chips}<span class="w-px h-4 bg-line mx-0.5" aria-hidden="true"></span>${freeChip}${namedChips}${sel}${warn}`;
}
const posChips = (cur, names, act, data) => `<div class="flex items-center gap-1.5">${POS.map((p, k) => `<button data-act="${act}" ${data} data-p="${p}" aria-pressed="${cur.has(p)}" title="${esc(names[k])}" class="pos-chip rounded-full border border-line px-2.5 py-0.5 text-xs font-medium transition-colors" style="--c:${posVar(k)};--ci:${posInk(k)}">${esc(shortName(names[k]))}</button>`).join('')}`;

views.cuadrillas = () => {
  S.crews = S.crews || [];
  const tab = S.ui.crewTab || 'equipos';
  const head = pageHead('Cuadrillas',
    'Equipos fijos de 3 operarios. Cada actividad de cada estación tiene su puesto (Operario 1, 2 o 3) y ese estándar vale para todos los formatos que la incluyen. Como el reparto es por puesto y no por persona, sirve igual para cualquier cuadrilla.',
    tab === 'equipos' ? btn(plus + 'Agregar cuadrilla', 'add-crew', true) : tab === 'hoja' ? btn('<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5.5 7V3.5h9V7M5.5 14H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1.5M6 11.5h8v5H6z" stroke-linejoin="round"/></svg>Imprimir hoja', 'print-sheet') : '');
  const tabs = `<div class="mb-5 no-print">${seg('crewTab', [['equipos', 'Equipos'], ['estacion', 'Estándar por estación'], ['reparto', 'Ajuste por modelo'], ['hoja', 'Hoja diaria']], tab)}</div>`;
  return head + tabs + (tab === 'estacion' ? crewStationView() : tab === 'reparto' ? crewAssignView() : tab === 'hoja' ? crewSheetView() : crewTeamsView());
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

/* ---------- Ajuste por modelo ---------- */
function crewAssignView() {
  if (!S.models.length) return card('<p class="p-8 text-center text-ink-2">Primero cargá un modelo.</p>');
  const m = S.models.find(x => x.id === S.ui.crewModel) || S.models.find(x => x.id === S.ui.model) || S.models[0];
  S.ui.crewModel = m.id;
  const ref = S.crews.find(c => c.id === S.ui.crewRef) || S.crews[0] || null;
  const L = crewLoads(m);
  const miss = m.tasks.filter(t => t.skill && (t.hh == null || t.hh === '')).length;
  const own = m.tasks.filter(t => t.skill && t.pos && t.pos.length).length;
  const names = POS.map(ps => (ref ? memberName(ref, ps) : POS_LABEL[ps]));

  const controls = `<div class="flex flex-wrap items-end gap-4 mb-4 no-print">
    <label class="text-sm text-ink-2" for="crModel">Modelo<select id="crModel" class="fld mt-1 w-80 max-w-full" data-ui="crewModel">${modelOptions(m.id)}</select></label>
    <label class="text-sm text-ink-2" for="crRef">Ver con los nombres de<select id="crRef" class="fld mt-1 w-56" data-ui="crewRef">${S.crews.length ? S.crews.map(c => `<option value="${esc(c.id)}" ${ref && c.id === ref.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">Sin cuadrillas (puestos genéricos)</option>'}</select></label>
    <div class="ml-auto flex flex-wrap gap-2">${btn('Repartir este modelo', 'auto-assign', false, `title="Equilibra la carga de este formato entre los 3 puestos. Lo que coincide con el estándar de la estación no se guarda como ajuste."`)}${btn('Volver al estándar', 'clear-assign', false, `title="Quita los ajustes propios de este modelo y usa el estándar de cada estación" ${own ? '' : 'disabled'}`)}</div></div>`;

  const kpis = card(`<div class="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
    ${kpiCell('Trabajo de la cuadrilla', hhm(L.total), `por módulo, suma de los 3 operarios${L.supportMin ? `, más ${hhm(L.supportMin)} de apoyo` : ''}`)}
    ${kpiCell('Carga del más cargado', hhm(L.max), L.max ? `${esc(names[POS.findIndex(p => L.load[p] === L.max)])}: marca el ritmo` : 'Sin reparto')}
    ${kpiCell('Eficiencia de balanceo', L.max ? pct(L.eff) : '—', 'Trabajo total ÷ (3 × carga máxima)', L.max && L.eff < 0.85 ? 'text-warn' : '')}
    ${kpiCell('Ajustes propios', String(own), own ? 'tareas que no siguen el estándar de su estación' : 'Todo sale del estándar por estación')}</div>`);

  const stIds = [...new Set(m.tasks.filter(t => t.skill).map(t => t.station))];
  const perSt = stIds.map(id => { const o = { id, A: 0, B: 0, C: 0, un: 0, sup: 0 }; POS.forEach(ps => L.byTask[ps].forEach(sg => { if (sg.t.station === id) o[ps] += sg.min; })); m.tasks.forEach(t => { if (t.station !== id || !t.skill) return; const ap = E.effPos(S, t); const mn = (+t.hh || 0) * 60; if (!ap.length) o.un += mn; else if (ap.some(isSupport)) { const c = ap.filter(x => POS.includes(x)).length, n = ap.filter(x => x[0] === '@').length; o.sup += c ? mn * n / (c + n) : mn; } }); o.tot = o.A + o.B + o.C; return o; });

  let lastSt = null;
  const rows = m.tasks.map((t, i) => {
    const grp = t.station !== lastSt ? (lastSt = t.station, `<tr class="bg-surface-2/70 border-t border-line"><td colspan="5" class="px-4 py-2"><span class="text-xs num text-ink-3 mr-3">${esc(t.station || '')}</span><span class="text-sm font-semibold">${esc(stName(t.station))}</span></td></tr>`) : '';
    const min = (+t.hh || 0) * 60;
    const eff = E.effPos(S, t);
    const ps = new Set(eff);
    const isOwn = !!(t.pos && t.pos.length);
    const cmin = Math.max(1, Math.round(+t.cmin || 1));
    const origin = isOwn ? `<span class="text-xs font-medium text-warn bg-signal-soft rounded px-1.5 py-0.5 ml-1">propio</span><button data-act="reset-pos" data-i="${i}" class="text-xs text-accent hover:underline ml-1" title="Usar el estándar de la estación">restablecer</button>` : (ps.size ? '<span class="text-xs text-ink-3 ml-1">estándar</span>' : '<span class="text-xs text-ink-3 ml-1">sin definir</span>');
    const note = !t.skill ? '<span class="text-xs text-ink-3">Espera, sin mano de obra</span>'
      : `${assignCell(eff, names, 'toggle-pos', `data-i="${i}"`, cmin, 'm:' + i)}${origin}</div>`;
    return grp + `<tr class="border-t border-line-2"><td class="pl-4 pr-2 py-2 text-xs num text-ink-3">${esc(t.id)}</td><td class="px-2 py-2">${esc(t.name)}<div class="text-xs text-ink-3">${esc(t.skill || 'Espera')}</div></td><td class="px-2 py-2 text-right num whitespace-nowrap">${t.skill ? (t.hh == null || t.hh === '' ? '<span class="text-warn">sin tiempo</span>' : nf0.format(min) + ' min') : (t.wait ? t.wait + ' h' : '—')}</td><td class="px-2 py-2 text-right num">${t.skill ? cmin : '—'}</td><td class="px-2 pr-4 py-2">${note}</td></tr>`;
  }).join('');

  const missNote = miss ? `<div class="mb-4 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm">Este modelo tiene <b>${miss} tareas sin tiempo</b>: no suman carga en el diagrama. <a href="#modelos" class="font-medium text-accent hover:underline">Cargar tiempos</a></div>` : '';
  return controls + `<p class="mb-4 text-sm text-ink-2 max-w-3xl leading-relaxed no-print">Cada tarea toma el puesto definido en <button data-act="crew-tab" data-t="estacion" class="font-medium text-accent hover:underline">Estándar por estación</button>. Acá ves cómo queda la carga en un formato puntual y, si hace falta, lo ajustás solo para este modelo.</p>` + missNote + `<div class="space-y-6">${kpis}
    <div class="grid xl:grid-cols-2 gap-6 items-start">
    ${card(`<div class="px-5 pt-4"><h2 class="text-base font-semibold">${yamaTitle(L, names)}</h2><p class="text-xs text-ink-3 mt-0.5">Yamazumi por operario: minutos que cada uno dedica a un módulo de ${esc(m.name)}. Las tareas de 2 o 3 operarios se dividen entre ellos.</p></div><div class="scroll-x px-3 pb-3">${yamaSvg(L, names, 'Carga por operario del modelo ' + m.name)}</div>`)}
    ${card(`<div class="px-5 pt-4 flex flex-wrap items-baseline justify-between gap-2"><div><h2 class="text-base font-semibold">Cuadrilla por estación</h2><p class="text-xs text-ink-3 mt-0.5">Minutos por estación y operario. En línea punteada, lo que queda sin puesto.</p></div>${posLegend(names)}</div><div class="scroll-x px-3 pb-3">${perSt.length ? stationStackSvg(perSt, names, 'Minutos de la cuadrilla por estación') : '<p class="p-6 text-sm text-ink-3">Sin tareas.</p>'}</div>`)}
    </div>
    ${card(`<div class="px-5 pt-4 pb-2"><h2 class="text-base font-semibold">Puestos por tarea</h2><p class="text-xs text-ink-3 mt-0.5">Tocá un nombre para sumarlo o quitarlo solo en este modelo. Las tareas sin puesto las hace el resto de la planta según su especialidad.</p></div>
      <div class="scroll-x"><table class="w-full text-sm" style="min-width:980px"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-2 font-medium">Código</th><th class="px-2 font-medium">Tarea</th><th class="px-2 font-medium text-right">Tiempo</th><th class="px-2 font-medium text-right" title="Operarios que pide el modelo">Oper.</th><th class="px-2 pr-4 font-medium">Quién la hace</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
    </div>`;
}

/* ---------- Estándar por estación ---------- */
function crewStationView() {
  const ref = S.crews.find(c => c.id === S.ui.crewRef) || S.crews[0] || null;
  const names = POS.map(ps => (ref ? memberName(ref, ps) : POS_LABEL[ps]));
  const tr = timeRef();
  const all = S.stations.map(s => ({ s, acts: stdActivities(s.id, tr) })).filter(x => x.acts.length);
  if (!all.length) return card('<p class="p-8 text-center text-ink-2">Ningún modelo tiene tareas con estación asignada.</p>');
  const cur = all.find(x => x.s.id === S.ui.stdStation) || all[0];
  S.ui.stdStation = cur.s.id;
  const acts = cur.acts;
  const L = stdLoads(acts);
  const summary = all.map(x => { const l = stdLoads(x.acts); return { id: x.s.id, A: l.load.A, B: l.load.B, C: l.load.C, tot: l.total, un: l.unassignedMin, sup: l.supportMin, n: x.acts.length, done: l.assigned }; });
  const totActs = summary.reduce((a, o) => a + o.n, 0), totDone = summary.reduce((a, o) => a + o.done, 0);
  const gl = { A: 0, B: 0, C: 0 }; summary.forEach(o => POS.forEach(p => { gl[p] += o[p]; }));
  const glTot = gl.A + gl.B + gl.C, glMax = Math.max(gl.A, gl.B, gl.C);

  // tiempos faltantes que el cronometraje puede completar
  let fillable = 0;
  S.models.forEach(m => m.tasks.forEach(t => { if (t.skill && (t.hh == null || t.hh === '')) { const r = tr.get(E.normKey(t.name)); if (r && r.min > 0) fillable++; } }));
  const ts = S.timeStudy;
  const measured = ts ? ts.items.filter(x => x.min > 0).length : 0;
  const srcNote = ts ? `<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-line bg-surface px-4 py-3 text-sm">
      <svg viewBox="0 0 20 20" class="w-5 h-5 text-accent shrink-0" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="11" r="6.5"/><path d="M10 7.5V11l2.5 1.5M8 2.5h4" stroke-linecap="round"/></svg>
      <div class="flex-1 min-w-64"><b class="font-semibold">Tiempos de referencia:</b> ${esc(ts.source)} (${measured} actividades medidas${ts.date ? ', ' + esc(ts.date) : ''}). Las actividades sin medición usan el promedio de los formatos que tienen tiempo.</div>
      ${fillable ? btn(`Completar ${fillable} tiempos faltantes en los modelos`, 'std-fill-times', false, 'title="Copia el tiempo cronometrado solo a las tareas que todavía no tienen tiempo. No pisa tiempos cargados."') : '<span class="text-xs text-ink-3">Los modelos no tienen tiempos faltantes que se puedan completar con el cronometraje.</span>'}</div>` : '';

  const stOpts = all.map(x => { const o = summary.find(z => z.id === x.s.id); return `<option value="${esc(x.s.id)}" ${x === cur ? 'selected' : ''}>${esc(x.s.id)} · ${esc(x.s.name)} (${o.done}/${o.n})</option>`; }).join('');
  const controls = `<div class="flex flex-wrap items-end gap-4 mb-4 no-print">
    <label class="text-sm text-ink-2" for="stdSt">Estación<select id="stdSt" class="fld mt-1 w-80 max-w-full" data-ui="stdStation">${stOpts}</select></label>
    <label class="text-sm text-ink-2" for="stdRef">Ver con los nombres de<select id="stdRef" class="fld mt-1 w-56" data-ui="crewRef">${S.crews.length ? S.crews.map(c => `<option value="${esc(c.id)}" ${ref && c.id === ref.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">Sin cuadrillas (puestos genéricos)</option>'}</select></label>
    <div class="ml-auto flex flex-wrap gap-2">${btn('Repartir esta estación', 'std-auto', true, 'title="Equilibra los minutos de referencia entre los 3 puestos, respeta la cantidad de operarios que pide cada actividad y prioriza al operario con la especialidad."')}${btn('Repartir todas', 'std-auto-all', false, 'title="Aplica el reparto automático a todas las estaciones. Se puede deshacer."')}${btn('Quitar reparto', 'std-clear', false, L.assigned ? '' : 'disabled')}</div></div>`;

  const kpis = card(`<div class="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
    ${kpiCell('Actividades de la estación', String(acts.length), `reunidas de ${new Set(acts.flatMap(a => a.models)).size} formatos`)}
    ${kpiCell('Trabajo de la cuadrilla', hhm(L.total), L.supportMin ? `más ${hhm(L.supportMin)} de apoyo en ${L.support} actividad${L.support === 1 ? '' : 'es'}` : 'por módulo de referencia')}
    ${kpiCell('Eficiencia de balanceo', L.max ? pct(L.eff) : '—', 'Trabajo total ÷ (3 × carga máxima)', L.max && L.eff < 0.85 ? 'text-warn' : '')}
    ${kpiCell('Cobertura total', pct(totActs ? totDone / totActs : 0), `${totDone} de ${totActs} actividades de todas las estaciones con puesto`, totDone < totActs ? '' : 'text-accent')}</div>`);

  const srcPill = a => a.src === 'crono' ? '<span class="text-[11px] font-medium rounded px-1.5 py-0.5 bg-accent/10 text-accent" title="Tiempo cronometrado">crono</span>'
    : a.src === 'prom' ? `<span class="text-[11px] font-medium rounded px-1.5 py-0.5 bg-surface-2 text-ink-2" title="Promedio de ${a.mins.length} formato(s) con tiempo cargado">prom.</span>`
    : '<span class="text-[11px] font-medium rounded px-1.5 py-0.5 bg-warn-soft text-warn" title="Ningún formato tiene tiempo para esta actividad">sin tiempo</span>';
  const rows = acts.map((a, i) => {
    const ps = new Set(a.pos);
    const mList = a.models.map(m => m.name);
    return `<tr class="border-t border-line-2 align-top"><td class="pl-4 pr-2 py-2.5 text-xs num text-ink-3">${i + 1}</td>
      <td class="px-2 py-2.5">${esc(a.name)}<div class="text-xs text-ink-3">${esc([...a.skills].join(', '))}${a.overrides ? ` · <span class="text-warn">${a.overrides} ajuste${a.overrides === 1 ? '' : 's'} propio${a.overrides === 1 ? '' : 's'} en modelos</span>` : ''}</div></td>
      <td class="px-2 py-2.5"><span class="num font-medium" ${tipAttr(`<b>Formatos que incluyen la actividad</b><br>${mList.map(esc).join('<br>')}`)}>${a.models.length}</span></td>
      <td class="px-2 py-2.5 text-right whitespace-nowrap"><span class="num">${a.min ? nf0.format(a.min) + ' min' : '—'}</span> ${srcPill(a)}</td>
      <td class="px-2 py-2.5 text-right num">${a.cmin}</td>
      <td class="px-2 pr-4 py-2.5">${assignCell(a.all, names, 'toggle-std', `data-k="${esc(a.k)}"`, a.cmin, 's:' + a.k)}${!a.all.length ? '<span class="text-xs text-ink-3 ml-1">sin definir</span>' : ''}</div></td></tr>`;
  }).join('');

  const glNote = glTot ? `<span class="text-xs text-ink-3">Plantilla completa: ${POS.map((p, k) => `${esc(shortName(names[k]))} ${hhm(gl[p])}`).join(' · ')} · eficiencia ${pct(glTot / (3 * glMax))}</span>` : '';
  return controls + `<p class="mb-4 text-sm text-ink-2 max-w-3xl leading-relaxed">Elegí una estación y asigná cada actividad a un puesto. La asignación se aplica a <b>todos los formatos</b> que tienen esa actividad en esa estación (se reconocen por el nombre), y el programa la usa en cada proyecto con cuadrilla.${S.models.some(isCustom) ? ` Los formatos personalizados (${S.models.filter(isCustom).map(m => esc(m.name)).join(', ')}) no forman parte del estándar: toman el puesto de las actividades que coinciden y el resto se ajusta en <button data-act="crew-tab" data-t="reparto" class="font-medium text-accent hover:underline">Ajuste por modelo</button>.` : ''}</p>
    <div class="mb-4 grid sm:grid-cols-3 gap-3 text-xs text-ink-2 max-w-4xl">
      <div class="rounded-md border border-line bg-surface px-3 py-2"><b class="text-ink">Operario 1, 2 o 3</b>: la hace ese puesto de la cuadrilla asignada al proyecto o lote.</div>
      <div class="rounded-md border border-line bg-surface px-3 py-2"><b class="text-ink">Planta</b>: la hace cualquier operario habilitado, sea o no de la cuadrilla. Útil para subconjuntos y pintura que se adelantan.</div>
      <div class="rounded-md border border-line bg-surface px-3 py-2"><b class="text-ink">Designar</b>: siempre la hace esa persona, en cualquier proyecto. Se puede combinar con un puesto de la cuadrilla.</div>
    </div>` + srcNote + `<div class="space-y-6">${kpis}
    <div class="grid xl:grid-cols-2 gap-6 items-start">
    ${card(`<div class="px-5 pt-4"><div class="text-xs font-medium text-ink-3"><span class="num">${esc(cur.s.id)}</span> · ${esc(cur.s.name)}</div><h2 class="text-base font-semibold mt-0.5">${yamaTitle(L, names)}</h2><p class="text-xs text-ink-3 mt-0.5">Yamazumi por operario con los tiempos de referencia de la estación, por módulo.</p></div><div class="scroll-x px-3 pb-3">${yamaSvg(L, names, 'Carga por operario en la estación ' + cur.s.name)}</div>`)}
    ${card(`<div class="px-5 pt-4 flex flex-wrap items-baseline justify-between gap-2"><div><h2 class="text-base font-semibold">Plantilla estándar por estación</h2><p class="text-xs text-ink-3 mt-0.5">Minutos de referencia por puesto. En línea punteada, lo que todavía no tiene puesto.</p></div>${posLegend(names)}</div><div class="scroll-x px-3 pb-1">${stationStackSvg(summary, names, 'Plantilla estándar por estación', cur.s.id)}</div><div class="px-5 pb-4">${glNote}</div>`)}
    </div>
    ${card(`<div class="px-5 pt-4 pb-2"><h2 class="text-base font-semibold">Actividades de ${esc(cur.s.name)}</h2><p class="text-xs text-ink-3 mt-0.5">Tocá un nombre para sumarlo o quitarlo. Pasá el cursor por la cantidad de formatos para ver cuáles son.</p></div>
      <div class="scroll-x"><table class="w-full text-sm" style="min-width:1040px"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-2 font-medium">#</th><th class="px-2 font-medium">Actividad</th><th class="px-2 font-medium">Formatos</th><th class="px-2 font-medium text-right">Tiempo ref.</th><th class="px-2 font-medium text-right" title="Máximo de operarios que pide la actividad entre los formatos">Oper.</th><th class="px-2 pr-4 font-medium">Quién la hace</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
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
    const posOf = (task) => { const c = S.crews.find(cc => cc.id === task.unit.crew); if (!c) return ''; const k = (c.members || []).indexOf(w.id); return k >= 0 ? POS_LABEL[POS[k]] : 'apoyo a ' + c.name; };
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

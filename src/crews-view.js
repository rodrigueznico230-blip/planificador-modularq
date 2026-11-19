/* ---------- Cuadrillas: equipos de N operarios (2 a 6), reparto de tareas por puesto (Yamazumi) y hoja diaria ---------- */
const ALL_POS = ['A', 'B', 'C', 'D', 'E', 'F'];
const POS_LABEL = Object.fromEntries(ALL_POS.map((p, i) => [p, 'Operario ' + (i + 1)]));
const crewSize = () => Math.min(6, Math.max(2, Math.round(+S.crewSize || 3)));
let POS = ALL_POS.slice(0, 3);
/* Ajusta los puestos activos a la cantidad de operarios por cuadrilla del plan */
function syncPos() { POS = ALL_POS.slice(0, crewSize()); return POS; }
const zeroPos = () => Object.fromEntries(POS.map(p => [p, 0]));
const maxLoad = load => Math.max(0, ...POS.map(p => load[p] || 0));
const supervisor = () => workerById(S.crewSupervisor);
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
  syncPos();
  const load = zeroPos(), byTask = Object.fromEntries(POS.map(p => [p, []]));
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
  const max = maxLoad(load);
  const eff = max ? total / (POS.length * max) : 0;
  return { load, byTask, total, max, eff, unassigned, unassignedMin, supportMin };
}

/* Reparto automático: equilibra la carga entre los puestos respetando la cuadrilla mínima
   y prefiriendo el puesto cuyo operario (en la cuadrilla de referencia) tiene la especialidad. */
function autoAssign(m, refCrew) {
  const skillsOf = ps => { const w = refCrew && workerById((refCrew.members || [])[POS.indexOf(ps)]); return new Set(w ? w.skills || [] : []); };
  syncPos();
  const crewSkills = refCrew ? new Set(POS.flatMap(ps => [...skillsOf(ps)])) : null;
  const load = zeroPos();
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
  syncPos();
  const map = new Map();
  stdModels().forEach(m => m.tasks.forEach(t => {
    if (t.station !== stId || !t.skill) return;
    const k = E.normKey(t.name);
    let a = map.get(k);
    if (!a) map.set(k, a = { k, name: t.name, models: [], mins: [], cmin: 1, skills: new Set(), first: map.size, overrides: 0 });
    if (!a.models.includes(m)) a.models.push(m);
    if (t.hh != null && t.hh !== '' && +t.hh > 0) a.mins.push(+t.hh * 60);
    a.cmin = Math.max(a.cmin, Math.min(POS.length, Math.round(+t.cmin || 1)));
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
  const load = zeroPos(), byTask = Object.fromEntries(POS.map(p => [p, []]));
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
  const max = maxLoad(load);
  return { load, byTask, total, max, eff: max ? total / (POS.length * max) : 0, assigned, unassigned: acts.length - assigned, unassignedMin, supportMin, support };
}
function crewSkillSet(refCrew) {
  const crews = refCrew ? [refCrew] : (S.crews || []);
  const set = new Set();
  crews.forEach(c => (c.members || []).forEach(id => { const w = workerById(id); (w && w.skills || []).forEach(k => set.add(k)); }));
  return set;
}
/* Reparto automático de una estación: equilibra minutos de referencia entre los puestos */
function stdAutoAssign(stId, refCrew) {
  const acts = stdActivities(stId);
  const skillsOf = ps => { const w = refCrew && workerById((refCrew.members || [])[POS.indexOf(ps)]); return new Set(w ? w.skills || [] : []); };
  const crewSkills = crewSkillSet(refCrew);
  syncPos();
  const std = {};
  const load = zeroPos();
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
  const iw = Wc - ml - mr, ih = Hc - mt - mb, bw = Math.min(104, iw / POS.length * 0.72);
  const y = v => mt + ih - v / ymax * ih;
  let svg = '';
  for (let v = 0; v <= ymax + 1e-9; v += stepY) svg += `<line x1="${ml}" x2="${Wc - mr}" y1="${y(v)}" y2="${y(v)}" stroke="rgb(var(--line))"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="rgb(var(--ink-3))">${nf0.format(v)}</text>`;
  POS.forEach((ps, k) => {
    const cx = ml + iw / POS.length * (k + 0.5);
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
    const avg = L.total / POS.length;
    svg += `<line x1="${ml}" x2="${Wc - mr + 4}" y1="${y(avg)}" y2="${y(avg)}" stroke="rgb(var(--ink-2))" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${Wc - mr + 8}" y="${y(avg) - 4}" font-size="11" font-weight="600" fill="rgb(var(--ink-2))">Carga pareja</text><text x="${Wc - mr + 8}" y="${y(avg) + 11}" font-size="11" fill="rgb(var(--ink-2))">${hhm(avg)}</text>`;
  }
  svg += `<text x="14" y="${mt + ih / 2}" transform="rotate(-90 14 ${mt + ih / 2})" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">minutos por módulo</text>`;
  return `<svg viewBox="0 0 ${Wc} ${Hc}" class="w-full" style="min-width:480px" role="img" aria-label="${esc(aria)}">${svg}</svg>`;
}
function yamaTitle(L, names) {
  if (!L.max) return 'Repartí las tareas para ver la carga de cada operario';
  if (L.eff >= 0.9) return `La carga está pareja entre los ${POS.length} operarios`;
  return `${esc(shortName(names[POS.findIndex(p => L.load[p] === L.max)]))} tiene ${hhm(L.max - L.total / POS.length)} más que la carga pareja`;
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
  syncPos();
  const tab = S.ui.crewTab || 'equipos';
  const head = pageHead('Cuadrillas',
    `Equipos fijos de ${POS.length} operarios${supervisor() ? `, con ${esc(supervisor().name.replace(/\s*\(.*\)\s*$/, ''))} como supervisor de producción` : ''}. Cada actividad de cada estación tiene su puesto (Operario 1 a ${POS.length}) y ese estándar vale para todos los formatos que la incluyen. Como el reparto es por puesto y no por persona, sirve igual para cualquier cuadrilla.`,
    tab === 'equipos' ? btn(plus + 'Agregar cuadrilla', 'add-crew', true) : tab === 'hoja' && sheetPrintable() ? btn('<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5.5 7V3.5h9V7M5.5 14H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1.5M6 11.5h8v5H6z" stroke-linejoin="round"/></svg>Imprimir hoja', 'print-sheet') : '');
  const tabs = `<div class="mb-5 no-print">${seg('crewTab', [['equipos', 'Equipos'], ['estacion', 'Estándar por estación'], ['reparto', 'Ajuste por modelo'], ['hoja', 'Hoja diaria']], tab)}</div>`;
  return head + tabs + (tab === 'estacion' ? crewStationView() : tab === 'reparto' ? crewAssignView() : tab === 'hoja' ? crewSheetView() : crewTeamsView());
};

/* ---------- Equipos ---------- */
function crewSettings() {
  const sup = supervisor();
  const inCrew = sup && crewOf(sup.id);
  return card(`<div class="p-5 grid gap-5 md:grid-cols-[auto_1fr] items-start">
    <label class="text-sm text-ink-2" for="crSize">Operarios por cuadrilla<select id="crSize" class="fld mt-1 w-40" data-crewsize>${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === POS.length ? 'selected' : ''}>${n} operarios</option>`).join('')}</select><span class="block mt-1 text-xs text-ink-3">Vale para todas las cuadrillas</span></label>
    <div class="grid sm:grid-cols-[minmax(0,18rem)_1fr] gap-4 items-start">
      <label class="text-sm text-ink-2" for="crSup">Supervisor de producción<select id="crSup" class="fld mt-1 ${inCrew ? 'invalid' : ''}" data-path="crewSupervisor" data-rerender><option value="">Sin supervisor</option>${S.workers.filter(w => w.active !== false).map(w => `<option value="${esc(w.id)}" ${w.id === S.crewSupervisor ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>${inCrew ? `<span class="block mt-1 text-xs text-bad">También figura en ${esc(inCrew.name)}: quitalo de la cuadrilla.</span>` : ''}</label>
      <p class="text-xs text-ink-3 leading-relaxed sm:pt-6">Coordina a todas las cuadrillas, no ocupa un puesto y firma las hojas diarias. Sigue disponible en el programa para las tareas de su especialidad (por ejemplo, controles de calidad).</p>
    </div></div>`);
}
function crewTeamsView() {
  if (!S.crews.length) {
    return card(`<div class="p-10 text-center"><h2 class="text-lg font-semibold">Todavía no hay cuadrillas</h2><p class="mt-2 text-sm text-ink-2 max-w-md mx-auto leading-relaxed">Elegí cuántos operarios tiene cada cuadrilla, creá las cuadrillas con sus integrantes y asignalas a los proyectos en la sección Proyectos. Después repartí las tareas de cada estación entre los puestos.</p><div class="mt-5">${btn(plus + 'Crear la primera cuadrilla', 'add-crew', true)}</div></div>`) + `<div class="mt-6">${crewSettings()}</div>`;
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
      ${supervisor() ? `<div class="mt-2 flex items-center gap-2 text-xs text-ink-2"><svg viewBox="0 0 20 20" class="w-4 h-4 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="6.5" r="3"/><path d="M4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" stroke-linecap="round"/></svg>Supervisor: <b class="font-medium text-ink">${esc(supervisor().name)}</b></div>` : ''}
      <div class="mt-3">${members}</div>
      <div class="mt-4 grid grid-cols-3 gap-3 rounded-md bg-surface-2 p-3 text-center">
        <div><div class="text-lg font-semibold num">${utils.length ? pct(avgU) : '—'}</div><div class="text-xs text-ink-3">uso promedio</div></div>
        <div ${tipAttr('Diferencia entre el operario más cargado y el menos cargado. Cuanto menor, más parejo está repartido el trabajo.')}><div class="text-lg font-semibold num ${spread > 0.2 ? 'text-warn' : ''}">${utils.length > 1 ? Math.round(spread * 100) + ' pts' : '—'}</div><div class="text-xs text-ink-3">desbalance</div></div>
        <div><div class="text-lg font-semibold num">${units}</div><div class="text-xs text-ink-3">módulos a cargo</div></div>
      </div>
      <div class="mt-4"><div class="text-xs font-medium text-ink-3 mb-1.5">Proyectos asignados</div>${projs.length ? `<div class="flex flex-wrap gap-1.5">${projs.map(p => { const pi = S.projects.indexOf(p); return `<span class="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">${swatch(pi, 'w-2 h-2')}${esc(p.name)}${(p.crews || []).length > 1 ? ` <span class="text-ink-3">lote ${(p.crews || []).indexOf(c.id) + 1} de ${(p.crews || []).length}</span>` : ''}</span>`; }).join('')}</div>` : '<p class="text-sm text-ink-3">Ninguno. Asignala desde <a class="text-accent font-medium hover:underline" href="#proyectos">Proyectos</a>.</p>'}</div>
    </div>`);
  }).join('');
  return `<div class="mb-6">${crewSettings()}</div><div class="grid md:grid-cols-2 2xl:grid-cols-3 gap-6 items-start">${cards}</div>
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
    <div class="ml-auto flex flex-wrap gap-2">${btn('Repartir este modelo', 'auto-assign', false, `title="Equilibra la carga de este formato entre los ${POS.length} puestos. Lo que coincide con el estándar de la estación no se guarda como ajuste."`)}${btn('Volver al estándar', 'clear-assign', false, `title="Quita los ajustes propios de este modelo y usa el estándar de cada estación" ${own ? '' : 'disabled'}`)}</div></div>`;

  const kpis = card(`<div class="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
    ${kpiCell('Trabajo de la cuadrilla', hhm(L.total), `por módulo, suma de los ${POS.length} operarios${L.supportMin ? `, más ${hhm(L.supportMin)} de apoyo` : ''}`)}
    ${kpiCell('Carga del más cargado', hhm(L.max), L.max ? `${esc(names[POS.findIndex(p => L.load[p] === L.max)])}: marca el ritmo` : 'Sin reparto')}
    ${kpiCell('Eficiencia de balanceo', L.max ? pct(L.eff) : '—', `Trabajo total ÷ (${POS.length} × carga máxima)`, L.max && L.eff < 0.85 ? 'text-warn' : '')}
    ${kpiCell('Ajustes propios', String(own), own ? 'tareas que no siguen el estándar de su estación' : 'Todo sale del estándar por estación')}</div>`);

  const stIds = [...new Set(m.tasks.filter(t => t.skill).map(t => t.station))];
  const perSt = stIds.map(id => { const o = { id, ...zeroPos(), un: 0, sup: 0 }; POS.forEach(ps => L.byTask[ps].forEach(sg => { if (sg.t.station === id) o[ps] += sg.min; })); m.tasks.forEach(t => { if (t.station !== id || !t.skill) return; const ap = E.effPos(S, t); const mn = (+t.hh || 0) * 60; if (!ap.length) o.un += mn; else if (ap.some(isSupport)) { const c = ap.filter(x => POS.includes(x)).length, n = ap.filter(x => x[0] === '@').length; o.sup += c ? mn * n / (c + n) : mn; } }); o.tot = POS.reduce((a, p) => a + o[p], 0); return o; });

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
    ${card(`<div class="px-5 pt-4"><h2 class="text-base font-semibold">${yamaTitle(L, names)}</h2><p class="text-xs text-ink-3 mt-0.5">Yamazumi por operario: minutos que cada uno dedica a un módulo de ${esc(m.name)}. Las tareas de varios operarios se dividen entre ellos.</p></div><div class="scroll-x px-3 pb-3">${yamaSvg(L, names, 'Carga por operario del modelo ' + m.name)}</div>`)}
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
  const summary = all.map(x => { const l = stdLoads(x.acts); return { id: x.s.id, ...l.load, tot: l.total, un: l.unassignedMin, sup: l.supportMin, n: x.acts.length, done: l.assigned }; });
  const totActs = summary.reduce((a, o) => a + o.n, 0), totDone = summary.reduce((a, o) => a + o.done, 0);
  const gl = zeroPos(); summary.forEach(o => POS.forEach(p => { gl[p] += o[p]; }));
  const glTot = POS.reduce((a, p) => a + gl[p], 0), glMax = maxLoad(gl);

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
    <div class="ml-auto flex flex-wrap gap-2">${btn('Repartir esta estación', 'std-auto', true, `title="Equilibra los minutos de referencia entre los ${POS.length} puestos, respeta la cantidad de operarios que pide cada actividad y prioriza al operario con la especialidad."`)}${btn('Repartir todas', 'std-auto-all', false, 'title="Aplica el reparto automático a todas las estaciones. Se puede deshacer."')}${btn('Quitar reparto', 'std-clear', false, L.assigned ? '' : 'disabled')}</div></div>`;

  const kpis = card(`<div class="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
    ${kpiCell('Actividades de la estación', String(acts.length), `reunidas de ${new Set(acts.flatMap(a => a.models)).size} formatos`)}
    ${kpiCell('Trabajo de la cuadrilla', hhm(L.total), L.supportMin ? `más ${hhm(L.supportMin)} de apoyo en ${L.support} actividad${L.support === 1 ? '' : 'es'}` : 'por módulo de referencia')}
    ${kpiCell('Eficiencia de balanceo', L.max ? pct(L.eff) : '—', `Trabajo total ÷ (${POS.length} × carga máxima)`, L.max && L.eff < 0.85 ? 'text-warn' : '')}
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

  const glNote = glTot ? `<span class="text-xs text-ink-3">Plantilla completa: ${POS.map((p, k) => `${esc(shortName(names[k]))} ${hhm(gl[p])}`).join(' · ')} · eficiencia ${pct(glTot / (POS.length * glMax))}</span>` : '';
  return controls + `<p class="mb-4 text-sm text-ink-2 max-w-3xl leading-relaxed">Elegí una estación y asigná cada actividad a un puesto. La asignación se aplica a <b>todos los formatos</b> que tienen esa actividad en esa estación (se reconocen por el nombre), y el programa la usa en cada proyecto con cuadrilla.${S.models.some(isCustom) ? ` Los formatos personalizados (${S.models.filter(isCustom).map(m => esc(m.name)).join(', ')}) no forman parte del estándar: toman el puesto de las actividades que coinciden y el resto se ajusta en <button data-act="crew-tab" data-t="reparto" class="font-medium text-accent hover:underline">Ajuste por modelo</button>.` : ''}</p>
    <div class="mb-4 grid sm:grid-cols-3 gap-3 text-xs text-ink-2 max-w-4xl">
      <div class="rounded-md border border-line bg-surface px-3 py-2"><b class="text-ink">Operario 1 a ${POS.length}</b>: la hace ese puesto de la cuadrilla asignada al proyecto o lote.</div>
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
/* ---------- Hoja de procedimiento diario (formato MQ-REG-HPD_01, basado en MQ-REG-LIB_01) ---------- */
const MQ_LOGO = 'data:image/png;base64,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';
const PLANT_ADDRESS = 'MODULARQ - MAURIN 6688, DEPARTAMENTO POCITO, PROVINCIA DE SAN JUAN - ARGENTINA';
const plainName = n => String(n || '').replace(/\s*\(.*\)\s*$/, '').trim();
const fDate = iso => { const [y, m, d] = String(iso).split('-'); return d ? `${d}/${m}/${y}` : ''; };
/* Código de ítem por módulo: MQ-SI-SAN_01 → MOD-SI-SAN_01, _02… Sin código, nombre del proyecto y módulo */
function moduleItem(p, n) {
  const code = String(p.code || '').trim();
  if (!code) return `${p.name} · Mód. ${n}`;
  return `MOD-${code.replace(/^MQ-/i, '').replace(/_\d+$/, '')}_${String(n).padStart(2, '0')}`;
}
/* Checklist digital de la hoja diaria: S.checks[fecha][operario] = { t: { clave: { s: 'ok'|'no', m: motivo, min, name, proj } }, obs } */
const MOTIVOS = ['Falta de material', 'Espera de tarea anterior', 'Retrabajo o corrección', 'Falla de equipo o herramienta', 'Ausencia o reasignación', 'Tiempo insuficiente', 'Otro'];
const chkRec = (date, wid) => ((S.checks || {})[date] || {})[wid] || null;
function realizadoCell(r) {
  if (!r || !r.check) return '<span class="doc-box" aria-hidden="true"></span>';
  const c = r.check, st = c.state;
  const mark = st === 'ok' ? '✓' : st === 'no' ? '✗' : '';
  const b = (val, label, icon) => `<button data-act="chk" data-d="${esc(c.date)}" data-w="${esc(c.wid)}" data-k="${esc(c.key)}" data-s="${val}" aria-pressed="${st === val}" class="chk-btn chk-${val}" title="${label}">${icon}</button>`;
  return `<span class="doc-box doc-print">${mark}</span><div class="no-print chk-wrap">${b('ok', 'Realizada', '<svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round"/></svg>')}${b('no', 'No realizada', '<svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke-linecap="round"/></svg>')}</div>${st === 'no' ? `<select class="no-print chk-mot" data-chkmot="${esc(c.date)}|${esc(c.wid)}|${esc(c.key)}" aria-label="Motivo"><option value="">Motivo…</option>${MOTIVOS.map(m => `<option ${m === c.motivo ? 'selected' : ''}>${m}</option>`).join('')}</select>${c.motivo ? `<span class="doc-sub doc-print">${esc(c.motivo)}</span>` : ''}` : ''}`;
}

/* Datos de la tarea marcada (minutos programados ese día) para guardarlos junto con la marca */
function sheetSegInfo(dayIso, wid, key) {
  const di = R.cal.days.findIndex(d => d.iso === dayIso), wi = R.workers.findIndex(w => w.id === wid);
  if (di < 0 || wi < 0) return { min: 0 };
  const sg = workerDaySegs(wi, di).filter(x => `${x.task.unit.key}|${x.task.tpl.id}` === key);
  return sg.length ? { min: sg.reduce((a, x) => a + (x.e - x.s) * 60 / R.cal.Q, 0), name: sg[0].task.tpl.name, proj: sg[0].task.unit.project.name } : { min: 0 };
}

/* Documento imprimible: misma estructura y estilo que el registro de liberación */
function docSheet(o) {
  const rows = o.rows.slice();
  while (rows.length < (o.minRows || 6)) rows.push(null);
  const sign = (who, logo, cli, name) => `<td class="doc-sign-who ${o.sigFirst === who ? '' : ''}">${logo ? `<img src="${MQ_LOGO}" alt="ModulArq">` : `<span class="doc-cli">${esc(cli || 'Cliente')}</span>`}<b>${who}</b></td><td class="doc-sign-lines"><div>Firma:</div><div>Aclaración: ${esc(name || '')}</div><div>Fecha:</div></td>`;
  return `<section class="doc">
    <table class="doc-t">
      <colgroup><col style="width:24%"><col style="width:24%"><col style="width:12%"><col style="width:20%"><col style="width:20%"></colgroup>
      <tr class="doc-head"><td class="doc-logo"><img src="${MQ_LOGO}" alt="ModulArq"></td><td colspan="3" class="doc-title">${esc(o.title || 'Hoja de Procedimiento Diario')}</td><td class="doc-code">MQ-REG-HPD_01</td></tr>
      <tr class="doc-bar"><td colspan="5">Información General</td></tr>
      <tr><td>Proyecto:</td><td colspan="2">${esc(o.proyecto)}</td><td class="doc-c">CLIENTE:</td><td>${esc(o.cliente || '—')}</td></tr>
      <tr><td>Operario:</td><td colspan="2">${esc(o.operario)}</td><td class="doc-c">Supervisor:</td><td>${esc(o.supervisor || '—')}</td></tr>
      <tr><td>Planta:</td><td colspan="2">${PLANT_ADDRESS}</td><td class="doc-c">Fecha:</td><td class="doc-c">${o.fecha ? esc(o.fecha) : '<span class="doc-blank">____ / ____ / ________</span>'}${o.fechaSub ? `<span class="doc-sub">${esc(o.fechaSub)}</span>` : ''}</td></tr>
    </table>
    <table class="doc-t doc-join">
      <colgroup><col style="width:24%"><col style="width:56%"><col style="width:20%"></colgroup>
      <tr class="doc-bar"><td colspan="3">${esc(o.rowsTitle || 'Descripción de las Tareas del Día')}</td></tr>
      <tr><td class="doc-c">Item</td><td class="doc-c">Descripción</td><td class="doc-c">Realizado</td></tr>
      ${rows.map(r => r ? `<tr class="doc-row ${r.check && r.check.state ? 'is-' + r.check.state : ''}"><td>${esc(r.item)}</td><td>${esc(r.desc)}${r.sub ? `<span class="doc-sub">${esc(r.sub)}</span>` : ''}</td><td class="doc-c">${realizadoCell(r)}</td></tr>` : `<tr class="doc-row"><td></td><td></td><td class="doc-c">${realizadoCell(null)}</td></tr>`).join('')}
      <tr class="doc-obs"><td colspan="3"><b>Observaciones:</b>${o.obsKey ? `<textarea class="no-print doc-obs-in" data-obs="${esc(o.obsKey)}" rows="2" placeholder="Motivos, novedades o pendientes del día">${esc(o.obs || '')}</textarea><span class="doc-print doc-obs-txt">${esc(o.obs || '')}</span>` : (o.obs ? `<span class="doc-sub">${esc(o.obs)}</span>` : '')}</td></tr>
    </table>
    <table class="doc-t doc-join doc-sign">
      <colgroup><col style="width:15%"><col style="width:18.3%"><col style="width:15%"><col style="width:18.3%"><col style="width:15%"><col style="width:18.4%"></colgroup>
      <tr class="doc-bar"><td colspan="6">Aprobación Final</td></tr>
      <tr>${sign('Control de Calidad', false, o.cliente, '')}${sign('Supervisor', true, '', o.supervisor)}${sign('Operario', true, '', o.opName)}</tr>
    </table>
  </section>`;
}

function sheetPrintable() {
  if (S.ui.sheetMode !== 'fmt') return true;
  const m = S.models.find(x => x.id === S.ui.sheetModel) || S.models.find(x => x.tasks.some(t => t.skill));
  return !!m && formatCoverage(m).ok;
}
/* ¿El formato tiene todas sus tareas con puesto, apoyo de planta u operario designado? */
function formatCoverage(m) {
  const work = m.tasks.filter(t => t.skill);
  const missing = work.filter(t => !E.effPos(S, t).length);
  return { work, missing, ok: work.length > 0 && !missing.length };
}

function crewSheetView() {
  syncPos();
  const mode = S.ui.sheetMode === 'fmt' ? 'fmt' : 'prog';
  const modeSeg = `<div class="mb-4 no-print">${seg('sheetMode', [['prog', 'Proyectos activos'], ['fmt', 'Formato estándar']], mode)}</div>`;
  return modeSeg + (mode === 'fmt' ? sheetFormatView() : sheetProgramView());
}

/* Hoja de cada operario para un día del programa (proyectos activos) */
function sheetProgramView() {
  const active = R.workers;
  if (!active.length) return card('<p class="p-8 text-center text-ink-2">No hay operarios activos.</p>');
  const sel = S.ui.sheetWho || (S.crews[0] ? 'crew:' + S.crews[0].id : 'w:' + active[0].id);
  const workDays = R.cal.days.slice(0, R.lastDay + 1).filter(d => d.hours);
  let dayIso = S.ui.sheetDay;
  if (!dayIso || !workDays.some(d => d.iso === dayIso)) dayIso = (workDays[0] || R.cal.days[0]).iso;
  S.ui.sheetDay = dayIso;
  const di = R.cal.days.findIndex(d => d.iso === dayIso);
  const day = R.cal.days[di];
  const projs = R.projects.filter(p => !p.excluded && p.units.length);
  const projSel = projs.some(p => p.id === S.ui.sheetProj) ? S.ui.sheetProj : '';
  const ids = sel === 'all' ? active.filter(w => crewOf(w.id) || w.id === S.crewSupervisor).map(w => w.id) : sel.startsWith('crew:') ? ((S.crews.find(c => c.id === sel.slice(5)) || {}).members || []).filter(Boolean) : [sel.slice(2)];
  const sup = supervisor();

  const opts = `<option value="all" ${sel === 'all' ? 'selected' : ''}>Todas las cuadrillas</option>${S.crews.map(c => `<optgroup label="${esc(c.name)}"><option value="crew:${esc(c.id)}" ${sel === 'crew:' + c.id ? 'selected' : ''}>Toda la cuadrilla (${(c.members || []).filter(Boolean).length} hojas)</option>${(c.members || []).filter(Boolean).map(id => { const w = workerById(id); return w ? `<option value="w:${esc(id)}" ${sel === 'w:' + id ? 'selected' : ''}>${esc(w.name)}</option>` : ''; }).join('')}</optgroup>`).join('')}<optgroup label="Todos los operarios">${active.map(w => `<option value="w:${esc(w.id)}" ${sel === 'w:' + w.id && !crewOf(w.id) ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</optgroup>`;
  const di0 = workDays.findIndex(d => d.iso === dayIso);
  const prev = workDays[di0 - 1], next = workDays[di0 + 1];
  const controls = `<div class="flex flex-wrap items-end gap-4 mb-4 no-print">
    <label class="text-sm text-ink-2" for="shWho">Operario o cuadrilla<select id="shWho" class="fld mt-1 w-64" data-ui="sheetWho">${opts}</select></label>
    <label class="text-sm text-ink-2" for="shProj">Proyecto<select id="shProj" class="fld mt-1 w-60" data-ui="sheetProj"><option value="">Todos los proyectos activos</option>${projs.map(p => `<option value="${esc(p.id)}" ${p.id === projSel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <div class="text-sm text-ink-2"><label for="shDay">Día</label><div class="mt-1 flex items-center gap-1"><button data-act="sheet-day" data-d="${prev ? prev.iso : ''}" ${prev ? '' : 'disabled'} class="rounded-md border border-line px-2 py-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Día hábil anterior"><svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.5 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><input id="shDay" type="date" class="fld w-44" value="${esc(dayIso)}" min="${esc(R.cal.days[0].iso)}" max="${esc(R.cal.days[R.lastDay].iso)}" data-ui="sheetDay"><button data-act="sheet-day" data-d="${next ? next.iso : ''}" ${next ? '' : 'disabled'} class="rounded-md border border-line px-2 py-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Día hábil siguiente"><svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.5 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>
    <p class="text-xs text-ink-3 max-w-xs ml-auto">Horarios según el programa y el inicio de jornada (${esc(S.calendar.startTime || '07:00')}). Si un operario no tiene tareas ese día o en ese proyecto, no se genera su hoja.</p></div>`;

  const sheets = [];
  ids.forEach(id => {
    const wi = R.workers.findIndex(w => w.id === id);
    const w = R.workers[wi];
    if (!w || !day.hours) return;
    const segs = workerDaySegs(wi, di).filter(sg => !projSel || sg.task.unit.project.id === projSel);
    if (!segs.length) return;
    const wc = crewOf(w.id);
    const posOf = t => { const c = S.crews.find(cc => cc.id === t.unit.crew); if (!c) return ''; const k = (c.members || []).indexOf(w.id); return k >= 0 ? '' : 'apoyo a ' + c.name; };
    const pset = [...new Set(segs.map(sg => sg.task.unit.project))];
    const rec = chkRec(dayIso, w.id);
    const rows = segs.map(sg => {
      const t = sg.task;
      const mates = [...t.crew].filter(x => x !== wi).map(x => plainName(R.workers[x].name));
      const key = `${t.unit.key}|${t.tpl.id}`;
      const cr = rec && rec.t && rec.t[key];
      return { item: moduleItem(t.unit.project, t.unit.n), desc: t.tpl.name, qty: 1,
        check: { date: dayIso, wid: w.id, key, state: cr ? cr.s : '', motivo: cr ? cr.m : '', min: (sg.e - sg.s) * 60 / R.cal.Q, name: t.tpl.name, proj: t.unit.project.name },
        sub: [`${slotClock(sg.s)} – ${slotClockEnd(sg.e)}`, `${t.tpl.station} ${stName(t.tpl.station)}`, mates.length ? 'con ' + mates.join(', ') : '', posOf(t), pset.length > 1 ? t.unit.project.name : ''].filter(Boolean).join(' · ') };
    });
    sheets.push(docSheet({
      proyecto: pset.map(p => p.name).join(', '),
      cliente: [...new Set(pset.map(p => p.client).filter(Boolean))].join(', '),
      operario: `${plainName(w.name)}${wc ? ` — ${wc.name} · ${POS_LABEL[ALL_POS[(wc.members || []).indexOf(w.id)]]}` : (w.id === S.crewSupervisor ? ' — Supervisor de producción' : '')}`,
      opName: plainName(w.name), supervisor: sup ? plainName(sup.name) : '',
      fecha: fDate(dayIso), fechaSub: `Jornada ${slotClock(day.slot0)} – ${slotClockEnd(day.slot0 + day.slots)}`, rows,
      obsKey: `${dayIso}|${w.id}`, obs: rec ? rec.obs || '' : ''
    }));
  });
  const empty = card(`<p class="p-8 text-center text-sm text-ink-2">${day.hours ? 'Nadie de la selección tiene tareas programadas ese día' + (projSel ? ' en ese proyecto' : '') + '.' : 'Día no laborable.'}</p>`);
  return controls + complianceCard(ids, dayIso) + (sheets.length ? `<p class="mb-3 text-xs text-ink-3 no-print">${sheets.length} hoja${sheets.length === 1 ? '' : 's'} lista${sheets.length === 1 ? '' : 's'} para imprimir (tamaño carta, una por página).</p><div class="doc-stack">${sheets.join('')}</div>` : empty);
}

/* Cumplimiento registrado en las hojas: por operario, en minutos programados, con los motivos de lo no realizado */
function complianceCard(ids, dayIso) {
  const by = {}, motivos = {};
  Object.entries(S.checks || {}).forEach(([date, ws]) => Object.entries(ws || {}).forEach(([wid, r]) => {
    if (!ids.includes(wid)) return;
    const o = by[wid] || (by[wid] = { days: new Set(), ok: 0, no: 0, okMin: 0, noMin: 0, today: { ok: 0, no: 0 } });
    Object.values(r.t || {}).forEach(c => {
      if (!c.s) return;
      o.days.add(date);
      if (c.s === 'ok') { o.ok++; o.okMin += c.min || 0; if (date === dayIso) o.today.ok++; }
      else { o.no++; o.noMin += c.min || 0; if (date === dayIso) o.today.no++; const k = c.m || 'Sin motivo'; motivos[k] = (motivos[k] || 0) + (c.min || 0); }
    });
  }));
  const rowsData = ids.map(id => ({ w: workerById(id), o: by[id] })).filter(x => x.w && x.o && (x.o.ok + x.o.no));
  if (!rowsData.length) return `<div class="mb-4 no-print rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-2 flex items-start gap-3"><svg viewBox="0 0 20 20" class="w-5 h-5 text-accent shrink-0" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="3.5" width="13" height="13" rx="2"/><path d="M7 10.2l2.2 2.2L13.5 8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Marcá en cada hoja qué tareas se realizaron (<b>✓</b>) y cuáles no (<b>✗</b>, con su motivo). Con eso se calcula el cumplimiento de cada operario y los motivos de retraso.</span></div>`;
  const tot = rowsData.reduce((a, x) => ({ okMin: a.okMin + x.o.okMin, noMin: a.noMin + x.o.noMin }), { okMin: 0, noMin: 0 });
  const mot = Object.entries(motivos).sort((a, b) => b[1] - a[1]);
  const motMax = Math.max(1, ...mot.map(x => x[1]));
  const rws = rowsData.map(({ w, o }) => { const c = o.okMin + o.noMin ? o.okMin / (o.okMin + o.noMin) : 0; return `<tr class="border-t border-line-2"><td class="pl-4 pr-2 py-2 font-medium">${esc(plainName(w.name))}</td><td class="px-2 py-2 text-right num">${o.days.size}</td><td class="px-2 py-2 text-right num">${o.ok}</td><td class="px-2 py-2 text-right num ${o.no ? 'text-bad' : ''}">${o.no}</td><td class="px-2 py-2 text-right num">${hhm(o.okMin)}</td><td class="px-2 pr-4 py-2"><div class="flex items-center gap-2 justify-end"><span class="h-1.5 w-24 rounded-full bg-surface-2 overflow-hidden"><span class="block h-full rounded-full ${c < 0.8 ? 'bg-warn' : 'bg-accent'}" style="width:${Math.round(c * 100)}%"></span></span><span class="num font-semibold w-12 text-right ${c < 0.8 ? 'text-warn' : ''}">${pct(c)}</span></div></td></tr>`; }).join('');
  return `<div class="mb-6 no-print">${card(`<div class="grid lg:grid-cols-[1fr_20rem] divide-y lg:divide-y-0 lg:divide-x divide-line">
    <div><div class="px-5 pt-4 pb-2"><h2 class="text-base font-semibold">Cumplimiento registrado</h2><p class="text-xs text-ink-3 mt-0.5">Acumulado de todas las hojas marcadas para la selección. El cumplimiento se mide en minutos programados: realizados ÷ (realizados + no realizados).</p></div>
      <div class="scroll-x"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-2 font-medium">Operario</th><th class="px-2 font-medium text-right">Días</th><th class="px-2 font-medium text-right">Realizadas</th><th class="px-2 font-medium text-right">No realizadas</th><th class="px-2 font-medium text-right">Tiempo realizado</th><th class="px-2 pr-4 font-medium text-right">Cumplimiento</th></tr></thead><tbody>${rws}</tbody></table></div></div>
    <div class="px-5 py-4"><h3 class="text-sm font-semibold">Motivos de lo no realizado</h3><p class="text-xs text-ink-3">Tiempo programado que no se hizo, por motivo</p>
      ${mot.length ? `<ul class="mt-3 space-y-2">${mot.map(([k, v]) => `<li><div class="flex justify-between text-xs"><span>${esc(k)}</span><span class="num font-medium">${hhm(v)}</span></div><span class="mt-1 block h-1.5 rounded-full bg-surface-2 overflow-hidden"><span class="block h-full rounded-full bg-bad/70" style="width:${Math.round(v / motMax * 100)}%"></span></span></li>`).join('')}</ul>` : '<p class="mt-3 text-sm text-ink-2">Sin tareas no realizadas.</p>'}
      <p class="mt-3 text-xs text-ink-3">Total: ${hhm(tot.okMin)} realizados, ${hhm(tot.noMin)} no realizados.</p></div>
  </div>`)}</div>`;
}

/* Hoja estándar por puesto para un formato guardado: todas las tareas que hace cada operario en un módulo */
function sheetFormatView() {
  const models = S.models.filter(m => m.tasks.some(t => t.skill));
  if (!models.length) return card('<p class="p-8 text-center text-ink-2">No hay formatos con tareas.</p>');
  const m = models.find(x => x.id === S.ui.sheetModel) || models[0];
  S.ui.sheetModel = m.id;
  const ref = S.crews.find(c => c.id === S.ui.crewRef) || S.crews[0] || null;
  const names = POS.map(ps => (ref ? plainName(memberName(ref, ps)) : POS_LABEL[ps]));
  const cov = formatCoverage(m);
  const who = S.ui.sheetPos || 'all';
  const sup = supervisor();
  const controls = `<div class="flex flex-wrap items-end gap-4 mb-4 no-print">
    <label class="text-sm text-ink-2" for="shModel">Formato<select id="shModel" class="fld mt-1 w-80 max-w-full" data-ui="sheetModel">${models.map(x => { const c = formatCoverage(x); return `<option value="${esc(x.id)}" ${x.id === m.id ? 'selected' : ''}>${c.ok ? '✓ ' : '○ '}${esc(x.name)}${c.ok ? '' : ` (faltan ${c.missing.length})`}</option>`; }).join('')}</select></label>
    <label class="text-sm text-ink-2" for="shRef">Con los nombres de<select id="shRef" class="fld mt-1 w-52" data-ui="crewRef">${S.crews.length ? S.crews.map(c => `<option value="${esc(c.id)}" ${ref && c.id === ref.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('') : '<option value="">Puestos genéricos</option>'}</select></label>
    <label class="text-sm text-ink-2" for="shPos">Hojas<select id="shPos" class="fld mt-1 w-56" data-ui="sheetPos"><option value="all" ${who === 'all' ? 'selected' : ''}>Todos los puestos y apoyo</option>${POS.map((ps, k) => `<option value="${ps}" ${who === ps ? 'selected' : ''}>${esc(POS_LABEL[ps])}: ${esc(names[k])}</option>`).join('')}<option value="sup" ${who === 'sup' ? 'selected' : ''}>Apoyo de planta</option></select></label>
    <p class="text-xs text-ink-3 max-w-xs ml-auto">Procedimiento estándar de un módulo: qué hace cada puesto, en orden y con su tiempo de referencia. La fecha queda en blanco para completar.</p></div>`;
  if (!cov.ok) {
    const list = cov.missing.slice(0, 12).map(t => `<li><span class="num text-ink-3">${esc(t.station)}</span> ${esc(t.name)}</li>`).join('');
    return controls + card(`<div class="p-6"><div class="flex items-start gap-3"><span class="mt-0.5 inline-flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn font-bold">!</span><div><h2 class="text-base font-semibold">${esc(m.name)} todavía tiene ${cov.missing.length} tarea${cov.missing.length === 1 ? '' : 's'} sin asignar</h2><p class="mt-1 text-sm text-ink-2">La hoja estándar se puede imprimir cuando todas las tareas tienen un puesto de la cuadrilla, apoyo de planta o un operario designado.</p><ul class="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">${list}</ul>${cov.missing.length > 12 ? `<p class="mt-2 text-xs text-ink-3">y ${cov.missing.length - 12} más.</p>` : ''}<div class="mt-4 flex flex-wrap gap-2"><button data-act="crew-tab" data-t="estacion" class="rounded-md bg-accent text-white px-3 py-1.5 text-sm font-medium hover:opacity-90">Ir a Estándar por estación</button><button data-act="crew-tab" data-t="reparto" class="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Ajustar este modelo</button></div></div></div></div>`);
  }
  const minOf = t => (+t.hh || 0) * 60;
  const sheets = [];
  const stdSub = (t, extra) => [`${t.station} ${stName(t.station)}`, t.hh != null && t.hh !== '' ? `tiempo estándar ${hhm(minOf(t))}` : 'sin tiempo', extra].filter(Boolean).join(' · ');
  POS.forEach((ps, k) => {
    if (who !== 'all' && who !== ps) return;
    const tasks = m.tasks.filter(t => t.skill && E.effPos(S, t).includes(ps));
    if (!tasks.length) return;
    const total = tasks.reduce((a, t) => { const ap = E.effPos(S, t); const n = ap.filter(x => x !== '*').length || 1; return a + minOf(t) / n; }, 0);
    const rows = tasks.map(t => {
      const ap = E.effPos(S, t);
      const mates = ap.filter(x => x !== ps).map(x => x[0] === '@' ? plainName((workerById(x.slice(1)) || {}).name || x.slice(1)) : (POS.includes(x) ? names[POS.indexOf(x)] : '')).filter(Boolean);
      return { item: t.id, desc: t.name, qty: 1, sub: stdSub(t, mates.length ? 'con ' + mates.join(', ') : '') };
    });
    sheets.push(docSheet({
      title: 'Hoja de Procedimiento Estándar', rowsTitle: 'Tareas del puesto por módulo',
      proyecto: `Formato estándar · ${m.name}`, cliente: '', operario: `${names[k]} — ${ref ? ref.name + ' · ' : ''}${POS_LABEL[ps]}`,
      opName: names[k] === POS_LABEL[ps] ? '' : names[k], supervisor: sup ? plainName(sup.name) : '',
      fecha: '', fechaSub: `Carga del puesto: ${hhm(total)} por módulo`, rows, minRows: 4
    }));
  });
  if (who === 'all' || who === 'sup') {
    const sTasks = m.tasks.filter(t => t.skill && E.effPos(S, t).some(isSupport) && !E.effPos(S, t).some(x => POS.includes(x)));
    if (sTasks.length) {
      const rows = sTasks.map(t => { const ap = E.effPos(S, t); const by = ap.includes('*') ? 'cualquier operario habilitado (' + t.skill + ')' : ap.filter(x => x[0] === '@').map(x => plainName((workerById(x.slice(1)) || {}).name || x.slice(1))).join(', '); return { item: t.id, desc: t.name, qty: 1, sub: stdSub(t, 'la hace ' + by) }; });
      sheets.push(docSheet({ title: 'Hoja de Procedimiento Estándar', rowsTitle: 'Tareas de apoyo de planta por módulo', proyecto: `Formato estándar · ${m.name}`, cliente: '', operario: 'Apoyo de planta (fuera de la cuadrilla)', opName: '', supervisor: sup ? plainName(sup.name) : '', fecha: '', rows, minRows: 4 }));
    }
  }
  return controls + `<p class="mb-3 text-xs text-ink-3 no-print">${esc(m.name)}: todas las tareas asignadas. ${sheets.length} hoja${sheets.length === 1 ? '' : 's'} para imprimir.</p><div class="doc-stack">${sheets.join('') || card('<p class="p-6 text-sm text-ink-2">No hay tareas para esta selección.</p>')}</div>`;
}

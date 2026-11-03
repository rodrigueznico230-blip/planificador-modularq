(function () {
'use strict';
const E = window.PlanEngine;
const STORE = 'planificador-multiproyecto.v2';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const pct = x => nf0.format(Math.round(x * 100)) + '%';
const fDay = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fMon = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fDM = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmt = ms => fDay.format(new Date(ms)).replace(/\./g, '').replace(',', '');
const fmtDM = ms => fDM.format(new Date(ms)).replace(/\./g, '');
const isoMs = iso => E.parseISO(iso);
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const PRIO = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DOW1 = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/* ---------------- Estado ---------------- */
let S, R;
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const o = JSON.parse(raw); if (o && o.calendar && o.projects) return o; }
  } catch (e) { /* almacenamiento no disponible */ }
  return clone(window.PLAN_SAMPLE);
}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; } }
S = load();
S.balance = S.balance || {};
S.ui = S.ui || { gantt: 'proyectos', zoom: 30, heat: 'dias', model: null, open: {} };

function recompute() {
  R = E.schedule(S);
  renderHeader();
}
let saveT, savedAt = null, storageOk = true;
const history = [];
const stripUi = o => { const c = { ...o }; delete c.ui; return JSON.stringify(c); };
function remember(snap) {
  if (!snap || stripUi(snap) === stripUi(S)) return;
  history.push(snap); if (history.length > 50) history.shift();
}
function undo() {
  if (document.body.classList.contains('readonly')) return;
  const prev = history.pop();
  if (!prev) { toast('No hay cambios para deshacer.'); return; }
  const ui = S.ui; S = prev; S.ui = ui; changed(true, true); toast('Cambio deshecho.');
}
const changeListeners = [];
let statusRenderer = null;
function changed(rerender, noHistory, fromCloud) {
  if (!fromCloud) changeListeners.forEach(fn => { try { fn(); } catch (e) { /* listener */ } });
  clearTimeout(saveT);
  saveT = setTimeout(() => { persist(); savedAt = new Date(); renderSaved(); }, 250);
  recompute();
  if (rerender) render(); else refreshResults();
}
function renderSaved() {
  const el = $('#saved'); if (!el) return;
  if (statusRenderer && statusRenderer()) return;
  const hh = savedAt ? savedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
  el.innerHTML = storageOk
    ? `<svg viewBox="0 0 20 20" class="w-4 h-4 text-ok" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Guardado en este navegador${hh ? ' a las ' + hh : ''}</span>`
    : `<svg viewBox="0 0 20 20" class="w-4 h-4 text-bad" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 5.5v5.5M10 14.2v.1" stroke-linecap="round"/></svg><span>Sin guardado automático: exportá el plan</span>`;
  el.title = 'El plan se guarda solo en este navegador. Usá Importar y exportar para respaldarlo o pasarlo a otra computadora.';
}

/* ---------------- Utilidades de resultado ---------------- */
const slotMs = s => R.cal.dayOfSlot(s).ms;
const endMs = s => R.cal.dayOfSlot(Math.max(0, s - 1)).ms;
const colorVar = i => (i < 8 ? `var(--s${i + 1})` : 'var(--s9)');
const inkVar = i => (i < 8 ? `var(--s${i + 1}-ink)` : 'var(--s9-ink)');
function pill(status) {
  const m = {
    ok: ['ok', 'A tiempo', '<path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round"/>'],
    risk: ['warn', 'En riesgo', '<path d="M10 5.5v5.5M10 14.2v.1" stroke-linecap="round"/>'],
    late: ['bad', 'Atrasado', '<path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round"/>'],
    excl: ['bad', 'Sin programar', '<path d="M10 5.5v5.5M10 14.2v.1" stroke-linecap="round"/>'],
    nodata: ['warn', 'Faltan tiempos', '<path d="M10 5.5v5.5M10 14.2v.1" stroke-linecap="round"/>']
  }[status];
  return `<span class="inline-flex items-center gap-1 rounded-full bg-${m[0]}-soft px-2 py-0.5 text-xs font-medium text-ink whitespace-nowrap"><svg viewBox="0 0 20 20" class="w-3.5 h-3.5 text-${m[0]}" fill="none" stroke="currentColor" stroke-width="2.4">${m[2]}</svg>${m[1]}</span>`;
}
function swatch(i, size = 'w-2.5 h-2.5') { return `<span class="inline-block ${size} rounded-sm flex-none" style="background:${colorVar(i)}"></span>`; }
function card(inner, cls = '') { return `<section class="rounded-lg border border-line bg-surface shadow-sm ${cls}">${inner}</section>`; }
function pageHead(title, sub, actions = '') {
  return `<div class="flex flex-wrap items-end justify-between gap-4 mb-6"><div class="min-w-0"><h1 class="text-2xl font-semibold tracking-tight">${title}</h1>${sub ? `<p class="mt-1 text-sm text-ink-2 max-w-3xl leading-relaxed">${sub}</p>` : ''}</div>${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ''}</div>`;
}
const btn = (label, act, primary, extra = '') => `<button data-act="${act}" ${extra} class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${primary ? 'bg-accent text-accent-ink hover:bg-accent-hover' : 'border border-line bg-surface hover:bg-surface-2'}">${label}</button>`;
const plus = '<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4v12M4 10h12" stroke-linecap="round"/></svg>';
const trash = '<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const delBtn = (act, i, label) => `<button data-act="${act}" data-i="${i}" class="rounded-md p-1.5 text-ink-3 hover:bg-bad-soft hover:text-bad transition-colors" aria-label="${esc(label)}" title="${esc(label)}">${trash}</button>`;
function seg(name, options, current) {
  return `<div class="inline-flex rounded-md border border-line bg-surface-2 p-0.5" role="group">${options.map(([v, l]) => `<button data-seg="${name}" data-v="${v}" aria-pressed="${v === current}" class="rounded px-3 py-1 text-sm font-medium transition-colors ${v === current ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}">${l}</button>`).join('')}</div>`;
}
function newId(prefix, list) { let n = list.length + 1; while (list.some(x => x.id === prefix + n)) n++; return prefix + n; }

/* ---------------- Tooltip ---------------- */
const tip = $('#tip');
let tips = [];
const tipAttr = html => { tips.push(html); return `data-tip="${tips.length - 1}"`; };
document.addEventListener('mousemove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tip.classList.remove('on'); return; }
  const html = tips[+t.dataset.tip];
  if (tip._k !== t.dataset.tip) { tip.innerHTML = html; tip._k = t.dataset.tip; }
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > innerHeight - 8) y = e.clientY - h - pad;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
  tip.classList.add('on');
});
document.addEventListener('scroll', () => tip.classList.remove('on'), true);

/* ---------------- Toast ---------------- */
let toastT;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<div class="flex items-center gap-4 rounded-lg bg-ink text-surface px-4 py-2.5 text-sm shadow-lg"><span>${esc(msg)}</span>${undo ? '<button class="font-semibold underline underline-offset-2" data-undo>Deshacer</button>' : ''}</div>`;
  el.classList.remove('hidden');
  const b = el.querySelector('[data-undo]');
  if (b) b.onclick = () => { const ui = S.ui; S = undo; S.ui = ui; changed(true); el.classList.add('hidden'); };
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 6000);
}

/* ---------------- Tiempos faltantes ---------------- */
const isWaitTask = t => !t.skill;
const taskMissing = t => isWaitTask(t) ? (t.wait == null || t.wait === '') : (t.hh == null || t.hh === '');
function modelMissing(m) { return m ? m.tasks.filter(taskMissing).length : 0; }
function projectIncomplete(p) { const m = S.models.find(x => x.id === p.model); return modelMissing(m) > 0; }

/* ---------------- Resultados en vivo (vistas de datos) ---------------- */
function resultCells() {
  const out = {};
  R.projects.forEach(p => { out['p:' + p.id] = p.excluded || !p.units.length ? '—' : fmt(endMs(p.end)); });
  R.workers.forEach(w => { out['w:' + w.id] = pct(w.util); });
  R.stations.forEach(s => { out['s:' + s.id] = pct(s.util); });
  return out;
}
function refreshResults() {
  const cells = resultCells();
  $$('[data-result]').forEach(el => {
    const v = cells[el.dataset.result] ?? '—';
    if (el.textContent !== v) {
      el.textContent = v;
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  });
  validateDates();
}
function dateIssues(p) {
  const iss = {};
  if (p.release && p.due && p.due < p.release) iss.due = 'El compromiso es anterior a la liberación.';
  if (p.release && p.release < S.calendar.start) iss.release = 'La liberación es anterior al inicio del programa (' + fmt(isoMs(S.calendar.start)) + '); se tomará el inicio.';
  return iss;
}
function validateDates() {
  S.projects.forEach((p, i) => {
    const iss = dateIssues(p);
    [['release', 'r'], ['due', 'd']].forEach(([k, c]) => {
      const inp = document.getElementById(`p${i}${c}`); const msg = document.getElementById(`p${i}${c}-msg`);
      if (!inp) return;
      inp.classList.toggle('invalid', !!iss[k]); inp.setAttribute('aria-invalid', iss[k] ? 'true' : 'false');
      if (msg) msg.textContent = iss[k] || '';
    });
  });
}

/* ---------------- Encabezado ---------------- */
let lastEnd = null;
function renderHeader() {
  $('#planName').textContent = S.planName || 'Plan sin nombre';
  const live = R.projects.filter(p => !p.excluded && p.units.length && !projectIncomplete(p));
  const late = live.filter(p => p.status === 'late').length;
  const h = $('#hdrStatus');
  if (!live.length) { h.innerHTML = '<span>Cargá proyectos para calcular el programa.</span>'; return; }
  const endTxt = fmt(endMs(R.makespan));
  const moved = lastEnd && lastEnd !== endTxt;
  lastEnd = endTxt;
  h.innerHTML = `<span class="recalc inline-flex items-center gap-1.5 text-xs text-ink-3" aria-live="polite"></span><span>Fin del programa: <strong class="font-semibold text-ink ${moved ? 'flash' : ''}">${endTxt}</strong></span><span class="text-line">|</span>${late ? pill('late').replace('Atrasado', late === 1 ? '1 atrasado' : late + ' atrasados') : pill('ok').replace('A tiempo', 'Todo a tiempo')}`;
}

/* ================= VISTAS ================= */
const views = {};

/* ---------- Resumen ---------- */
views.resumen = () => {
  const all = R.projects.filter(p => !p.excluded && p.units.length);
  const incomplete = all.filter(p => projectIncomplete(p));
  const live = all.filter(p => !projectIncomplete(p));
  const late = live.filter(p => p.status === 'late');
  const risk = live.filter(p => p.status === 'risk');
  const ok = live.length - late.length;
  let headline;
  if (!all.length) headline = 'Todavía no hay proyectos para programar';
  else if (!live.length) headline = 'Faltan cargar los tiempos de las tareas para calcular fechas confiables';
  else if (late.length) headline = `${late.length === 1 ? 'Un proyecto termina' : late.length + ' proyectos terminan'} después de la fecha comprometida`;
  else if (risk.length) headline = `Todos los proyectos llegan, ${risk.length === 1 ? 'uno' : risk.length} con 2 días hábiles de holgura o menos`;
  else headline = 'Todos los proyectos llegan a tiempo';
  const nW = S.workers.filter(w => w.active !== false).length;
  const sub = (incomplete.length ? `${incomplete.length === 1 ? 'Un proyecto usa' : incomplete.length + ' proyectos usan'} modelos con tareas sin tiempo: sus fechas no son confiables hasta completar los tiempos en Modelos y tareas. ` : '') + (all.length ? `Con ${nW} operarios activos y ${S.stations.length} estaciones, el programa empieza el ${fmt(slotMs(0))} y termina el ${fmt(endMs(R.makespan))}. Las fechas se recalculan cada vez que cambiás un dato.` : 'Agregá proyectos en la sección Proyectos.');

  const bn = R.bottleneck;
  const kpi = (label, value, note, accent) => `<div class="p-5 min-w-0"><div class="text-sm text-ink-2">${label}</div><div class="mt-1 text-2xl font-semibold tracking-tight num ${accent || ''}">${value}</div><div class="mt-1 text-xs text-ink-3">${note}</div></div>`;
  const kpis = card(`<div class="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-line">
    ${kpi('Fin del programa', live.length ? fmt(endMs(R.makespan)) : '—', live.length ? `${R.cal.workdaysBetween(0, R.makespan) + 1} días hábiles` : '')}
    ${kpi('Proyectos a tiempo', `${ok} de ${live.length}`, incomplete.length ? `${incomplete.length} sin evaluar: faltan tiempos` : risk.length ? `${risk.length} con holgura ≤ 2 días` : 'Sin proyectos en riesgo')}
    ${kpi('Utilización de operarios', live.length ? pct(R.avgUtil) : '—', 'Promedio sobre horas disponibles')}
    ${kpi('Cuello de botella', bn && live.length ? esc(bn.id) : '—', bn && live.length ? `${esc(bn.name)}, ocupada ${pct(bn.util)} de su capacidad` : '', 'text-signal')}
  </div>`);

  // tabla de proyectos
  const lastDay = Math.max(R.lastDay, ...live.map(p => R.cal.dayOfSlot(Math.max(0, p.dueSlot - 1)).i)) + 1;
  const rows = R.projects.map((p, i) => {
    if (p.excluded || !p.units.length) {
      return `<tr class="border-t border-line-2"><td class="py-3 pl-5 pr-3"><div class="flex items-center gap-2">${swatch(i)}<span class="font-medium">${esc(p.name)}</span></div></td><td class="px-3 text-ink-2">${esc(p.modelName)} × ${p.qty}</td><td colspan="5" class="px-3 text-sm text-ink-2">${esc(p.reason || 'Sin unidades')}</td><td class="px-3 pr-5">${pill('excl')}</td></tr>`;
    }
    const a = R.cal.dayOfSlot(p.relSlot).i / lastDay * 100;
    const s = R.cal.posStart(p.start) / lastDay * 100, e = R.cal.posEnd(p.end) / lastDay * 100;
    const d = R.cal.posEnd(p.dueSlot) / lastDay * 100;
    const mini = `<div class="relative h-5 w-44 rounded bg-surface-2" ${tipAttr(`<b>${esc(p.name)}</b><br>Liberación ${fmt(isoMs(p.release))}<br>Inicio ${fmt(slotMs(p.start))}, fin ${fmt(endMs(p.end))}<br>Compromiso ${fmt(isoMs(p.due))}`)}>
      <div class="absolute top-0 bottom-0 border-l border-ink-3/50" style="left:${a}%"></div>
      <div class="absolute top-1.5 h-2 rounded-sm" style="left:${s}%;width:${Math.max(1, e - s)}%;background:${colorVar(i)}"></div>
      <div class="absolute -top-0.5 -bottom-0.5 border-l-2 ${p.status === 'late' ? 'border-bad' : 'border-ink'}" style="left:${d}%"></div></div>`;
    const slack = p.slackDays;
    return `<tr class="border-t border-line-2 hover:bg-surface-2/60">
      <td class="py-3 pl-5 pr-3"><div class="flex items-center gap-2">${swatch(i)}<div class="min-w-0"><div class="font-medium truncate">${esc(p.name)}</div><div class="text-xs text-ink-3">${esc(p.client || '')}${p.client ? ', ' : ''}prioridad ${PRIO[p.prio].toLowerCase()}</div></div></div></td>
      <td class="px-3 text-ink-2 min-w-56">${esc(p.modelName)} × ${p.qty}</td>
      <td class="px-3 text-right num">${nf0.format(p.hh)}</td>
      <td class="px-3 whitespace-nowrap">${fmt(slotMs(p.start))}</td>
      <td class="px-3 whitespace-nowrap font-medium">${fmt(endMs(p.end))}</td>
      <td class="px-3 whitespace-nowrap text-ink-2">${fmt(isoMs(p.due))}</td>
      <td class="px-3 text-right num ${slack < 0 ? 'text-bad font-semibold' : ''}">${slack > 0 ? '+' : ''}${slack}</td>
      <td class="px-3 pr-5"><div class="flex items-center gap-3">${pill(projectIncomplete(p) ? 'nodata' : p.status)}<span class="hidden xl:block">${mini}</span></div></td></tr>`;
  }).join('');
  const table = card(`<div class="flex items-center justify-between px-5 pt-4 pb-3"><h2 class="text-base font-semibold">Proyectos</h2><a href="#proyectos" class="text-sm font-medium text-accent hover:underline">Editar proyectos</a></div>
    <div class="scroll-x"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-ink-3">
    <th class="pl-5 pr-3 pb-2 font-medium">Proyecto</th><th class="px-3 pb-2 font-medium">Modelo</th><th class="px-3 pb-2 font-medium text-right">HH</th><th class="px-3 pb-2 font-medium">Inicio</th><th class="px-3 pb-2 font-medium">Fin estimado</th><th class="px-3 pb-2 font-medium">Compromiso</th><th class="px-3 pb-2 font-medium text-right" title="Días hábiles entre el fin estimado y el compromiso">Holgura (días)</th><th class="px-3 pr-5 pb-2 font-medium">Estado</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="px-5 py-6 text-ink-2">No hay proyectos cargados.</td></tr>'}</tbody></table></div>
    <p class="px-5 py-3 text-xs text-ink-3 border-t border-line-2">En la línea de tiempo: la raya fina marca la liberación, la barra es la fabricación y la raya gruesa el compromiso.</p>`);

  // alertas
  const alerts = [];
  R.errors.forEach(e => alerts.push(['bad', e]));
  S.projects.forEach(p => { const iss = dateIssues(p); Object.values(iss).forEach(m => alerts.push([iss.due === m ? 'bad' : 'warn', `<b>${esc(p.name)}</b>: ${esc(m)} <a href="#proyectos" class="font-medium text-accent hover:underline">Corregir</a>`])); });
  S.models.forEach(m => { const n = modelMissing(m); const used = S.projects.filter(p => p.model === m.id).length; if (n && used) alerts.push(['warn', `<b>${esc(m.name)}</b>: ${n} de ${m.tasks.length} tareas no tienen tiempo cargado, así que ${used === 1 ? 'su proyecto figura' : 'sus ' + used + ' proyectos figuran'} más ${used === 1 ? 'corto' : 'cortos'} de lo real. <a href="#modelos" class="font-medium text-accent hover:underline">Cargar tiempos</a>`]); });
  late.forEach(p => alerts.push(['bad', `<b>${esc(p.name)}</b> termina el ${fmt(endMs(p.end))}, ${-p.slackDays} día(s) hábil(es) después del compromiso. Probá subir su prioridad, adelantar la liberación o sumar operarios en ${esc(R.bottleneck.name)}.`]));
  risk.forEach(p => alerts.push(['warn', `<b>${esc(p.name)}</b> llega con ${p.slackDays} día(s) hábil(es) de margen. Cualquier demora en planta lo atrasa.`]));
  // especialidades
  const skillStats = skillUtil();
  skillStats.filter(s => s.util >= 0.7).forEach(s => alerts.push(['warn', `La especialidad <b>${esc(s.skill)}</b> trabaja al ${pct(s.util)} de las horas de sus ${s.n} operario(s) habilitado(s). Es la primera en saturarse si entra otro proyecto.`]));
  R.workers.filter(w => w.util < 0.4 && w.availH > 0).forEach(w => alerts.push(['info', `<b>${esc(w.name)}</b> trabaja ${pct(w.util)} de su tiempo disponible. Capacitarlo en ${esc((skillStats.find(s => !w.skills.includes(s.skill)) || {}).skill || 'otra especialidad')} aumentaría la polivalencia.`]));
  const icon = { bad: 'text-bad', warn: 'text-warn', info: 'text-ink-3' };
  const stripe = { bad: 'bg-bad', warn: 'bg-warn', info: 'bg-line' };
  const alertHtml = card(`<div class="px-5 pt-4 pb-2 flex items-baseline justify-between"><h2 class="text-base font-semibold">Alertas y sugerencias</h2><span class="text-xs text-ink-3">${alerts.length}</span></div>
    <ul class="px-3 pb-3 space-y-1">${alerts.length ? alerts.map(([k, m]) => `<li class="flex gap-3 rounded-md px-2 py-2 hover:bg-surface-2"><span class="w-1 rounded-full flex-none ${stripe[k]}"></span><span class="text-sm leading-relaxed text-ink-2">${m}</span></li>`).join('') : '<li class="px-2 py-3 text-sm text-ink-2">No hay alertas. El programa cumple todos los compromisos con margen.</li>'}</ul>`);

  // ocupación de estaciones
  const maxU = 1;
  const st = R.stations.map(s => {
    const isB = R.bottleneck && s.id === R.bottleneck.id;
    return `<div class="grid grid-cols-12 items-center gap-3 py-1.5" ${tipAttr(`<b>${esc(s.id)} ${esc(s.name)}</b><br>Ocupación promedio ${pct(s.util)}<br>Capacidad: ${s.cap} unidad(es) a la vez<br>${s.visits.length} unidad(es) pasan por la estación`)}>
      <div class="col-span-5 text-sm truncate"><span class="text-ink-3 num">${esc(s.id)}</span> ${esc(s.name)}</div>
      <div class="col-span-5 h-3 rounded-sm bg-surface-2 overflow-hidden"><div class="h-full rounded-r-sm ${isB ? 'bg-signal' : 'bg-accent'}" style="width:${Math.min(100, s.util / maxU * 100)}%"></div></div>
      <div class="col-span-2 text-sm text-right num ${isB ? 'font-semibold' : 'text-ink-2'}">${pct(s.util)}</div></div>`;
  }).join('');
  const stHtml = card(`<div class="px-5 pt-4"><h2 class="text-base font-semibold">Ocupación de estaciones</h2><p class="text-xs text-ink-3 mt-0.5">Promedio de unidades presentes sobre la capacidad, durante todo el programa. ${R.bottleneck ? `<span class="inline-flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-sm bg-signal"></span>Cuello de botella</span>` : ''}</p></div><div class="px-5 py-3">${st}</div>`);

  return pageHead(esc(headline), esc(sub)) + `<div class="space-y-6">${kpis}${table}<div class="grid lg:grid-cols-2 gap-6">${alertHtml}${stHtml}</div></div>`;
};

function skillUtil() {
  const out = [];
  for (const sk of S.skills) {
    const qual = R.workers.filter(w => (w.skills || []).includes(sk));
    if (!qual.length) continue;
    const cap = qual.reduce((s, w) => s + w.availH, 0);
    let busy = 0; const m = R.skillDay[sk]; if (m) for (const v of m.values()) busy += v;
    out.push({ skill: sk, n: qual.length, util: cap ? busy / cap : 0, busy, cap });
  }
  return out.sort((a, b) => b.util - a.util);
}

/* ---------- Gantt ---------- */
views.gantt = () => {
  const mode = S.ui.gantt, dw = S.ui.zoom;
  const live = R.projects.filter(p => !p.excluded && p.units.length);
  const nDays = Math.max(R.lastDay, ...live.map(p => R.cal.dayOfSlot(Math.max(0, p.dueSlot - 1)).i)) + 4;
  const W = nDays * dw, LW = innerWidth < 640 ? 150 : 260;
  const days = R.cal.days.slice(0, nDays);
  const nonwork = days.filter(d => !d.hours).map(d => `<div class="g-nonwork" style="left:${d.i * dw}px;width:${dw}px"></div>`).join('');
  const today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const ti = Math.round((today - R.cal.start) / 864e5);
  const todayIn = ti >= 0 && ti < nDays;
  const todayLine = todayIn ? `<div class="g-line" style="left:${ti * dw}px;border-color:rgb(var(--accent))"></div>` : '';
  const todayTag = todayIn ? `<div class="absolute bottom-0 z-10 -translate-x-1/2 rounded bg-accent px-1.5 text-xs font-semibold leading-4 text-accent-ink" style="left:${ti * dw}px">Hoy</div>` : '';
  const x = p => p * dw;

  // encabezado: meses + días
  let months = '', cur = null, startI = 0;
  days.forEach((d, i) => {
    const m = new Date(d.ms).getUTCMonth();
    if (cur === null) cur = m;
    if (m !== cur || i === days.length - 1) {
      const end = m !== cur ? i : i + 1;
      months += `<div class="absolute top-0 h-6 px-2 text-xs font-semibold border-l border-line truncate leading-6" style="left:${startI * dw}px;width:${(end - startI) * dw}px">${cap(fMon.format(new Date(days[startI].ms)).replace(' de ', ' '))}</div>`;
      startI = i; cur = m;
    }
  });
  const dayCells = days.map(d => {
    const dt = new Date(d.ms);
    const mon = d.dow === 1;
    return `<div class="absolute top-6 h-8 text-center leading-none pt-1 ${d.hours ? 'text-ink-2' : 'text-ink-3/70'} ${mon ? 'border-l border-line' : ''}" style="left:${d.i * dw}px;width:${dw}px"><div class="text-xs num ${d.holiday ? 'line-through' : ''}">${dt.getUTCDate()}</div><div class="text-xs mt-0.5 opacity-70">${DOW1[d.dow]}</div></div>`;
  }).join('');
  const head = `<div class="g-row g-head border-b border-line" style="min-height:3.5rem"><div class="g-label text-xs text-ink-3 font-medium" style="width:${LW}px">${mode === 'proyectos' ? 'Proyecto / unidad / tarea' : mode === 'estaciones' ? 'Estación / puesto' : 'Operario'}</div><div class="g-track" style="width:${W}px;height:3.5rem">${months}${dayCells}${todayTag}</div></div>`;

  const bar = (s, e, i, label, tipHtml, cls = '') => {
    const L = x(R.cal.posStart(s)), Wd = Math.max(3, x(R.cal.posEnd(e)) - L - 1);
    return `<div class="g-bar ${cls}" style="left:${L}px;width:${Wd}px;background:${colorVar(i)};color:${inkVar(i)}" ${tipAttr(tipHtml)}>${Wd > 26 ? esc(label) : ''}</div>`;
  };
  const row = (label, inner, cls = '', attrs = '') => `<div class="g-row ${cls}" ${attrs}><div class="g-label" style="width:${LW}px">${label}</div><div class="g-track" style="width:${W}px">${nonwork}${todayLine}${inner}</div></div>`;
  const taskTip = (x_, pi) => {
    const crew = [...x_.crew].map(wi => R.workers[wi].name);
    return `<b>${esc(x_.tpl.id)} ${esc(x_.tpl.name)}</b><br>${esc(R.projects[pi].name)}, unidad ${x_.unit.n}<br>Estación ${esc(x_.tpl.station)}, ${esc(x_.tpl.skill || 'espera')}<br>${fmt(slotMs(x_.start))} → ${fmt(endMs(x_.laborEnd || x_.end))}<br>${nf1.format(x_.hh)} HH${x_.wait ? `, espera ${x_.wait} h` : ''}${crew.length ? `<br>Operarios: ${esc(crew.join(', '))}` : ''}`;
  };

  let body = '';
  const projIdx = new Map(R.projects.map((p, i) => [p, i]));
  if (mode === 'proyectos') {
    R.projects.forEach((p, pi) => {
      if (p.excluded || !p.units.length) return;
      const due = `<div class="g-due ${p.status === 'late' ? 'late' : ''}" style="left:${x(R.cal.posEnd(p.dueSlot))}px" ${tipAttr(`Compromiso de <b>${esc(p.name)}</b>: ${fmt(isoMs(p.due))}`)}></div>`;
      const span = `<div class="g-bar thin" style="left:${x(R.cal.posStart(p.start))}px;width:${x(R.cal.posEnd(p.end)) - x(R.cal.posStart(p.start))}px;background:${colorVar(pi)};opacity:.35"></div>`;
      body += row(`${swatch(pi)}<span class="truncate" title="${esc(p.name)}">${esc(p.name)}</span><span class="ml-auto">${pill(projectIncomplete(p) ? 'nodata' : p.status)}</span>`, span + due, 'group');
      p.units.forEach(u => {
        const open = !!S.ui.open[u.key];
        const list = Object.entries(u.st).filter(([, v]) => v.enter != null).map(([si, v]) => ({ si: +si, s: v.enter, e: v.leave ?? u.end })).sort((a, b) => a.s - b.s);
        const lanesEnd = [];
        list.forEach(g => { let l = lanesEnd.findIndex(e => e <= g.s); if (l < 0) { l = lanesEnd.length; lanesEnd.push(0); } lanesEnd[l] = g.e; g.l = l; });
        const nL = Math.max(1, lanesEnd.length), lh = nL > 1 ? 15 : 22, rowH = nL > 1 ? nL * (lh + 3) + 11 : 36;
        const segs = list.map(g => {
          const stn = R.stations[g.si];
          const L = x(R.cal.posStart(g.s)), Wd = Math.max(3, x(R.cal.posEnd(g.e)) - L - 1);
          return `<div class="g-bar" style="left:${L}px;width:${Wd}px;top:${6 + g.l * (lh + 3)}px;height:${lh}px;line-height:${lh}px;font-size:${nL > 1 ? 10 : 11}px;background:${colorVar(pi)};color:${inkVar(pi)}" ${tipAttr(`<b>${esc(p.name)}, unidad ${u.n}</b><br>${esc(stn.id)} ${esc(stn.name)}<br>${fmt(slotMs(g.s))} → ${fmt(endMs(g.e))}`)}>${Wd > 22 ? esc(stn.id) : ''}</div>`;
        }).join('');
        body += row(`<button data-act="toggle-unit" data-k="${esc(u.key)}" aria-expanded="${open}" class="flex items-center gap-1.5 text-left w-full pl-4 text-ink-2 hover:text-ink"><svg viewBox="0 0 20 20" class="w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.5 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>Unidad ${u.n}<span class="ml-auto text-xs text-ink-3 num">${fmtDM(slotMs(u.start))} – ${fmtDM(endMs(u.end))}</span></button>`, segs + due, '', `style="min-height:${rowH}px"`);
        if (open) {
          u.tasks.forEach(t => {
            let inner = '';
            if (t.hh > 0) inner += bar(t.start, t.laborEnd, pi, t.tpl.id, taskTip(t, pi));
            if (t.wait > 0) inner += bar(t.laborEnd, t.end, pi, '', `<b>Espera de ${esc(t.tpl.id)}</b> (curado, secado o prueba)<br>${t.wait} h hábiles`, 'wait thin');
            body += row(`<span class="pl-9 truncate text-xs text-ink-2"><span class="num text-ink-3">${esc(t.tpl.id)}</span> ${esc(t.tpl.name)}</span>`, inner + due);
          });
        }
      });
    });
  } else if (mode === 'estaciones') {
    R.stations.forEach(s => {
      const lanes = Array.from({ length: s.cap }, () => []);
      const vis = s.visits.slice().sort((a, b) => a.enter - b.enter);
      vis.forEach(v => {
        const e = v.leave ?? v.unit.end;
        let li = lanes.findIndex(l => !l.length || l[l.length - 1].e <= v.enter);
        if (li < 0) li = 0;
        lanes[li].push({ ...v, e });
      });
      const isB = R.bottleneck && s.id === R.bottleneck.id;
      body += row(`<span class="num text-ink-3">${esc(s.id)}</span><span class="truncate">${esc(s.name)}</span><span class="ml-auto text-xs font-medium num ${isB ? 'text-signal' : 'text-ink-3'}">${pct(s.util)}</span>`, '', 'group');
      lanes.forEach((l, li) => {
        const inner = l.map(v => {
          const pi = projIdx.get(v.unit.project);
          return bar(v.enter, v.e, pi, `${v.unit.project.id}-${v.unit.n}`, `<b>${esc(v.unit.project.name)}, unidad ${v.unit.n}</b><br>${esc(s.id)} ${esc(s.name)}<br>${fmt(slotMs(v.enter))} → ${fmt(endMs(v.e))}`);
        }).join('');
        body += row(`<span class="pl-4 text-xs text-ink-2">Puesto ${li + 1}</span>`, inner);
      });
    });
  } else {
    R.workers.forEach(w => {
      const inner = w.segs.map(sg => {
        const pi = projIdx.get(sg.task.unit.project);
        return bar(sg.s, sg.e, pi, sg.task.tpl.id, taskTip(sg.task, pi));
      }).join('');
      body += row(`<span class="truncate">${esc(w.name)}</span><span class="ml-auto text-xs num text-ink-3">${pct(w.util)}</span>`, inner);
    });
  }

  const legend = live.length > 1 ? `<div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">${R.projects.map((p, i) => p.excluded ? '' : `<span class="inline-flex items-center gap-1.5">${swatch(i)}${esc(p.name)}</span>`).join('')}</div>` : '';
  const toolbar = `<div class="flex flex-wrap items-center gap-3 mb-4">${seg('gantt', [['proyectos', 'Por proyecto'], ['estaciones', 'Por estación'], ['operarios', 'Por operario']], mode)}
    <label class="flex items-center gap-2 text-sm text-ink-2 ml-auto" for="zoom">Escala<input id="zoom" type="range" min="14" max="72" step="2" value="${dw}" class="accent-emerald-700 w-32"></label>
    ${mode === 'proyectos' ? btn('Expandir todo', 'expand-all') + btn('Contraer', 'collapse-all') : ''}</div>`;
  const sub = {
    proyectos: 'Cada unidad muestra su paso por las estaciones. Abrí una unidad para ver sus tareas; el rayado indica esperas de curado o prueba. La línea discontinua marca el compromiso.',
    estaciones: 'Cada fila es un puesto físico de la estación (según su capacidad). Muestra qué unidad ocupa cada puesto y cuándo se libera.',
    operarios: 'Las barras muestran en qué tarea trabaja cada operario, hora por hora. El porcentaje es su utilización sobre las horas disponibles.'
  }[mode];
  return pageHead('Programa de producción', sub) + toolbar + card(`<div class="gantt overflow-auto rounded-lg" style="max-height:calc(100vh - 17rem)">${head}${body || `<div class="p-6 text-sm text-ink-2">No hay unidades programadas.</div>`}</div>`) + `<div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-3">${legend}<span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm" style="background:rgb(var(--nonwork));box-shadow:inset 0 0 0 1px rgb(var(--line))"></span>Día no laborable</span><span class="inline-flex items-center gap-1.5"><span class="inline-block w-0 h-3 border-l-2 border-dashed border-ink-2"></span>Compromiso</span><span class="inline-flex items-center gap-1.5"><span class="inline-block w-0 h-3 border-l-2 border-accent"></span>Hoy (${todayIn ? fmt(today) : 'fuera del rango'})</span></div>`;
};

/* ---------- Carga de operarios ---------- */
function heatColor(u) {
  if (u <= 0) return ['var(--h0)', 'var(--h-ink-dark)'];
  const steps = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.01];
  let k = steps.findIndex(s => u < s); if (k < 0) k = 7; else k += 1;
  return [`var(--h${k})`, k >= 5 ? 'var(--h-ink-light)' : 'var(--h-ink-dark)'];
}
views.carga = () => {
  const scale = S.ui.heat;
  const days = R.cal.days.slice(0, R.lastDay + 1);
  // periodos
  let periods;
  if (scale === 'dias') periods = days.filter(d => d.hours).map(d => ({ label: `<div class="num">${new Date(d.ms).getUTCDate()}</div><div class="opacity-70">${DOW1[d.dow]}</div>`, title: fmt(d.ms), days: [d] }));
  else {
    periods = []; let cur = null;
    days.forEach(d => {
      const wk = Math.floor((d.i + ((new Date(R.cal.start).getUTCDay() + 6) % 7)) / 7);
      if (!cur || cur.wk !== wk) { cur = { wk, days: [], label: '', title: '' }; periods.push(cur); }
      cur.days.push(d);
    });
    periods = periods.filter(p => p.days.some(d => d.hours));
    periods.forEach(p => { const f = p.days.find(d => d.hours) || p.days[0]; p.label = `<div>sem</div><div class="num">${fmtDM(f.ms)}</div>`; p.title = 'Semana del ' + fmt(p.days[0].ms); });
  }
  const cw = scale === 'dias' ? '1.75rem' : '3.75rem';
  const headCells = periods.map(p => `<th class="px-0 pb-1 text-xs text-ink-3 leading-tight font-medium" title="${esc(p.title)}">${p.label}</th>`).join('');
  const wRows = R.workers.map(w => {
    const cells = periods.map(p => {
      let busy = 0, av = 0;
      p.days.forEach(d => { busy += w.day.get(d.i) || 0; av += Math.round(d.hours * w.avail); });
      const u = av ? busy / av : 0;
      const [bg, ink] = heatColor(u);
      return `<td class="c" style="background:${bg};color:${ink}" ${tipAttr(`<b>${esc(w.name)}</b><br>${esc(p.title)}<br>${nf1.format(busy)} h asignadas de ${nf1.format(av)} h disponibles (${pct(u)})`)}>${scale === 'semanas' && u > 0 ? pct(u) : ''}</td>`;
    }).join('');
    return `<tr><th scope="row" class="sticky left-0 z-10 bg-surface pr-3 text-left font-normal"><div class="text-sm font-medium truncate max-w-52">${esc(w.name)}</div><div class="text-xs text-ink-3 truncate max-w-52">${esc((w.skills || []).join(', '))}</div></th>${cells}<td class="pl-4 text-right text-sm num whitespace-nowrap">${nf0.format(w.busy)} h</td><td class="pl-4 pr-1 text-right text-sm font-semibold num">${pct(w.util)}</td></tr>`;
  }).join('');
  const skillRows = skillUtil().map(s => {
    const qual = R.workers.filter(w => (w.skills || []).includes(s.skill));
    const m = R.skillDay[s.skill] || new Map();
    const cells = periods.map(p => {
      let busy = 0, av = 0;
      p.days.forEach(d => { busy += m.get(d.i) || 0; qual.forEach(w => (av += Math.round(d.hours * w.avail))); });
      const u = av ? busy / av : 0;
      const [bg, ink] = heatColor(u);
      return `<td class="c" style="background:${bg};color:${ink}" ${tipAttr(`<b>${esc(s.skill)}</b><br>${esc(p.title)}<br>${nf1.format(busy)} h de ${nf1.format(av)} h de operarios habilitados (${pct(u)})`)}>${scale === 'semanas' && u > 0 ? pct(u) : ''}</td>`;
    }).join('');
    return `<tr><th scope="row" class="sticky left-0 z-10 bg-surface pr-3 text-left font-normal"><div class="text-sm font-medium">${esc(s.skill)}</div><div class="text-xs text-ink-3">${s.n} operario(s) habilitado(s)</div></th>${cells}<td class="pl-4 text-right text-sm num whitespace-nowrap">${nf0.format(s.busy)} h</td><td class="pl-4 pr-1 text-right text-sm font-semibold num">${pct(s.util)}</td></tr>`;
  }).join('');
  const legendSteps = [0, .1, .25, .4, .55, .7, .85, .95].map(u => `<span class="inline-block w-6 h-3 rounded-sm" style="background:${heatColor(u)[0]};box-shadow:inset 0 0 0 1px rgb(var(--line))"></span>`).join('');
  const legend = `<div class="flex items-center gap-2 text-xs text-ink-3"><span>0%</span><span class="inline-flex gap-0.5">${legendSteps}</span><span>100% de las horas disponibles</span></div>`;
  const tbl = (title, note, rows) => card(`<div class="px-5 pt-4 pb-2"><h2 class="text-base font-semibold">${title}</h2><p class="text-xs text-ink-3 mt-0.5">${note}</p></div><div class="scroll-x px-5 pb-4"><table class="heat border-separate" style="--cw:${cw};border-spacing:0"><thead><tr><th class="sticky left-0 z-10 bg-surface"></th>${headCells}<th class="pl-4 pb-1 text-xs text-ink-3 text-right font-medium align-bottom">Horas</th><th class="pl-4 pb-1 text-xs text-ink-3 text-right font-medium align-bottom">Uso</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  return pageHead('Carga de operarios', 'Cuánto de su tiempo disponible usa cada operario y cada especialidad. Los tonos oscuros son jornadas llenas; las celdas claras son capacidad libre para tomar más trabajo o redistribuir.')
    + `<div class="flex flex-wrap items-center gap-4 mb-4">${seg('heat', [['dias', 'Por día'], ['semanas', 'Por semana']], scale)}<div class="ml-auto">${legend}</div></div>`
    + `<div class="space-y-6">${tbl('Operarios', 'Horas asignadas sobre horas disponibles (jornada × disponibilidad).', wRows)}${tbl('Especialidades', 'Horas trabajadas en tareas de la especialidad sobre las horas de todos los operarios habilitados. Un operario polivalente suma capacidad a varias especialidades.', skillRows)}</div>`;
};

/* ---------- Equilibrado ---------- */
function weeklyHours() { return S.calendar.hours.reduce((a, b) => a + (+b || 0), 0); }
function balanceOf(m) {
  const B = S.balance[m.id] || (S.balance[m.id] = { demand: 4, hours: Math.round(weeklyHours() * 52 / 12), crew: {} });
  const used = S.stations.filter(s => m.tasks.some(t => t.station === s.id));
  used.forEach(s => {
    if (B.crew[s.id] == null) B.crew[s.id] = Math.max(1, ...m.tasks.filter(t => t.station === s.id).map(t => +t.cmin || 1));
  });
  const TT = B.hours / Math.max(0.0001, +B.demand || 0);
  const st = used.map(s => {
    const ts = m.tasks.filter(t => t.station === s.id && (+t.hh || 0) > 0);
    const hh = ts.reduce((a, t) => a + (+t.hh || 0), 0);
    const crew = Math.max(1, +B.crew[s.id] || 1);
    const wait = Math.max(0, ...m.tasks.filter(t => t.station === s.id).map(t => +t.wait || 0));
    return { s, ts, hh, crew, tc: hh / crew, wait };
  });
  const Tp = st.reduce((a, x) => a + x.hh, 0);
  const Tc = Math.max(0, ...st.map(x => x.tc));
  const N = st.reduce((a, x) => a + x.crew, 0);
  return { B, TT, st, Tp, Tc, N, NME: Tp / TT, ETm: N && Tc ? Tp / (N * Tc) : 0, cap: Tc ? B.hours / Tc : 0 };
}
views.equilibrado = () => {
  if (!S.models.length) return pageHead('Equilibrado por estación', 'Primero cargá un modelo con sus tareas.');
  const m = S.models.find(x => x.id === S.ui.model) || S.models[0];
  S.ui.model = m.id;
  const b = balanceOf(m);
  const bnId = b.st.reduce((a, x) => (!a || x.tc > a.tc ? x : a), null);
  // gráfico Yamazumi (SVG)
  const Wc = 760, Hc = 320, ml = 48, mr = 16, mt = 16, mb = 44;
  const ymax = Math.max(b.TT, b.Tc) * 1.15 || 1;
  const step = niceStep(ymax / 5);
  const iw = Wc - ml - mr, ih = Hc - mt - mb;
  const bw = Math.min(64, iw / b.st.length * 0.56);
  const y = v => mt + ih - v / ymax * ih;
  let svg = '';
  for (let v = 0; v <= ymax + 1e-9; v += step) svg += `<line x1="${ml}" x2="${Wc - mr}" y1="${y(v)}" y2="${y(v)}" stroke="rgb(var(--line))" stroke-width="1"/><text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="rgb(var(--ink-3))">${nf1.format(v)}</text>`;
  b.st.forEach((x, i) => {
    const cx = ml + iw / b.st.length * (i + .5);
    let acc = 0;
    const isB = x === bnId;
    x.ts.forEach((t, k) => {
      const h = (+t.hh || 0) / x.crew;
      const y1 = y(acc + h), y0 = y(acc);
      const top = k === x.ts.length - 1;
      const hh = Math.max(0.5, y0 - y1 - 2);
      svg += `<g ${tipAttr(`<b>${esc(t.id)} ${esc(t.name)}</b><br>${nf1.format(+t.hh)} HH ÷ ${x.crew} operario(s) = ${nf1.format(h)} h`)}><rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${hh}" rx="${top ? 4 : 1}" fill="${isB ? 'rgb(var(--signal))' : 'rgb(var(--accent))'}"/>${hh > 13 && bw > 30 ? `<text x="${cx}" y="${y1 + hh / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="rgb(var(--accent-ink))">${esc(t.id)}</text>` : ''}</g>`;
      acc += h;
    });
    svg += `<text x="${cx}" y="${y(x.tc) - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="rgb(var(--ink))">${nf1.format(x.tc)} h</text>`;
    svg += `<text x="${cx}" y="${Hc - mb + 18}" text-anchor="middle" font-size="12" font-weight="600" fill="rgb(var(--ink))">${esc(x.s.id)}</text><text x="${cx}" y="${Hc - mb + 33}" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">${x.crew} op.</text>`;
  });
  svg += `<line x1="${ml}" x2="${Wc - mr}" y1="${y(b.TT)}" y2="${y(b.TT)}" stroke="rgb(var(--bad))" stroke-width="2" stroke-dasharray="6 4"/><text x="${Wc - mr}" y="${y(b.TT) - 6}" text-anchor="end" font-size="11" font-weight="600" fill="rgb(var(--bad))">Takt time ${nf1.format(b.TT)} h</text>`;
  svg += `<text x="12" y="${mt + ih / 2}" transform="rotate(-90 12 ${mt + ih / 2})" text-anchor="middle" font-size="11" fill="rgb(var(--ink-3))">horas por unidad</text>`;

  const kpi = (l, v, n, cls = '') => `<div class="p-4"><div class="text-xs text-ink-2">${l}</div><div class="mt-1 text-xl font-semibold tracking-tight num ${cls}">${v}</div><div class="text-xs text-ink-3 mt-0.5">${n}</div></div>`;
  const meets = b.Tc <= b.TT;
  const kpis = card(`<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-x divide-y xl:divide-y-0 divide-line">
    ${kpi('Takt time (TT)', nf1.format(b.TT) + ' h', 'Horas disponibles ÷ demanda')}
    ${kpi('Tiempo de ciclo (Tc)', nf1.format(b.Tc) + ' h', bnId ? 'Lo fija ' + esc(bnId.s.id) : '—', meets ? '' : 'text-bad')}
    ${kpi('Contenido de trabajo (Tp)', nf1.format(b.Tp) + ' HH', 'Suma de tiempos estándar')}
    ${kpi('Operarios mínimos (NME)', nf1.format(b.NME), `Tp ÷ TT, redondeado: ${Math.ceil(b.NME - 1e-9)}`)}
    ${kpi('Eficiencia del equilibrado', pct(b.ETm), `Tp ÷ (${b.N} op. × Tc)`)}
    ${kpi('Capacidad de la línea', nf1.format(b.cap) + ' u/mes', meets ? 'Cubre la demanda' : 'No cubre la demanda', meets ? 'text-ok' : 'text-bad')}</div>`);

  const rows = b.st.map(x => `<tr class="border-t border-line-2">
    <td class="py-2 pl-5 pr-3"><span class="num text-ink-3">${esc(x.s.id)}</span> ${esc(x.s.name)}</td>
    <td class="px-3 text-right num">${x.ts.length}</td>
    <td class="px-3 text-right num">${nf1.format(x.hh)}</td>
    <td class="px-3 w-28"><label class="sr-only" for="crew-${esc(x.s.id)}">Operarios en ${esc(x.s.id)}</label><input id="crew-${esc(x.s.id)}" class="fld num" type="number" min="1" step="1" value="${x.crew}" data-crew="${esc(x.s.id)}"></td>
    <td class="px-3 text-right num font-medium ${x.tc > b.TT ? 'text-bad' : ''}">${nf1.format(x.tc)}</td>
    <td class="px-3 text-right num">${x.wait ? nf0.format(x.wait) : '—'}</td>
    <td class="px-3 pr-5"><div class="flex items-center gap-2"><div class="h-2 w-28 rounded-sm bg-surface-2 overflow-hidden"><div class="h-full ${x === bnId ? 'bg-signal' : 'bg-accent'}" style="width:${Math.min(100, x.tc / b.TT * 100)}%"></div></div><span class="text-xs num text-ink-2">${pct(x.tc / b.TT)}</span></div></td></tr>`).join('');

  const modelSel = `<label for="balModel" class="sr-only">Modelo</label><select id="balModel" class="fld w-80 max-w-full" data-ui="model">${S.models.map(x => `<option value="${esc(x.id)}" ${x.id === m.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  const inputs = `<div class="flex flex-wrap items-end gap-4 mb-4">${modelSel}
    <label class="text-sm text-ink-2" for="balDemand">Demanda (unidades por mes)<input id="balDemand" class="fld mt-1 w-40 num" type="number" min="0.1" step="0.5" value="${b.B.demand}" data-bal="demand"></label>
    <label class="text-sm text-ink-2" for="balHours">Horas disponibles por mes<input id="balHours" class="fld mt-1 w-40 num" type="number" min="1" step="1" value="${b.B.hours}" data-bal="hours"></label>
    <div class="ml-auto flex gap-2">${btn('Sugerir dotación', 'suggest-crew', true)}${btn('Calcular horas desde el calendario', 'hours-from-cal')}</div></div>`;

  return pageHead('Equilibrado por estación', 'Diagrama de equilibrado (Yamazumi) de un modelo: cada barra es el tiempo que una unidad pasa en la estación con la dotación elegida. La estación más alta fija el tiempo de ciclo; si supera el takt time, la línea no cubre la demanda.')
    + inputs + `<div class="space-y-6">${kpis}
    ${card(`<div class="px-5 pt-4 flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-base font-semibold">${meets ? 'Todas las estaciones quedan bajo el takt time' : `${esc(bnId.s.id)} supera el takt time en ${nf1.format(b.Tc - b.TT)} h por unidad`}</h2><span class="text-xs text-ink-3 inline-flex items-center gap-3"><span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-accent"></span>Tareas (HH ÷ operarios)</span><span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-signal"></span>Cuello de botella</span></span></div><div class="scroll-x px-3 pb-3"><svg viewBox="0 0 ${Wc} ${Hc}" class="w-full max-w-4xl" style="min-width:640px" role="img" aria-label="Diagrama de equilibrado del modelo ${esc(m.name)}">${svg}</svg></div>`)}
    ${card(`<div class="scroll-x"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-5 pr-3 py-3 font-medium">Estación</th><th class="px-3 font-medium text-right">Tareas</th><th class="px-3 font-medium text-right">HH</th><th class="px-3 font-medium">Operarios</th><th class="px-3 font-medium text-right">Tiempo en estación (h)</th><th class="px-3 font-medium text-right">Espera máx. (h)</th><th class="px-3 pr-5 font-medium">Carga sobre TT</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="px-5 py-3 text-xs text-ink-3 border-t border-line-2 leading-relaxed">Las esperas (curado, secado, pruebas) no consumen horas-hombre pero alargan el tiempo de flujo y ocupan el puesto. El programa multi-proyecto ya las considera; acá se informan por separado. La dotación por estación es solo para este análisis.</p>`)}</div>`;
};
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

/* ---------- Datos: proyectos ---------- */
views.proyectos = () => {
  const res = new Map(R.projects.map(p => [p.id, p]));
  const rows = S.projects.map((p, i) => {
    const r = res.get(p.id);
    const end = r && !r.excluded && r.units.length ? fmt(endMs(r.end)) : '—';
    return `<tr class="border-t border-line-2 align-middle">
      <td class="pl-4 pr-2 py-2">${swatch(i, 'w-3 h-3')}</td>
      <td class="px-2 min-w-56"><label class="sr-only" for="p${i}n">Nombre</label><input id="p${i}n" class="fld bare font-medium" value="${esc(p.name)}" data-path="projects.${i}.name"></td>
      <td class="px-2 min-w-36"><label class="sr-only" for="p${i}c">Cliente</label><input id="p${i}c" class="fld bare" value="${esc(p.client || '')}" data-path="projects.${i}.client" placeholder="Cliente"></td>
      <td class="px-2 min-w-56"><label class="sr-only" for="p${i}m">Modelo</label><select id="p${i}m" class="fld" data-path="projects.${i}.model" data-rerender>${S.models.map(m => `<option value="${esc(m.id)}" ${m.id === p.model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></td>
      <td class="px-2 w-24"><label class="sr-only" for="p${i}q">Cantidad</label><input id="p${i}q" class="fld num" type="number" min="0" step="1" value="${p.qty}" data-path="projects.${i}.qty" data-type="int"></td>
      <td class="px-2 w-40 align-top pt-2"><label class="sr-only" for="p${i}r">Liberación</label><input id="p${i}r" class="fld" type="date" value="${esc(p.release)}" data-path="projects.${i}.release" aria-describedby="p${i}r-msg"><p id="p${i}r-msg" class="field-msg"></p></td>
      <td class="px-2 w-40 align-top pt-2"><label class="sr-only" for="p${i}d">Compromiso</label><input id="p${i}d" class="fld" type="date" value="${esc(p.due)}" data-path="projects.${i}.due" aria-describedby="p${i}d-msg"><p id="p${i}d-msg" class="field-msg"></p></td>
      <td class="px-2 w-28"><label class="sr-only" for="p${i}p">Prioridad</label><select id="p${i}p" class="fld" data-path="projects.${i}.prio" data-type="int">${[1, 2, 3].map(v => `<option value="${v}" ${+p.prio === v ? 'selected' : ''}>${PRIO[v]}</option>`).join('')}</select></td>
      <td class="px-2 whitespace-nowrap text-ink-2 text-sm"><span data-result="p:${esc(p.id)}" class="rounded px-1 -mx-1">${end}</span></td>
      <td class="pl-2 pr-4 text-right">${delBtn('del-project', i, 'Eliminar ' + p.name)}</td></tr>`;
  }).join('');
  return pageHead('Proyectos', 'Cada proyecto fabrica una cantidad de unidades de un modelo. La liberación es el primer día en que puede entrar a planta; el compromiso es la fecha de entrega pactada. Ante conflictos se atiende primero la prioridad más alta y luego el compromiso más cercano.', btn(plus + 'Agregar proyecto', 'add-project', true))
    + card(`<div class="scroll-x"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-3"></th><th class="px-2 font-medium">Proyecto</th><th class="px-2 font-medium">Cliente</th><th class="px-2 font-medium">Modelo</th><th class="px-2 font-medium text-right">Cantidad</th><th class="px-2 font-medium">Liberación</th><th class="px-2 font-medium">Compromiso</th><th class="px-2 font-medium">Prioridad</th><th class="px-2 font-medium">Fin estimado</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="px-5 py-8 text-center text-ink-2">No hay proyectos. Agregá el primero con el botón de arriba.</td></tr>'}</tbody></table></div>`);
};

/* ---------- Datos: modelos ---------- */
views.modelos = () => {
  if (!S.models.length) return pageHead('Modelos y tareas', 'Un modelo es la receta de fabricación de un tipo de unidad.', btn(plus + 'Nuevo modelo', 'add-model', true)) + card('<p class="p-8 text-center text-ink-2">Creá un modelo para empezar a cargar sus tareas.</p>');
  const m = S.models.find(x => x.id === S.ui.model) || S.models[0];
  S.ui.model = m.id;
  const mi = S.models.indexOf(m);
  const errs = E.validateModel(m);
  const list = S.models.map(x => `<button data-act="pick-model" data-id="${esc(x.id)}" aria-current="${x.id === m.id ? 'page' : 'false'}" class="nav-link whitespace-nowrap"><span>${esc(x.name)}</span><span class="text-xs text-ink-3 num">${x.tasks.length}</span></button>`).join('');
  const hh = m.tasks.reduce((a, t) => a + (+t.hh || 0), 0);
  const rows = m.tasks.map((t, i) => `<tr class="border-t border-line-2">
    <td class="pl-4 pr-2 pt-3.5 align-top text-ink-3 num text-xs">${esc(t.id)}</td>
    <td class="px-1 min-w-72 align-top pt-1.5"><label class="sr-only" for="t${i}n">Tarea ${esc(t.id)}</label><input id="t${i}n" class="fld bare" value="${esc(t.name)}" data-path="models.${mi}.tasks.${i}.name"></td>
    <td class="px-1 w-52 align-top pt-1.5"><label class="sr-only" for="t${i}s">Estación</label><select id="t${i}s" class="fld" data-path="models.${mi}.tasks.${i}.station">${S.stations.map(s => `<option value="${esc(s.id)}" ${s.id === t.station ? 'selected' : ''}>${esc(s.id)} ${esc(s.name)}</option>`).join('')}</select></td>
    <td class="px-1 w-40 align-top pt-1.5"><label class="sr-only" for="t${i}k">Especialidad</label><select id="t${i}k" class="fld" data-path="models.${mi}.tasks.${i}.skill" data-rerender><option value="" ${!t.skill ? 'selected' : ''}>Espera (sin mano de obra)</option>${S.skills.map(s => `<option ${s === t.skill ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
    <td class="px-1 w-20 min-w-20 align-top pt-1.5"><label class="sr-only" for="t${i}h">HH</label><input id="t${i}h" class="fld num ${!isWaitTask(t) && taskMissing(t) ? 'missing' : ''}" type="number" min="0" step="0.5" value="${t.hh ?? ''}" placeholder="${isWaitTask(t) ? '—' : 'HH'}" ${isWaitTask(t) ? 'disabled' : ''} data-path="models.${mi}.tasks.${i}.hh" data-type="numnull"></td>
    <td class="px-1 w-16 min-w-16 align-top pt-1.5"><label class="sr-only" for="t${i}a">Mínimo</label><input id="t${i}a" class="fld num" type="number" min="1" step="1" value="${t.cmin}" data-path="models.${mi}.tasks.${i}.cmin" data-type="int"></td>
    <td class="px-1 w-16 min-w-16 align-top pt-1.5"><label class="sr-only" for="t${i}b">Máximo</label><input id="t${i}b" class="fld num" type="number" min="1" step="1" value="${t.cmax}" data-path="models.${mi}.tasks.${i}.cmax" data-type="int"></td>
    <td class="px-1 w-20 min-w-20 align-top pt-1.5"><label class="sr-only" for="t${i}w">Espera</label><input id="t${i}w" class="fld num ${isWaitTask(t) && taskMissing(t) ? 'missing' : ''}" type="number" min="0" step="1" value="${t.wait ?? ''}" placeholder="h" data-path="models.${mi}.tasks.${i}.wait" data-type="intnull"></td>
    <td class="px-1 w-48 align-top pt-1.5"><label class="sr-only" for="t${i}p">Precedentes</label><input id="t${i}p" class="fld ${(t.preds || []).some(p => !m.tasks.some(k => k.id === p)) ? 'invalid' : ''}" value="${esc((t.preds || []).join(', '))}" data-path="models.${mi}.tasks.${i}.preds" data-type="list" placeholder="—" list="taskcodes" aria-describedby="t${i}p-msg"><p id="t${i}p-msg" class="field-msg !text-ink-3 truncate max-w-48" title="${esc((t.preds || []).map(p => { const k = m.tasks.find(x => x.id === p); return k ? p + ': ' + k.name : p + ' no existe'; }).join('\n'))}">${(t.preds || []).map(p => { const k = m.tasks.find(x => x.id === p); return k ? esc(k.name) : `<span class="text-bad">${esc(p)} no existe</span>`; }).join('; ')}</p></td>
    <td class="pl-1 pr-4 pt-1.5 align-top text-right">${delBtn('del-task', i, 'Eliminar tarea ' + t.id)}</td></tr>`).join('');
  const miss = modelMissing(m);
  const missHtml = miss ? `<div class="mb-4 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm leading-relaxed"><b>Faltan ${miss} de ${m.tasks.length} tiempos.</b> Completá las horas-hombre estándar de cada tarea (celdas resaltadas) y las horas de espera de las tareas de secado o curado. Mientras falten, los proyectos con este modelo no se evalúan contra su compromiso.</div>` : '';
  const errHtml = errs.length ? `<div class="mb-4 rounded-md border border-bad/40 bg-bad-soft px-4 py-3 text-sm"><b>Este modelo no se puede programar todavía.</b><ul class="mt-1 list-disc pl-5">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
  return pageHead('Modelos y tareas', 'Un modelo es la receta de fabricación de un tipo de unidad: sus tareas, en qué estación se hacen, qué especialidad requieren, las horas-hombre estándar (Te) y qué tareas deben estar terminadas antes. La espera son horas hábiles de curado, secado o prueba sin mano de obra.', btn(plus + 'Nuevo modelo', 'add-model') + btn('Duplicar modelo', 'dup-model'))
    + `<nav aria-label="Modelos" class="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 shadow-sm">${list}</nav>
    <div class="min-w-0"><div>${missHtml}${errHtml}${card(`<div class="flex flex-wrap items-end gap-3 px-4 pt-4 pb-3"><label class="flex-1 min-w-64 text-xs text-ink-3" for="mName">Nombre del modelo<input id="mName" class="fld mt-1 text-base font-semibold" value="${esc(m.name)}" data-path="models.${mi}.name" data-rerender-nav></label>
      <div class="text-sm text-ink-2 pb-2"><span class="num font-semibold text-ink">${m.tasks.length}</span> tareas, <span class="num font-semibold text-ink">${nf1.format(hh)}</span> HH por unidad${modelMissing(m) ? `, <span class="font-semibold text-warn">${modelMissing(m)} sin tiempo</span>` : ''}</div>
      ${delBtn('del-model', mi, 'Eliminar modelo')}</div>
      <div class="scroll-x"><table class="w-full text-sm" style="min-width:1120px"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-2 font-medium">Código</th><th class="px-1 font-medium">Tarea</th><th class="px-1 font-medium">Estación</th><th class="px-1 font-medium">Especialidad</th><th class="px-1 font-medium text-right">HH</th><th class="px-1 font-medium text-right" title="Cuadrilla mínima">Mín.</th><th class="px-1 font-medium text-right" title="Cuadrilla máxima">Máx.</th><th class="px-1 font-medium text-right" title="Horas hábiles de espera">Espera h</th><th class="px-1 font-medium" title="Códigos separados por coma">Precedentes</th><th></th></tr></thead><tbody>${rows}</tbody></table><datalist id="taskcodes">${m.tasks.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</datalist></div>
      <div class="px-4 py-3 border-t border-line-2">${btn(plus + 'Agregar tarea', 'add-task')}</div>`)}</div></div>`;
};

/* ---------- Datos: operarios ---------- */
views.operarios = () => {
  const rows = S.workers.map((w, i) => {
    const r = R.workers.find(x => x.id === w.id);
    return `<tr class="border-t border-line-2 align-top">
    <td class="pl-4 pr-2 py-2 min-w-48"><label class="sr-only" for="w${i}n">Nombre</label><input id="w${i}n" class="fld bare font-medium" value="${esc(w.name)}" data-path="workers.${i}.name"></td>
    <td class="px-2 py-2"><div class="flex flex-wrap gap-1.5">${S.skills.map(s => `<button data-act="toggle-skill" data-i="${i}" data-s="${esc(s)}" aria-pressed="${(w.skills || []).includes(s)}" class="chip-toggle rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-ink-2 hover:border-ink-3 transition-colors">${esc(s)}</button>`).join('')}</div></td>
    <td class="px-2 py-2 w-28"><label class="sr-only" for="w${i}p">Disponibilidad</label><div class="relative"><input id="w${i}p" class="fld num pr-7" type="number" min="5" max="100" step="5" value="${w.pct ?? 100}" data-path="workers.${i}.pct" data-type="int"><span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-3">%</span></div></td>
    <td class="px-2 py-2 w-20 text-center"><label class="inline-flex items-center gap-2 pt-1.5 text-sm" for="w${i}a"><input id="w${i}a" type="checkbox" class="w-4 h-4 accent-emerald-700" ${w.active !== false ? 'checked' : ''} data-path="workers.${i}.active" data-type="bool"><span class="sr-only">Activo</span></label></td>
    <td class="px-2 py-2 text-right text-sm num text-ink-2 pt-3"><span data-result="w:${esc(w.id)}" class="rounded px-1 -mx-1">${r ? pct(r.util) : '—'}</span></td>
    <td class="pl-2 pr-4 py-2 text-right">${delBtn('del-worker', i, 'Eliminar ' + w.name)}</td></tr>`;
  }).join('');
  const skills = `<div class="flex flex-wrap items-center gap-2">${S.skills.map((s, i) => `<span class="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line pl-3 pr-1 py-0.5 text-sm">${esc(s)}<button data-act="del-skill" data-i="${i}" class="rounded-full p-0.5 text-ink-3 hover:text-bad hover:bg-bad-soft" aria-label="Quitar ${esc(s)}"><svg viewBox="0 0 20 20" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round"/></svg></button></span>`).join('')}
    <form data-form="add-skill" class="inline-flex items-center gap-2"><label class="sr-only" for="newSkill">Nueva especialidad</label><input id="newSkill" class="fld w-48" placeholder="Nueva especialidad"><button class="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">Agregar</button></form></div>`;
  return pageHead('Operarios', 'Marcá las especialidades que cada operario puede cubrir: un operario polivalente puede pasar de una tarea a otra según la necesidad. La disponibilidad es el porcentaje de la jornada que dedica a planta.', btn(plus + 'Agregar operario', 'add-worker', true))
    + `<div class="space-y-6">${card(`<div class="px-5 pt-4 pb-1"><h2 class="text-base font-semibold">Especialidades</h2><p class="text-xs text-ink-3 mt-0.5">Se usan en las tareas de los modelos y en las habilidades de cada operario.</p></div><div class="px-5 py-4">${skills}</div>`)}
    ${card(`<div class="scroll-x"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-3 font-medium">Operario</th><th class="px-2 font-medium">Especialidades</th><th class="px-2 font-medium text-right">Disponibilidad</th><th class="px-2 font-medium text-center">Activo</th><th class="px-2 font-medium text-right">Uso en el plan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`)}</div>`;
};

/* ---------- Datos: estaciones ---------- */
views.estaciones = () => {
  const rows = S.stations.map((s, i) => {
    const r = R.stations.find(x => x.id === s.id);
    return `<tr class="border-t border-line-2">
    <td class="pl-4 pr-2 py-2 w-28"><label class="sr-only" for="s${i}i">Código</label><input id="s${i}i" class="fld bare font-medium num" value="${esc(s.id)}" data-path="stations.${i}.id" data-rename-station="${esc(s.id)}"></td>
    <td class="px-2 min-w-72"><label class="sr-only" for="s${i}n">Nombre</label><input id="s${i}n" class="fld bare" value="${esc(s.name)}" data-path="stations.${i}.name"></td>
    <td class="px-2 w-36"><label class="sr-only" for="s${i}c">Capacidad</label><input id="s${i}c" class="fld num" type="number" min="1" step="1" value="${s.cap}" data-path="stations.${i}.cap" data-type="int"></td>
    <td class="px-2 text-right text-sm num ${R.bottleneck && R.bottleneck.id === s.id ? 'font-semibold text-signal' : 'text-ink-2'}"><span data-result="s:${esc(s.id)}" class="rounded px-1 -mx-1">${r ? pct(r.util) : '—'}</span></td>
    <td class="pl-2 pr-4 text-right">${delBtn('del-station', i, 'Eliminar ' + s.id)}</td></tr>`;
  }).join('');
  return pageHead('Estaciones', 'Las estaciones son los puestos o bahías de la planta. La capacidad es cuántas unidades pueden estar al mismo tiempo en la estación; una unidad ocupa su lugar desde que empieza la primera tarea de esa estación hasta que termina la última, incluidas las esperas.', btn(plus + 'Agregar estación', 'add-station', true))
    + card(`<div class="scroll-x"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-ink-3"><th class="pl-4 pr-2 py-3 font-medium">Código</th><th class="px-2 font-medium">Nombre</th><th class="px-2 font-medium text-right">Capacidad (unidades)</th><th class="px-2 font-medium text-right">Ocupación en el plan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
};

/* ---------- Datos: calendario ---------- */
views.calendario = () => {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const hours = order.map(d => `<label class="text-sm text-ink-2" for="h${d}">${DOW[d]}<input id="h${d}" class="fld mt-1 num" type="number" min="0" max="24" step="1" value="${S.calendar.hours[d]}" data-path="calendar.hours.${d}" data-type="int"></label>`).join('');
  return pageHead('Calendario', 'Define cuándo trabaja la planta. Los días con 0 horas o marcados como feriado no se programan y aparecen sombreados en el Gantt.')
    + `<div class="grid lg:grid-cols-2 gap-6 items-start">${card(`<div class="p-5 space-y-5">
      <label class="block text-sm text-ink-2" for="planNameIn">Nombre del plan<input id="planNameIn" class="fld mt-1" value="${esc(S.planName || '')}" data-path="planName"></label>
      <label class="block text-sm text-ink-2" for="calStart">Inicio del programa<input id="calStart" class="fld mt-1 w-48" type="date" value="${esc(S.calendar.start)}" data-path="calendar.start"></label>
      <fieldset><legend class="text-sm font-semibold mb-2">Horas de trabajo por día</legend><div class="grid grid-cols-4 sm:grid-cols-7 gap-3">${hours}</div><p class="mt-2 text-xs text-ink-3">Total semanal: <span class="num font-medium text-ink-2">${weeklyHours()} h</span> por operario.</p></fieldset></div>`)}
      ${card(`<div class="p-5"><label class="block text-sm font-semibold" for="hol">Feriados y días sin actividad</label><p class="text-xs text-ink-3 mt-0.5 mb-2">Una fecha por línea, en formato AAAA-MM-DD.</p><textarea id="hol" rows="9" class="fld font-mono num" data-path="calendar.holidays" data-type="lines">${esc((S.calendar.holidays || []).join('\n'))}</textarea></div>`)}</div>`;
};

/* ================= RENDER + RUTEO ================= */
const ROUTES = ['resumen', 'gantt', 'carga', 'equilibrado', 'proyectos', 'modelos', 'operarios', 'estaciones', 'calendario'];
function route() { const h = location.hash.slice(1); return ROUTES.includes(h) ? h : 'resumen'; }
function render() {
  tips = [];
  const r = route();
  $$('#nav .nav-link').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + r ? 'page' : 'false'));
  const main = $('#main'); const keep = main.scrollTop;
  $('#view').innerHTML = views[r]();
  main.scrollTop = keep;
  if (r === 'proyectos') validateDates();
}
window.addEventListener('hashchange', () => { $('#main').scrollTop = 0; render(); });

/* ---------------- Edición de datos ---------------- */
function setPath(path, val) {
  const parts = path.split('.');
  let o = S;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = val;
}
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fileImport') return;
  if (t.dataset.path && document.body.classList.contains('readonly')) { render(); toast('Solo lectura: tu rol no permite editar el plan.'); return; }
  if (t.dataset.path) {
    const snapC = clone(S);
    let v = t.type === 'checkbox' ? t.checked : t.value;
    const ty = t.dataset.type;
    if (ty === 'int') v = Math.max(0, Math.round(+v || 0));
    else if (ty === 'num') v = Math.max(0, +v || 0);
    else if (ty === 'numnull') v = String(v).trim() === '' ? null : Math.max(0, +v || 0);
    else if (ty === 'intnull') v = String(v).trim() === '' ? null : Math.max(0, Math.round(+v || 0));
    else if (ty === 'list') v = String(v).split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
    else if (ty === 'lines') v = String(v).split(/\n+/).map(x => x.trim()).filter(Boolean);
    if (t.dataset.renameStation) {
      const old = t.dataset.renameStation; v = String(v).trim() || old;
      if (v !== old && S.stations.some(s => s.id === v)) { toast(`Ya existe una estación ${v}.`); t.value = old; return; }
      S.models.forEach(m => m.tasks.forEach(k => { if (k.station === old) k.station = v; }));
      t.dataset.renameStation = v;
    }
    setPath(t.dataset.path, v);
    remember(snapC);
    if (ty === 'numnull' || ty === 'intnull') t.classList.toggle('missing', v == null);
    const re = t.hasAttribute('data-rerender') || t.hasAttribute('data-rerender-nav') || ['calendar.hours'].some(p => t.dataset.path.startsWith(p)) || t.dataset.path.endsWith('.cmin') || t.dataset.path.endsWith('.cmax') || t.dataset.path.endsWith('.preds');
    changed(re);
    return;
  }
  if (t.dataset.ui === 'model') { S.ui.model = t.value; changed(true); return; }
  if (t.dataset.bal) { const snapC = clone(S); const m = S.models.find(x => x.id === S.ui.model); balanceOf(m).B[t.dataset.bal] = Math.max(0.1, +t.value || 1); remember(snapC); changed(true); return; }
  if (t.dataset.crew) { const snapC = clone(S); const m = S.models.find(x => x.id === S.ui.model); balanceOf(m).B.crew[t.dataset.crew] = Math.max(1, Math.round(+t.value || 1)); remember(snapC); changed(true); return; }
});
document.addEventListener('input', e => { if (e.target.id === 'zoom') { S.ui.zoom = +e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(() => { changed(true); const z = $('#zoom'); z && z.focus(); }, 60); } });
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.dataset.form === 'add-skill') {
    e.preventDefault();
    const v = $('#newSkill').value.trim();
    if (!v) return;
    if (S.skills.includes(v)) { toast('Esa especialidad ya existe.'); return; }
    S.skills.push(v); changed(true); $('#newSkill') && $('#newSkill').focus();
  }
});

document.addEventListener('click', e => {
  const sg = e.target.closest('[data-seg]');
  if (sg) { S.ui[sg.dataset.seg] = sg.dataset.v; changed(true); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i;
  const viewOnly = ['toggle-unit', 'expand-all', 'collapse-all', 'pick-model', 'copy-json', 'copy-csv', 'suggest-crew', 'hours-from-cal'];
  if (document.body.classList.contains('readonly') && !viewOnly.includes(act)) { toast('Solo lectura: tu rol no permite editar el plan.'); return; }
  const snap = clone(S);
  queueMicrotask(() => remember(snap));
  const m = S.models.find(x => x.id === S.ui.model) || S.models[0];
  switch (act) {
    case 'toggle-unit': S.ui.open[b.dataset.k] = !S.ui.open[b.dataset.k]; changed(true); break;
    case 'expand-all': R.units.forEach(u => (S.ui.open[u.key] = true)); changed(true); break;
    case 'collapse-all': S.ui.open = {}; changed(true); break;
    case 'add-project': {
      const today = S.calendar.start;
      const due = E.toISO(E.parseISO(today) + 28 * 864e5);
      S.projects.push({ id: newId('P', S.projects), name: 'Proyecto nuevo', client: '', model: (S.models[0] || {}).id, qty: 1, release: today, due, prio: 2 });
      changed(true); setTimeout(() => { const ins = $$('[data-path$=".name"]'); ins.length && ins[ins.length - 1].select(); }, 0); break;
    }
    case 'del-project': { const n = S.projects[i].name; S.projects.splice(i, 1); changed(true); toast(`Proyecto “${n}” eliminado.`, snap); break; }
    case 'pick-model': S.ui.model = b.dataset.id; changed(true); break;
    case 'add-model': {
      const id = newId('M', S.models);
      S.models.push({ id, name: 'Modelo nuevo', tasks: [{ id: 'T1', name: 'Primera tarea', station: (S.stations[0] || {}).id, skill: S.skills[0], hh: 4, cmin: 1, cmax: 2, wait: 0, preds: [] }] });
      S.ui.model = id; location.hash = 'modelos'; changed(true); break;
    }
    case 'dup-model': { const c = clone(m); c.id = newId('M', S.models); c.name = m.name + ' (copia)'; S.models.push(c); S.ui.model = c.id; changed(true); break; }
    case 'del-model': {
      const used = S.projects.filter(p => p.model === m.id).length;
      if (used) { toast(`No se puede eliminar: ${used} proyecto(s) usan este modelo.`); break; }
      S.models.splice(S.models.indexOf(m), 1); S.ui.model = (S.models[0] || {}).id; changed(true); toast('Modelo eliminado.', snap); break;
    }
    case 'add-task': {
      let n = m.tasks.length + 1; while (m.tasks.some(t => t.id === 'T' + n)) n++;
      const last = m.tasks[m.tasks.length - 1];
      m.tasks.push({ id: 'T' + n, name: 'Nueva tarea', station: last ? last.station : (S.stations[0] || {}).id, skill: last ? last.skill : S.skills[0], hh: 2, cmin: 1, cmax: 2, wait: 0, preds: last ? [last.id] : [] });
      changed(true); break;
    }
    case 'del-task': { const id = m.tasks[i].id; m.tasks.splice(i, 1); m.tasks.forEach(t => (t.preds = (t.preds || []).filter(p => p !== id))); changed(true); toast(`Tarea ${id} eliminada.`, snap); break; }
    case 'add-worker': S.workers.push({ id: newId('W', S.workers), name: 'Operario nuevo', skills: [], pct: 100, active: true }); changed(true); break;
    case 'del-worker': { const n = S.workers[i].name; S.workers.splice(i, 1); changed(true); toast(`${n} eliminado del plan.`, snap); break; }
    case 'toggle-skill': {
      const w = S.workers[i]; const s = b.dataset.s; w.skills = w.skills || [];
      w.skills = w.skills.includes(s) ? w.skills.filter(x => x !== s) : [...w.skills, s];
      b.setAttribute('aria-pressed', w.skills.includes(s)); changed(false); break;
    }
    case 'del-skill': {
      const s = S.skills[i];
      const used = S.models.reduce((a, mm) => a + mm.tasks.filter(t => t.skill === s).length, 0);
      if (used) { toast(`“${s}” está en ${used} tarea(s). Cambialas antes de quitarla.`); break; }
      S.skills.splice(i, 1); S.workers.forEach(w => (w.skills = (w.skills || []).filter(x => x !== s))); changed(true); toast(`Especialidad “${s}” quitada.`, snap); break;
    }
    case 'add-station': { let n = S.stations.length + 1; while (S.stations.some(s => s.id === 'E' + n)) n++; S.stations.push({ id: 'E' + n, name: 'Nueva estación', cap: 1 }); changed(true); break; }
    case 'del-station': {
      const s = S.stations[i];
      const used = S.models.reduce((a, mm) => a + mm.tasks.filter(t => t.station === s.id).length, 0);
      if (used) { toast(`${s.id} tiene ${used} tarea(s) asignadas. Movelas a otra estación antes de eliminarla.`); break; }
      S.stations.splice(i, 1); changed(true); toast(`Estación ${s.id} eliminada.`, snap); break;
    }
    case 'suggest-crew': {
      const bb = balanceOf(m);
      Object.keys(bb.B.crew).forEach(k => (bb.B.crew[k] = 1));
      for (let it = 0; it < 200; it++) {
        const cur = balanceOf(m);
        const worst = cur.st.reduce((a, x) => (!a || x.tc > a.tc ? x : a), null);
        if (!worst || worst.tc <= cur.TT) break;
        const maxCrew = Math.max(...worst.ts.map(t => +t.cmax || 1)) * Math.max(1, worst.s.cap);
        if (cur.B.crew[worst.s.id] >= maxCrew) { toast(`${worst.s.id} no baja del takt time ni con ${maxCrew} operarios. Hay que dividir sus tareas o sumar capacidad.`); break; }
        cur.B.crew[worst.s.id]++;
      }
      changed(true); break;
    }
    case 'hours-from-cal': balanceOf(m).B.hours = Math.round(weeklyHours() * 52 / 12); changed(true); break;
    case 'copy-json': copy(JSON.stringify({ ...S, ui: undefined }, null, 2), 'Plan copiado. Pegalo en un archivo .json para guardarlo.'); break;
    case 'copy-csv': copy(csv(), 'Programa copiado en formato CSV (separado por punto y coma).'); break;
    case 'import': doImport($('#txtImport').value); break;
    case 'reset': S = clone(window.PLAN_SAMPLE); S.balance = {}; S.ui = { gantt: 'proyectos', zoom: 30, heat: 'dias', model: null, open: {} }; changed(true); $('#dlgData').close(); toast('Se restablecieron los datos de ejemplo.', snap); break;
  }
});

function copy(text, ok) {
  try {
    navigator.clipboard.writeText(text).then(() => toast(ok), () => fallbackCopy(text, ok));
  } catch (e) { fallbackCopy(text, ok); }
}
function fallbackCopy(text, ok) {
  const ta = $('#txtImport'); ta.value = text; ta.select();
  try { document.execCommand('copy'); toast(ok); } catch (e) { toast('Seleccioná el texto del recuadro y copialo con Ctrl+C.'); }
}
function csv() {
  const rows = [['Proyecto', 'Unidad', 'Código', 'Tarea', 'Estación', 'Especialidad', 'HH', 'Inicio', 'Fin mano de obra', 'Fin con espera', 'Operarios']];
  R.tasks.forEach(t => {
    if (t.start == null) return;
    rows.push([t.unit.project.name, t.unit.n, t.tpl.id, t.tpl.name, t.tpl.station, t.tpl.skill || '', String(t.hh).replace('.', ','), R.cal.dayOfSlot(t.start).iso, R.cal.dayOfSlot(Math.max(0, (t.laborEnd ?? t.end) - 1)).iso, R.cal.dayOfSlot(Math.max(0, t.end - 1)).iso, [...t.crew].map(w => R.workers[w].name).join(' / ')]);
  });
  return rows.map(r => r.map(c => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(';')).join('\n');
}
function doImport(text) {
  const msg = $('#importMsg');
  try {
    const o = JSON.parse(text);
    if (!o.calendar || !Array.isArray(o.projects) || !Array.isArray(o.models) || !Array.isArray(o.workers) || !Array.isArray(o.stations)) throw new Error('Faltan secciones: calendar, projects, models, workers o stations.');
    const snap = clone(S);
    S = o; S.skills = S.skills || []; S.balance = S.balance || {}; S.ui = { gantt: 'proyectos', zoom: 30, heat: 'dias', model: null, open: {} };
    changed(true); $('#dlgData').close(); toast('Plan cargado.', snap);
    msg.textContent = '';
  } catch (err) {
    msg.className = 'text-sm text-bad'; msg.textContent = 'No se pudo leer el plan: ' + err.message;
  }
}
$('#fileImport').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => { $('#txtImport').value = t; doImport(t); });
});
const openData = () => { $('#importMsg').textContent = ''; $('#dlgData').showModal(); };
$('#btnData').addEventListener('click', openData);
$('#saved').addEventListener('click', openData);
$('#dlgData').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === $('#dlgData')) $('#dlgData').close(); });

document.addEventListener('keydown', e => {
  const typing = e.target.closest && e.target.closest('input, textarea, select');
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); }
});
$('#btnUndo').addEventListener('click', undo);

/* ---------------- API para la sincronización en la nube ---------------- */
function notice(html) {
  const n = $('#notice');
  if (!html) { n.classList.add('hidden'); n.innerHTML = ''; return; }
  n.innerHTML = `<div class="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-4"><div class="rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm leading-relaxed">${html}</div></div>`;
  n.classList.remove('hidden');
}
window.PlanApp = {
  toast, notice,
  onChange: fn => changeListeners.push(fn),
  setStatusRenderer: fn => { statusRenderer = fn; renderSaved(); },
  refreshStatus: () => renderSaved(),
  exportState: () => { const c = clone(S); delete c.ui; return c; },
  replaceState: (data, opts) => {
    const ui = S.ui; S = clone(data); S.ui = (opts && opts.keepUi) ? ui : (S.ui || ui);
    S.balance = S.balance || {}; S.skills = S.skills || [];
    history.length = 0;
    changed(true, true, true);
  },
  setReadOnly: ro => { document.body.classList.toggle('readonly', !!ro); render(); }
};

/* ---------------- Inicio ---------------- */
recompute();
render();
renderSaved();
})();

/* ==========================================================================
   Sincronización con Supabase (proyecto ModulArq)
   - Inicio de sesión con las mismas cuentas de ModulArq (correo o usuario)
   - Un plan compartido por planta: tabla public.planner_plans, fila PLAN_ID
   - Administradores editan y guardan; operarios ven en modo lectura
   - Control de concurrencia optimista por columna version + Realtime
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.PLAN_CONFIG;
  const API = window.PlanApp;
  if (!CFG || !CFG.supabaseUrl || !window.supabase || !API) return;

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'planificador-modularq-auth' }
  });
  const PLAN_ID = CFG.planId || 'principal';

  const st = {
    session: null, profile: null, version: null, dirty: false, saving: false,
    timer: null, retry: null, lastSaved: null, channel: null, conflict: false, ownWrite: 0
  };
  const isAdmin = () => st.profile && st.profile.role === 'admin';
  const isMember = () => st.profile && ['admin', 'operario'].includes(st.profile.role);

  /* ---------------- UI: cuenta y estado ---------------- */
  const acct = $('#acct');
  acct.classList.remove('hidden');
  function renderAccount() {
    if (!st.session) {
      acct.innerHTML = `<button id="btnLogin" class="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover transition-colors">Ingresar</button>`;
      $('#btnLogin').onclick = openLogin;
      return;
    }
    const name = (st.profile && (st.profile.full_name || st.profile.email)) || st.session.user.email;
    const role = st.profile ? ({ admin: 'Administrador', operario: 'Operario', pendiente: 'Pendiente de aprobación', bloqueado: 'Bloqueado' }[st.profile.role] || st.profile.role) : '';
    acct.innerHTML = `<div class="flex items-center gap-2"><div class="hidden xl:block text-right leading-tight"><div class="text-sm font-medium truncate max-w-48">${esc(name)}</div><div class="text-xs text-ink-3">${esc(role)}</div></div><button id="btnLogout" class="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2 transition-colors" title="Cerrar sesión de ${esc(name)}">Salir</button></div>`;
    $('#btnLogout').onclick = logout;
  }
  function setStatus(kind, text) {
    const el = $('#saved'); if (!el) return;
    const icons = {
      ok: '<svg viewBox="0 0 20 20" class="w-4 h-4 text-ok" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 10.5l3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      busy: '<svg viewBox="0 0 20 20" class="w-4 h-4 text-ink-3 animate-spin" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3a7 7 0 1 1-7 7" stroke-linecap="round"/></svg>',
      warn: '<svg viewBox="0 0 20 20" class="w-4 h-4 text-warn" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 5.5v5.5M10 14.2v.1" stroke-linecap="round"/></svg>',
      bad: '<svg viewBox="0 0 20 20" class="w-4 h-4 text-bad" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 5.5v5.5M10 14.2v.1" stroke-linecap="round"/></svg>',
      read: '<svg viewBox="0 0 20 20" class="w-4 h-4 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/></svg>'
    };
    el.innerHTML = `${icons[kind]}<span>${esc(text)}</span>`;
  }
  API.setStatusRenderer(() => {
    if (!st.session) return false; // estado local por defecto
    if (!isMember()) { setStatus('warn', 'Cuenta sin acceso al plan'); return true; }
    if (!isAdmin()) { setStatus('read', 'Solo lectura (operario)'); return true; }
    if (st.conflict) setStatus('bad', 'Conflicto: otra persona guardó cambios');
    else if (st.saving) setStatus('busy', 'Guardando en la nube…');
    else if (st.dirty) setStatus(st.retry ? 'warn' : 'busy', st.retry ? 'Sin conexión: se reintentará' : 'Cambios por guardar…');
    else setStatus('ok', st.lastSaved ? `Guardado en la nube a las ${st.lastSaved.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Sincronizado con la nube');
    return true;
  });

  /* ---------------- Inicio de sesión ---------------- */
  const dlg = $('#dlgLogin');
  function openLogin() { $('#loginMsg').textContent = ''; dlg.showModal(); setTimeout(() => $('#loginUser').focus(), 30); }
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === dlg) dlg.close(); });
  $('#formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#loginSubmit'); const msg = $('#loginMsg');
    let user = $('#loginUser').value.trim(); const pass = $('#loginPass').value;
    if (!user || !pass) { msg.textContent = 'Completá el correo o usuario y la contraseña.'; return; }
    if (!user.includes('@') && CFG.usernameDomain) user = `${user}@${CFG.usernameDomain}`;
    btn.disabled = true; btn.textContent = 'Ingresando…'; msg.textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: user, password: pass });
    btn.disabled = false; btn.textContent = 'Ingresar';
    if (error) {
      msg.textContent = /invalid/i.test(error.message) ? 'El usuario o la contraseña no coinciden. Usá los mismos datos que en ModulArq.' : 'No se pudo ingresar: ' + error.message;
      return;
    }
    $('#loginPass').value = '';
    dlg.close();
  });
  async function logout() {
    await flush();
    await sb.auth.signOut();
  }

  /* ---------------- Carga y guardado ---------------- */
  async function loadProfile() {
    const uid = st.session.user.id;
    const { data, error } = await sb.from('profiles').select('role, full_name, email').eq('id', uid).maybeSingle();
    st.profile = error ? null : data;
  }
  async function loadPlan(silent) {
    const { data, error } = await sb.from('planner_plans').select('data, version, updated_at').eq('id', PLAN_ID).maybeSingle();
    if (error) { API.toast('No se pudo leer el plan de la nube: ' + error.message); return; }
    if (data) {
      st.version = data.version; st.dirty = false; st.conflict = false;
      API.replaceState(data.data, { keepUi: true });
      if (!silent) API.toast('Plan cargado desde la nube.');
    } else if (isAdmin()) {
      const plan = API.exportState();
      const { data: ins, error: e2 } = await sb.from('planner_plans').insert({ id: PLAN_ID, name: plan.planName || '', data: plan }).select('version').single();
      if (e2) { API.toast('No se pudo crear el plan en la nube: ' + e2.message); return; }
      st.version = ins.version; st.lastSaved = new Date();
      API.toast('Se creó el plan compartido en la nube con los datos actuales.');
    }
    API.refreshStatus();
  }
  function schedule() {
    if (!st.session || !isAdmin() || st.version == null || st.conflict) return;
    st.dirty = true; API.refreshStatus();
    clearTimeout(st.timer); st.timer = setTimeout(save, 1200);
  }
  async function save(force) {
    if (!st.dirty || st.saving) return;
    st.saving = true; API.refreshStatus();
    const plan = API.exportState();
    let q = sb.from('planner_plans').update({ data: plan, name: plan.planName || '' }).eq('id', PLAN_ID);
    if (!force) q = q.eq('version', st.version);
    st.ownWrite = Date.now();
    const { data, error } = await q.select('version');
    st.saving = false;
    if (error) {
      st.retry = setTimeout(() => { st.retry = null; save(); }, 10000);
      API.refreshStatus(); return;
    }
    if (!data || !data.length) { st.conflict = true; showConflict(); API.refreshStatus(); return; }
    st.version = data[0].version; st.dirty = false; st.conflict = false; st.lastSaved = new Date();
    API.refreshStatus();
  }
  async function flush() { clearTimeout(st.timer); if (st.dirty && !st.conflict) await save(); }
  function showConflict() {
    API.notice(`<b>Otra persona guardó el plan mientras editabas.</b> Elegí qué conservar: <button data-cloud="reload" class="font-semibold underline underline-offset-2">Usar la versión de la nube</button> (se pierden tus últimos cambios) o <button data-cloud="force" class="font-semibold underline underline-offset-2">Guardar la mía</button> (reemplaza la de la nube).`);
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cloud]'); if (!b) return;
    API.notice('');
    if (b.dataset.cloud === 'reload') { st.dirty = false; st.conflict = false; await loadPlan(); }
    if (b.dataset.cloud === 'force') { st.conflict = false; await save(true); }
  });
  window.addEventListener('beforeunload', e => { if (st.dirty && isAdmin()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- Tiempo real ---------------- */
  function subscribe() {
    if (st.channel) sb.removeChannel(st.channel);
    st.channel = sb.channel('planner-' + PLAN_ID)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'planner_plans', filter: `id=eq.${PLAN_ID}` }, payload => {
        const v = payload.new && payload.new.version;
        if (!v || v <= st.version) return;
        if (Date.now() - st.ownWrite < 3000 && st.saving) return;
        if (st.dirty) { st.conflict = true; showConflict(); API.refreshStatus(); return; }
        st.version = v; API.replaceState(payload.new.data, { keepUi: true });
        API.toast('Otra persona actualizó el plan: ya ves la última versión.');
      })
      .subscribe();
  }

  /* ---------------- Ciclo de sesión ---------------- */
  async function onSession(session) {
    if (session && st.session && st.session.user.id === session.user.id && st.version != null) { st.session = session; return; }
    st.session = session;
    if (!session) {
      st.profile = null; st.version = null; st.dirty = false; st.conflict = false;
      if (st.channel) { sb.removeChannel(st.channel); st.channel = null; }
      API.setReadOnly(false); renderAccount(); API.refreshStatus(); return;
    }
    await loadProfile();
    renderAccount();
    if (!isMember()) {
      API.setReadOnly(true);
      API.notice('Tu cuenta todavía no tiene acceso al plan. Pedile a un administrador de ModulArq que te asigne el rol de operario o administrador.');
      API.refreshStatus(); return;
    }
    API.notice('');
    API.setReadOnly(!isAdmin());
    await loadPlan(true);
    subscribe();
  }
  API.onChange(schedule);
  sb.auth.onAuthStateChange((evt, session) => {
    if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'INITIAL_SESSION') setTimeout(() => onSession(session), 0);
  });
  renderAccount();
})();

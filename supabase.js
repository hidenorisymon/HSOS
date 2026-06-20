const SUPABASE_URL = 'https://samuwgxtsgbkyybbfurf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhbXV3Z3h0c2dia3l5YmJmdXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjIyNzQsImV4cCI6MjA5NDE5ODI3NH0.rrAE1nzKMEKIqCqaps__qb7i8WuLuXWu8n9wE1OWkFo';

(function () {
  'use strict';

  if (!window.supabase) { console.error('[SA] Supabase CDN not loaded.'); return; }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true },
  });

  const _state = { session: null, status: null, ready: false };

  async function getStatus(session) {
    if (!session) return null;
    try {
      const resp = await fetch(
        SUPABASE_URL + '/rest/v1/profiles?select=status&id=eq.' + session.user.id + '&limit=1',
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token } }
      );
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      return data[0].status;
    } catch(e) {
      console.error('[SA] getStatus error:', e.message);
      return null;
    }
  }

  const _cleanUrl = window.location.origin + window.location.pathname;

  async function signInWithGoogle() {
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: _cleanUrl } });
    if (error) console.error('[SA] signIn error:', error.message);
  }

  async function signOut() {
    await client.auth.signOut();
    _state.session = null;
    _state.status = null;
    window.history.replaceState({}, document.title, _cleanUrl);
  }

  async function getSession() {
    const { data: { session } } = await client.auth.getSession();
    return session;
  }

  const _listeners = [];

  function onAuthStateChange(callback) {
    _listeners.push(callback);
    if (_state.ready) callback({ event: 'INITIAL', session: _state.session, status: _state.status });
  }

  function _notify(event, session, status) {
    _listeners.forEach(fn => { try { fn({ event, session, status }); } catch(e) {} });
  }

  client.auth.onAuthStateChange(async (event, session) => {
    _state.session = session;
    _state.status = await getStatus(session);
    _notify(event, session, _state.status);
  });

  (async function init() {
    // Clean the URL hash after Supabase has read the tokens (detectSessionInUrl:true handles extraction)
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      window.history.replaceState({}, document.title, _cleanUrl);
    }
    // Give Supabase a tick to finish processing the hash before we call getSession
    await new Promise(r => setTimeout(r, 50));
    if (!_state.session) {
      const session = await getSession();
      _state.session = session;
      _state.status = await getStatus(session);
    }
    _state.ready = true;
    _notify('INITIAL', _state.session, _state.status);
  })();

  // ===== Phase 2a: Supabase data mirror =====
  // Writes a copy of localStorage data up to Supabase. Reads stay on localStorage
  // (window.storage.get returns null) so the app behaves exactly as before. Fail-safe:
  // pe()/se() wrap these in try/catch and still use localStorage if anything errors.
  const _V = {
    entries:'bd-e5', cats:'bd-c5', tags:'bd-t5', chat:'bd-ch5', docs:'bd-d5',
    dark:'bd-dk5', notifs:'bd-n5', review:'bd-r5', recur:'bd-rc5',
    dinstr:'bd-di5', winstr:'bd-wi5', tokens:'bd-tok5', expenses:'bd-exp5'
  };
  let _ws = null, _wsPromise = null;
  async function _getWorkspace() {
    if (_ws) return _ws;
    if (!_state.session) return null;
    if (!_wsPromise) _wsPromise = (async () => {
      try {
        const r = await client.from('workspaces').select('id').eq('owner_id', _state.session.user.id).limit(1);
        if (r.data && r.data.length) return (_ws = r.data[0].id);
        const m = await client.from('workspace_members').select('workspace_id').limit(1);
        if (m.data && m.data.length) return (_ws = m.data[0].workspace_id);
      } catch (e) { console.warn('[SA] workspace lookup:', e.message); }
      return null;
    })();
    return _wsPromise;
  }
  const _iso = (v) => { try { return new Date(v || Date.now()).toISOString(); } catch (e) { return new Date().toISOString(); } };
  const _today = () => new Date().toISOString().slice(0, 10);
  function _taskRows(ws, b) {
    const out = [];
    if (b && typeof b === 'object') for (const cat of Object.keys(b)) (b[cat] || []).forEach((t, i) => {
      if (t && t.id) out.push({ id: String(t.id), workspace_id: ws, text: t.text || '', notes: t.notes || '',
        category: t.category || cat, status: t.status || 'todo', priority: t.priority || '',
        due_date: t.dueDate || null, tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
        sort_order: i, created_at: _iso(t.createdAt) });
    });
    return out;
  }
  function _catRows(ws, b) { return (Array.isArray(b) ? b : []).filter(c => c && c.id).map((c, i) => ({
    id: String(c.id), workspace_id: ws, emoji: c.emoji || null, label: c.label || '', color: c.color || null,
    sort_order: i, is_default: !!c.is_default, created_at: _iso(c.createdAt) })); }
  function _tagRows(ws, b) { return (Array.isArray(b) ? b : []).filter(t => t && t.id).map(t => ({
    id: String(t.id), workspace_id: ws, label: t.label || '', color: t.color || null })); }
  function _txnRows(ws, b) {
    const out = []; const add = (arr, type) => (arr || []).forEach(t => { if (t && t.id) out.push({
      id: String(t.id), workspace_id: ws, type: type, amount: Number(t.amount) || 0, category: t.category || null,
      subcategory: t.subcategory || null, description: t.description || '', date: t.date || _today(), created_at: _iso(t.createdAt) }); });
    add(b && b.expenses, 'expense'); add(b && b.income, 'income'); return out;
  }
  function _streamRows(ws, b) { return ((b && b.streams) || []).filter(s => s && s.id).map(s => ({
    id: String(s.id), workspace_id: ws, type: s.type || null, label: s.label || null, category: s.category || null,
    subcategory: s.subcategory || null, amount: Number(s.amount) || 0, created_at: _iso(s.createdAt) })); }
  function _budgetRows(ws, b) { const o = (b && b.budgets) || {}; return Object.keys(o).map(cat => ({
    workspace_id: ws, category: cat, amount: Number(o[cat]) || 0 })); }
  async function _syncTable(table, ws, rows, keyField) {
    keyField = keyField || 'id';
    const keys = rows.map(r => String(r[keyField]));
    if (rows.length) { const { error } = await client.from(table).upsert(rows, { onConflict: 'workspace_id,' + keyField }); if (error) throw error; }
    const { data: existing, error: e1 } = await client.from(table).select(keyField).eq('workspace_id', ws);
    if (e1) throw e1;
    const toDel = (existing || []).map(r => String(r[keyField])).filter(k => keys.indexOf(k) === -1);
    if (toDel.length) { const { error: e2 } = await client.from(table).delete().eq('workspace_id', ws).in(keyField, toDel); if (e2) throw e2; }
  }
  async function _syncSettings(patch) {
    const { error } = await client.from('user_settings').upsert(
      Object.assign({ user_id: _state.session.user.id, updated_at: new Date().toISOString() }, patch), { onConflict: 'user_id' });
    if (error) throw error;
  }
  async function _mirror(key, blob) {
    const ws = await _getWorkspace();
    if (!ws) return;
    if (key === _V.entries) await _syncTable('tasks', ws, _taskRows(ws, blob));
    else if (key === _V.cats) await _syncTable('categories', ws, _catRows(ws, blob));
    else if (key === _V.tags) await _syncTable('tags', ws, _tagRows(ws, blob));
    else if (key === _V.expenses) {
      await _syncTable('transactions', ws, _txnRows(ws, blob));
      await _syncTable('streams', ws, _streamRows(ws, blob));
      await _syncTable('budgets', ws, _budgetRows(ws, blob), 'category');
    }
    else if (key === _V.dark) await _syncSettings({ dark_mode: !!blob });
    else if (key === _V.dinstr) await _syncSettings({ daily_instructions: blob || '' });
    else if (key === _V.winstr) await _syncSettings({ weekly_instructions: blob || '' });
    // chat / docs / notifs / review / recur / tokens: still safe in localStorage; mirrored in a later step
  }
  async function debugMirror() {
    const out = { loggedIn: !!_state.session, userId: (_state.session && _state.session.user && _state.session.user.id) || null };
    try {
      const ws = await _getWorkspace();
      out.workspace = ws || null;
      if (!ws) { out.problem = 'no workspace found for this user'; }
      else {
        const row = { id: 'dbg-' + Date.now(), workspace_id: ws, text: 'debug test', notes: '', category: 'todo',
          status: 'todo', priority: '', due_date: null, tags: [], sort_order: 0, created_at: new Date().toISOString() };
        const ins = await client.from('tasks').insert(row);
        out.insert = ins.error ? ('ERROR: ' + ins.error.message + ' | code=' + (ins.error.code || '') + ' | details=' + (ins.error.details || '') + ' | hint=' + (ins.error.hint || '')) : 'OK';
        const c = await client.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
        out.tasksCount = c.error ? ('countERROR: ' + c.error.message) : c.count;
      }
    } catch (e) { out.threw = (e && e.message) || String(e); }
    console.log('[SA][debug] ' + JSON.stringify(out));
    return out;
  }

  window.storage = {
    get: async function () { return null; }, // mirror-first: app keeps reading localStorage
    set: async function (key, jsonStr) {
      try { await _mirror(key, JSON.parse(jsonStr)); }
      catch (e) { console.warn('[SA] mirror failed for', key, e && e.message); }
    }
  };
  let _migrated = false;
  async function _migrateOnce() {
    if (_migrated || localStorage.getItem('bd-mirror-v1')) return;
    _migrated = true;
    const ws = await _getWorkspace();
    if (!ws) { _migrated = false; return; }
    for (const k of [_V.entries, _V.cats, _V.tags, _V.expenses, _V.dark, _V.dinstr, _V.winstr]) {
      try { const v = localStorage.getItem(k); if (v != null) await _mirror(k, JSON.parse(v)); }
      catch (e) { console.warn('[SA] migrate', k, e && e.message); }
    }
    localStorage.setItem('bd-mirror-v1', '1');
    console.log('[SA] initial cloud mirror complete');
  }
  client.auth.onAuthStateChange((_e, session) => { if (session) _migrateOnce(); });

  window.SupabaseAuth = { signInWithGoogle, signOut, getSession, getStatus, onAuthStateChange, _state, debugMirror, _client: client };
})();

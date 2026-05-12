const SUPABASE_URL = 'https://samuwgxtsgbkyybbfurf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhbXV3Z3h0c2dia3l5YmJmdXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjIyNzQsImV4cCI6MjA5NDE5ODI3NH0.rrAE1nzKMEKIqCqaps__qb7i8WuLuXWu8n9wE1OWkFo';

(function () {
  'use strict';

  if (!window.supabase) { console.error('[SupabaseAuth] Supabase client not found.'); return; }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true },
  });

  const _state = { session: null, status: null, ready: false };

  async function getStatus(session) {
    if (!session) return null;
    const { data, error } = await client.from('profiles').select('status').eq('id', session.user.id).single();
    if (error) { console.error('[SupabaseAuth] profiles error:', error.message); return null; }
    return data.status;
  }

  const _cleanUrl = window.location.origin + window.location.pathname;

  async function signInWithGoogle() {
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: _cleanUrl } });
    if (error) console.error('[SupabaseAuth] signIn error:', error.message);
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
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const p = new URLSearchParams(hash.substring(1));
      const at = p.get('access_token');
      const rt = p.get('refresh_token');
      if (at && rt) {
        const { data, error } = await client.auth.setSession({ access_token: at, refresh_token: rt });
        if (!error && data.session) {
          _state.session = data.session;
          _state.status = await getStatus(data.session);
        }
      }
      window.history.replaceState({}, document.title, _cleanUrl);
    }
    if (!_state.session) {
      const session = await getSession();
      _state.session = session;
      _state.status = await getStatus(session);
    }
    _state.ready = true;
    _notify('INITIAL', _state.session, _state.status);
  })();

  window.SupabaseAuth = { signInWithGoogle, signOut, getSession, getStatus, onAuthStateChange, _state };
})();

const SUPABASE_URL = 'https://samuwgxtsgbkyybbfurf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhbXV3Z3h0c2dia3l5YmJmdXJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjIyNzQsImV4cCI6MjA5NDE5ODI3NH0.rrAE1nzKMEKIqCqaps__qb7i8WuLuXWu8n9wE1OWkFo';

console.clear = function() {};

(function () {
  'use strict';

  if (!window.supabase) { console.error('[SA] Supabase CDN not loaded.'); return; }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true },
  });

  const _state = { session: null, status: null, ready: false };

  async function getStatus(session) {
    if (!session) return null;
    try {
      console.log('[SA] fetching profile...');
      const resp = await fetch(
        SUPABASE_URL + '/rest/v1/profiles?select=status&id=eq.' + session.user.id + '&limit=1',
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token } }
      );
      const data = await resp.json();
      console.log('[SA] profile data:', JSON.stringify(data));
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
    console.log('[SA] authStateChange:', event, session ? session.user.email : 'null');
    _state.session = session;
    _state.status = await getStatus(session);
    console.log('[SA] status:', _state.status);
    _notify(event, session, _state.status);
  });

  (async function init() {
    console.log('[SA] init, hash:', window.location.hash ? 'present' : 'empty');
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const p = new URLSearchParams(hash.substring(1));
      const at = p.get('access_token');
      const rt = p.get('refresh_token');
      if (at && rt) {
        const { data, error } = await client.auth.setSession({ access_token: at, refresh_token: rt });
        console.log('[SA] setSession:', error ? error.message : 'ok');
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
    console.log('[SA] ready. session:', _state.session ? _state.session.user.email : 'none', 'status:', _state.status);
    _state.ready = true;
    _notify('INITIAL', _state.session, _state.status);
  })();

  window.SupabaseAuth = { signInWithGoogle, signOut, getSession, getStatus, onAuthStateChange, _state };
  console.log('[SA] module loaded.');
})();

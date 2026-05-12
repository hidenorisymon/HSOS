const SUPABASE_URL = 'https://samuwgxtsgbkyybbfurf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Y4Aw_FZ1fMrlZAhYiRRiWg_HPW1kwIp';

(function () {
  'use strict';

  if (!window.supabase) {
    console.error('[SupabaseAuth] Supabase client not found.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true },
  });

  const _state = { session: null, status: null, ready: false };

  async function getStatus(session) {
    if (!session) return null;
    const { data, error } = await client
      .from('profiles')
      .select('status')
      .eq('id', session.user.id)
      .single();
    if (error) { console.error('[SupabaseAuth] profiles error:', error.message); return null; }
    return data.status;
  }

  const _cleanUrl = window.location.origin + window.location.pathname;

  async function signInWithGoogle() {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: _cleanUrl },
    });
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
    console.log('[SupabaseAuth] authStateChange:', event, session ? session.user.email : 'null');
    _state.session = session;
    _state.status = await getStatus(session);
    console.log('[SupabaseAuth] status:', _state.status);
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
        console.log('[SupabaseAuth] setSession:', error ? 'ERROR:' + error.message : 'ok');
        if (!error && data.session) {
          _state.session = data.session;
          _state.status = await getStatus(data.session);
          console.log('[SupabaseAuth] status from hash:', _state.status);
        }
      }
      window.history.replaceState({}, document.title, _cleanUrl);
    }

    if (!_state.session) {
      const session = await getSession();
      _state.session = session;
      _state.status = await getStatus(session);
    }

    console.log('[SupabaseAuth] ready, session:', _state.session ? _state.session.user.email : 'null', 'status:', _state.status);
    _state.ready = true;
    _notify('INITIAL', _state.session, _state.status);
  })();

  window.SupabaseAuth = { signInWithGoogle, signOut, getSession, getStatus, onAuthStateChange, _state };
  console.log('[SupabaseAuth] module loaded.');
})();

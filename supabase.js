// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Fill in your Supabase project values before loading this file.
const SUPABASE_URL = 'https://samuwgxtsgbkyybbfurf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Y4Aw_FZ1fMrlZAhYiRRiWg_HPW1kwIp';
// ──────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  if (!window.supabase) {
    console.error('[SupabaseAuth] Supabase client not found. Load the Supabase CDN script before supabase.js.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true },
  });

  const _state = {
    session: null,
    status: null,
    ready: false,
  };

  // ── Profiles table ──────────────────────────────────────────────────────────

  async function getStatus() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;

    const { data, error } = await client
      .from('profiles')
      .select('status')
      .eq('id', session.user.id)
      .single();

    if (error) {
      console.error('[SupabaseAuth] profiles lookup failed:', error.message);
      return null;
    }
    return data.status;
  }

  // ── Auth actions ────────────────────────────────────────────────────────────

  // Use the clean page URL (no stale query params or hash from previous attempts)
  const _cleanUrl = window.location.origin + window.location.pathname;

  async function signInWithGoogle() {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: _cleanUrl },
    });
    if (error) console.error('[SupabaseAuth] signInWithGoogle failed:', error.message);
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) console.error('[SupabaseAuth] signOut failed:', error.message);
    _state.session = null;
    _state.status = null;
    // Clean up URL after sign out
    window.history.replaceState({}, document.title, _cleanUrl);
  }

  async function getSession() {
    const { data: { session } } = await client.auth.getSession();
    return session;
  }

  // ── Auth state listener ─────────────────────────────────────────────────────

  const _listeners = [];

  function onAuthStateChange(callback) {
    _listeners.push(callback);
    if (_state.ready) {
      callback({ event: 'INITIAL', session: _state.session, status: _state.status });
    }
  }

  function _notify(event, session, status) {
    _listeners.forEach(fn => {
      try { fn({ event, session, status }); }
      catch (e) { console.error('[SupabaseAuth] listener error:', e); }
    });
  }

  client.auth.onAuthStateChange(async (event, session) => {
    _state.session = session;
    const status = session ? await getStatus() : null;
    _state.status = status;
    _notify(event, session, status);
  });

  // ── Initialise on load ──────────────────────────────────────────────────────
  // Manually extract tokens from the URL hash to bypass the bad_oauth_state
  // error that occurs when Supabase's state check fails on static sites.

  (async function init() {
    const hash = window.location.hash;
    console.log('[SupabaseAuth] hash:', hash ? hash.substring(0, 40) : 'empty');
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      console.log('[SupabaseAuth] tokens found, calling setSession...');
      if (accessToken && refreshToken) {
        const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        console.log('[SupabaseAuth] setSession:', error ? 'ERROR: ' + error.message : 'ok, user: ' + (data.session ? data.session.user.email : 'null'));
      }
      window.history.replaceState({}, document.title, _cleanUrl);
    }
    const session = await getSession();
    console.log('[SupabaseAuth] getSession:', session ? session.user.email : 'null');
    _state.session = session;
    _state.status = session ? await getStatus() : null;
    console.log('[SupabaseAuth] status:', _state.status);
    _state.ready = true;
    _notify('INITIAL', _state.session, _state.status);
  })();

  // ── Public API ──────────────────────────────────────────────────────────────

  window.SupabaseAuth = {
    signInWithGoogle,
    signOut,
    getSession,
    getStatus,
    onAuthStateChange,
    _state,
  };

  console.log('[SupabaseAuth] module loaded.');
})();

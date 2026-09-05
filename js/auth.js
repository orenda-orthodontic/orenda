// auth.js — تسجيل الدخول والجلسة (Auth)
// ============ AUTH (Supabase login — required so the data/photos aren't reachable by anyone who just gets the .html file) ============
let authSession = null; // {access_token, refresh_token, expires_at, email}

function loadStoredSession(){
  try{
    const raw = localStorage.getItem('orenda_auth_session');
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function storeSession(session){
  authSession = session;
  try{
    if(session) localStorage.setItem('orenda_auth_session', JSON.stringify(session));
    else localStorage.removeItem('orenda_auth_session');
  }catch(e){ console.error('could not persist session', e); }
}

async function supabaseLogin(email, password){
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error_description || data.msg || 'الإيميل أو الباسورد غلط');
  storeSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in*1000),
    email
  });
}

async function supabaseRefreshSession(){
  if(!authSession || !authSession.refresh_token) return false;
  try{
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: authSession.refresh_token })
    });
    const data = await res.json();
    if(!res.ok) return false;
    storeSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in*1000),
      email: authSession.email
    });
    return true;
  }catch(e){
    console.error('session refresh failed', e);
    return false;
  }
}

// call before any Supabase request — refreshes the login token if it's about to expire
async function ensureFreshSession(){
  if(!authSession) return false;
  if(Date.now() > authSession.expires_at - 60000){
    return await supabaseRefreshSession();
  }
  return true;
}

function supabaseLogout(){
  storeSession(null);
  location.reload();
}

// same signatures as the old IndexedDB helpers on purpose, so getData/setData below
// (and everything that calls them) didn't need to change at all.
async function idbGet(key){
  await ensureFreshSession();
  const res = await fetch(SUPABASE_REST + '?key=eq.' + encodeURIComponent(key) + '&select=value', {
    headers: supabaseHeaders()
  });
  if(!res.ok) throw new Error('Supabase get failed: ' + res.status);
  const rows = await res.json();
  if(!rows.length) return null;
  return JSON.stringify(rows[0].value); // getData() below expects a JSON string, same as before
}

async function idbSet(key, value, attempt){
  attempt = attempt || 1;
  await ensureFreshSession();
  // value arrives already JSON.stringify()'d by setData(); kv_store.value is jsonb so we parse it back
  let res;
  try{
    res = await fetch(SUPABASE_REST, {
      method: 'POST',
      headers: supabaseHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify([{ key, value: JSON.parse(value), updated_at: new Date().toISOString() }])
    });
  }catch(networkErr){
    // fetch itself threw (device offline, DNS hiccup, request timed out mid-flight...) — most
    // "حصلت مشكلة حاول مرة أخرى" reports turn out to be exactly this kind of transient blip,
    // so retry once immediately before treating it as a real failure
    if(attempt < 2){
      await new Promise(r=>setTimeout(r, 600));
      return idbSet(key, value, attempt + 1);
    }
    throw networkErr;
  }
  if(!res.ok){
    let bodyText = '';
    try{ bodyText = await res.text(); }catch(e){ /* ignore */ }
    console.error('Supabase set failed', key, res.status, bodyText);
    if(attempt < 2 && res.status >= 500){
      await new Promise(r=>setTimeout(r, 600));
      return idbSet(key, value, attempt + 1);
    }
    throw new Error('Supabase set failed: ' + res.status + (bodyText ? ' — ' + bodyText.slice(0,200) : ''));
  }
  return true;
}

async function idbListKeys(){
  await ensureFreshSession();
  const res = await fetch(SUPABASE_REST + '?select=key', { headers: supabaseHeaders() });
  if(!res.ok) throw new Error('Supabase list failed: ' + res.status);
  const rows = await res.json();
  return rows.map(r => r.key);
}

async function getData(key, fallback){
  try{
    const v = await idbGet(key);
    return (v !== null && v !== undefined) ? JSON.parse(v) : fallback;
  }catch(e){
    console.error('storage get failed', key, e);
    return fallback;
  }
}

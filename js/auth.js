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

// keys where two devices writing at once can silently wipe each other's data — every save to
// one of these first checks the server's updated_at against the last one we saw; if someone
// else saved in between, we refuse to overwrite blindly instead of erasing their change.
const CONCURRENCY_KEYS = ['inventory', 'clinics', 'inventoryCategories'];
// patient files are saved as ONE whole-object write per save (savePatientFile) covering every
// tab together (diagnosis/monthly/photos/finance/...) — with the same clinic worked from more
// than one device/staff member, two edits to different tabs of the SAME patient landing close
// together would otherwise silently overwrite each other with no warning (last write wins).
// Protect every patientfile:<id> key the same way as the fixed keys above, instead of having to
// list each patient id individually.
function isConcurrencyProtectedKey(key){
  return CONCURRENCY_KEYS.includes(key) || key.indexOf('patientfile:') === 0;
}
const _lastKnownUpdatedAt = {}; // key -> updated_at string we last saw from the server

class ConcurrencyConflictError extends Error {
  constructor(key){
    super('Concurrent edit detected for key: ' + key);
    this.name = 'ConcurrencyConflictError';
    this.conflictKey = key;
  }
}

async function checkConcurrencyConflict(key){
  try{
    const res = await fetch(SUPABASE_REST + '?key=eq.' + encodeURIComponent(key) + '&select=updated_at', {
      headers: supabaseHeaders()
    });
    if(!res.ok) return false; // don't block the save just because the pre-check itself failed
    const rows = await res.json();
    if(!rows.length) return false; // key doesn't exist yet on the server — nothing to conflict with
    const serverUpdatedAt = rows[0].updated_at;
    const known = _lastKnownUpdatedAt[key];
    if(!known || !serverUpdatedAt) return false;
    // Compare actual points in time, not raw strings — the value we set locally right after a
    // successful write (JS's own toISOString(), e.g. "...123Z") and the same instant read back
    // later from Postgres/PostgREST (commonly serialized as "...123+00:00", sometimes with extra
    // precision digits) represent the SAME moment but are different strings. A strict `!==`
    // string compare treated that as "someone else edited it" on effectively every save after
    // the first, silently discarding the user's own just-made edit and replacing it with the
    // (older) server copy. Parsing both into real timestamps avoids that false positive while
    // still catching a genuine conflict (an actually different save time).
    return new Date(known).getTime() !== new Date(serverUpdatedAt).getTime();
  }catch(e){
    console.error('concurrency check failed', key, e);
    return false; // fail open
  }
}

// same signatures as the old IndexedDB helpers on purpose, so getData/setData below
// (and everything that calls them) didn't need to change at all.
async function idbGet(key){
  await ensureFreshSession();
  const res = await fetch(SUPABASE_REST + '?key=eq.' + encodeURIComponent(key) + '&select=value,updated_at', {
    headers: supabaseHeaders()
  });
  if(!res.ok) throw new Error('Supabase get failed: ' + res.status);
  const rows = await res.json();
  if(!rows.length) return null;
  if(isConcurrencyProtectedKey(key)) _lastKnownUpdatedAt[key] = rows[0].updated_at;
  return JSON.stringify(rows[0].value); // getData() below expects a JSON string, same as before
}

async function idbSet(key, value, attempt){
  attempt = attempt || 1;
  await ensureFreshSession();

  if(isConcurrencyProtectedKey(key) && attempt === 1){
    const conflict = await checkConcurrencyConflict(key);
    if(conflict) throw new ConcurrencyConflictError(key);
  }

  // value arrives already JSON.stringify()'d by setData(); kv_store.value is jsonb so we parse it back
  const nowIso = new Date().toISOString();
  let res;
  try{
    res = await fetch(SUPABASE_REST, {
      method: 'POST',
      headers: supabaseHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify([{ key, value: JSON.parse(value), updated_at: nowIso }])
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
  if(isConcurrencyProtectedKey(key)) _lastKnownUpdatedAt[key] = nowIso;
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
    const parsed = (v !== null && v !== undefined) ? JSON.parse(v) : fallback;
    // deep clone — `parsed` is about to be returned and become the live, in-place-mutated
    // state object (e.g. state.currentPatientFile); _lastKnownValues must stay an independent
    // snapshot or later edits would silently corrupt this "previous value" baseline (see the
    // note above the _lastKnownValues declaration in storage.js)
    _lastKnownValues[key] = deepClone(parsed); // so the first edit after boot has a real "previous value" to undo to
    return parsed;
  }catch(e){
    console.error('storage get failed', key, e);
    return fallback;
  }
}

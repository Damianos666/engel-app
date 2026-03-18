export const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SB_URL || !SB_ANON) {
  console.error(
    "[Supabase] BŁĄD KONFIGURACJI: Brakuje zmiennych środowiskowych!\n" +
    "Ustaw VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY w Vercel → Project Settings → Environment Variables.\n" +
    `SB_URL: ${SB_URL ?? "BRAK"}, SB_ANON: ${SB_ANON ? "OK" : "BRAK"}`
  );
}

export const authHeaders = (token) => ({
  "apikey": SB_ANON,
  "Authorization": `Bearer ${token || SB_ANON}`,
  "Content-Type": "application/json",
});

/* ─── SESSION STORAGE ────────────────────────────────────────────────────── */
// BEZPIECZEŃSTWO: access_token żyje TYLKO w pamięci RAM.
// W localStorage zapisujemy wyłącznie refresh_token + minimalne dane usera.
// Przy XSS atakujący nie może wyciągnąć access_token z localStorage.
const SESSION_KEY = "eea_session";
let _memoryToken = null;

export const session = {
  save: (accessToken, refreshToken, user) => {
    _memoryToken = accessToken;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ refreshToken, user }));
    } catch {}
  },
  load: () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  clear: () => {
    _memoryToken = null;
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  },
  getToken: () => _memoryToken,
  setToken: (t) => { _memoryToken = t; },
};

/* ─── AUTH ───────────────────────────────────────────────────────────────── */
export const auth = {
  signUp: async (email, password) => {
    const r = await fetch(`${SB_URL}/auth/v1/signup`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.msg || d.error_description || "Błąd rejestracji");
    return d;
  },

  signIn: async (email, password) => {
    if (!SB_URL) throw new Error("Błąd konfiguracji aplikacji — skontaktuj się z administratorem.");
    let r;
    try {
      r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error("Brak połączenia z serwerem. Sprawdź internet lub spróbuj ponownie.");
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || "Nieprawidłowy e-mail lub hasło");
    return d;
  },

  refreshSession: async (refreshToken) => {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || "Sesja wygasła");
    return d;
  },

  signOut: async (token) => {
    session.clear();
    await fetch(`${SB_URL}/auth/v1/logout`, {
      method: "POST", headers: authHeaders(token),
    });
  },

  recover: async (email) => {
    const r = await fetch(`${SB_URL}/auth/v1/recover`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ email }),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.msg || "Błąd"); }
  },
};

/* ─── AUTO-REFRESH ───────────────────────────────────────────────────────── */
let _onTokenRefreshed = null;
export const setOnTokenRefreshed = (fn) => { _onTokenRefreshed = fn; };

const isJwtExpired = (text) => {
  try {
    const json = JSON.parse(text);
    return json?.code === "PGRST303" || json?.message === "JWT expired";
  } catch { return false; }
};

// Wykonuje fetch, a jeśli odpowiedź to JWT expired — odświeża token i ponawia.
// Zwraca zawsze gotowy Response (do dalszego .json() lub .text()).
const fetchWithRefresh = async (url, options, token) => {
  const r = await fetch(url, { ...options, headers: { ...options.headers } });
  if (r.status !== 401) return r;                        // nie 401 → zwróć od razu
  const text = await r.text();
  if (!isJwtExpired(text)) { throw new Error(text); }   // 401 ale nie JWT → rzuć błąd

  // JWT expired — odśwież token
  const saved = session.load();
  if (!saved?.refreshToken) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  let newToken;
  try {
    const refreshed = await auth.refreshSession(saved.refreshToken);
    session.save(refreshed.access_token, refreshed.refresh_token, refreshed.user);
    newToken = refreshed.access_token;
    if (_onTokenRefreshed) _onTokenRefreshed(newToken);
  } catch {
    session.clear();
    throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }
  // Ponów request z nowym tokenem
  return fetch(url, {
    ...options,
    headers: { ...options.headers, "Authorization": `Bearer ${newToken}` },
  });
};

/* ─── DB ─────────────────────────────────────────────────────────────────── */
export const db = {
  get: async (token, table, query = "", { signal } = {}) => {
    const r = await fetchWithRefresh(
      `${SB_URL}/rest/v1/${table}?${query}`,
      { headers: authHeaders(token), signal },
      token
    );
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  insert: async (token, table, data, { signal } = {}) => {
    const h = { ...authHeaders(token), "Prefer": "return=representation" };
    const r = await fetchWithRefresh(
      `${SB_URL}/rest/v1/${table}`,
      { method: "POST", headers: h, body: JSON.stringify(data), signal },
      token
    );
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  update: async (token, table, match, data, { signal } = {}) => {
    const h = { ...authHeaders(token), "Prefer": "return=representation" };
    const r = await fetchWithRefresh(
      `${SB_URL}/rest/v1/${table}?${match}`,
      { method: "PATCH", headers: h, body: JSON.stringify(data), signal },
      token
    );
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  remove: async (token, table, match, { signal } = {}) => {
    const h = { ...authHeaders(token), "Prefer": "return=representation" };
    const r = await fetchWithRefresh(
      `${SB_URL}/rest/v1/${table}?${match}`,
      { method: "DELETE", headers: h, signal },
      token
    );
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  upsert: async (token, table, data, onConflict, { signal } = {}) => {
    const h = { ...authHeaders(token), "Prefer": "resolution=merge-duplicates,return=representation" };
    const url = onConflict
      ? `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`
      : `${SB_URL}/rest/v1/${table}`;
    const r = await fetchWithRefresh(url, { method: "POST", headers: h, body: JSON.stringify(data), signal }, token);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

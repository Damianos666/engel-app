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
// Callback wywoływany przez App.jsx po odświeżeniu sesji.
// Pozwala db._withRefresh() zaktualizować token w globalnym stanie React.
let _onTokenRefreshed = null;
export const setOnTokenRefreshed = (fn) => { _onTokenRefreshed = fn; };

// Sprawdza czy błąd to wygaśnięcie JWT (kod PGRST303 lub komunikat "JWT expired").
const isJwtExpired = (text) => {
  try {
    const json = JSON.parse(text);
    return json?.code === "PGRST303" || json?.message === "JWT expired";
  } catch { return text?.includes("JWT expired"); }
};

// Wrapper który przy JWT expired automatycznie odświeża token i ponawia request.
// initialToken — token przekazany do db.get/insert/etc. Używamy go jako primary,
// session.getToken() tylko jako fallback (np. gdy komponent nie ma aktualnego tokenu).
const _withRefresh = async (initialToken, fn) => {
  const result = await fn(initialToken || session.getToken());
  if (!result._expired) return result;

  // Token wygasł — próbuj odświeżyć
  const saved = session.load();
  if (!saved?.refreshToken) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  try {
    const refreshed = await auth.refreshSession(saved.refreshToken);
    session.save(refreshed.access_token, refreshed.refresh_token, refreshed.user);
    if (_onTokenRefreshed) _onTokenRefreshed(refreshed.access_token);
    // Ponów oryginalny request z nowym tokenem
    return fn(refreshed.access_token);
  } catch {
    session.clear();
    throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }
};

/* ─── DB ─────────────────────────────────────────────────────────────────── */
// OPTYMALIZACJA: Wszystkie metody przyjmują opcjonalny { signal } z AbortController.
// Dzięki temu komponenty mogą anulować in-flight requesty przy odmontowaniu,
// eliminując memory leaks i błędy "Can't perform a React state update on unmounted component".
//
// AUTO-REFRESH: Każda metoda używa _withRefresh() — przy błędzie JWT expired
// token jest automatycznie odnawiany i request ponowiony. Użytkownik nie widzi błędu.
//
// Użycie w komponencie:
//   useEffect(() => {
//     const ctrl = new AbortController();
//     db.get(token, "messages", "...", { signal: ctrl.signal })
//       .then(setMessages).catch(e => { if (e.name !== "AbortError") setErr(e.message); });
//     return () => ctrl.abort();
//   }, [token]);
export const db = {
  get: (token, table, query = "", { signal } = {}) =>
    _withRefresh(token, async (t) => {
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
        headers: authHeaders(t), signal,
      });
      const text = await r.text();
      if (!r.ok) {
        if (isJwtExpired(text)) return { _expired: true };
        throw new Error(text);
      }
      return JSON.parse(text);
    }),

  insert: (token, table, data, { signal } = {}) =>
    _withRefresh(token, async (t) => {
      const h = { ...authHeaders(t), "Prefer": "return=representation" };
      const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
        method: "POST", headers: h, body: JSON.stringify(data), signal,
      });
      const text = await r.text();
      if (!r.ok) {
        if (isJwtExpired(text)) return { _expired: true };
        throw new Error(text);
      }
      return JSON.parse(text);
    }),

  update: (token, table, match, data, { signal } = {}) =>
    _withRefresh(token, async (t) => {
      const h = { ...authHeaders(t), "Prefer": "return=representation" };
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${match}`, {
        method: "PATCH", headers: h, body: JSON.stringify(data), signal,
      });
      const text = await r.text();
      if (!r.ok) {
        if (isJwtExpired(text)) return { _expired: true };
        throw new Error(text);
      }
      return JSON.parse(text);
    }),

  remove: (token, table, match, { signal } = {}) =>
    _withRefresh(token, async (t) => {
      const h = { ...authHeaders(t), "Prefer": "return=representation" };
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${match}`, {
        method: "DELETE", headers: h, signal,
      });
      const text = await r.text();
      if (!r.ok) {
        if (isJwtExpired(text)) return { _expired: true };
        throw new Error(text);
      }
      return JSON.parse(text);
    }),

  upsert: (token, table, data, onConflict, { signal } = {}) =>
    _withRefresh(token, async (t) => {
      const h = {
        ...authHeaders(t),
        "Prefer": "resolution=merge-duplicates,return=representation",
      };
      const url = onConflict
        ? `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`
        : `${SB_URL}/rest/v1/${table}`;
      const r = await fetch(url, {
        method: "POST", headers: h, body: JSON.stringify(data), signal,
      });
      const text = await r.text();
      if (!r.ok) {
        if (isJwtExpired(text)) return { _expired: true };
        throw new Error(text);
      }
      return JSON.parse(text);
    }),
};

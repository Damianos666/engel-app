import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const BUILD_TIME = __BUILD_TIME__;
const STORED_KEY = 'eaa_build_v';
const ROLE_KEY   = 'eea_role';

// ─── ROLA-BASED PRELOAD ────────────────────────────────────────────────────
// Startuje ZANIM React się zamontuje — równolegle z checkVersion() i session
// restore w Supabase. Przeglądarka pobiera chunki w tle; gdy App.jsx skończy
// sprawdzać token, pliki są już w cache i Suspense nie pokazuje spinnera.
//
// eea_role jest zapisywane przez session.saveRole() po handleLogin.
// Przy pierwszym logowaniu rola jest nieznana — preload się nie uruchamia,
// ale chunki i tak są pobierane przy montowaniu komponentów (lazy + Suspense).
(function preloadRoleChunks() {
  try {
    const role = localStorage.getItem(ROLE_KEY);
    if (!role) return;

    if (role === 'admin') {
      // Admin — preload tylko panel admina, reszta niepotrzebna
      import('./components/admin/AdminPanel.jsx');
    } else if (role === 'trainer') {
      // Trener — preload jego terminarza i shared tabów
      import('./components/TrainerScheduleTab.jsx');
      import('./components/MessagesTab.jsx');
      import('./components/ProfileTab.jsx');
    } else {
      // Klient — preload tab 0 i tab 1 (najczęściej odwiedzane)
      import('./components/TrainingTab.jsx');
      import('./components/CatalogTab.jsx');
    }
  } catch {}
})();

// ─── WERSJA / UPDATE ──────────────────────────────────────────────────────
// ZMIANA vs oryginał: NIE kasujemy już wszystkich cache przy każdym deploy.
//
// Poprzednie zachowanie: każdy build → caches.delete(wszystko) → Workbox
// musiał pobierać WSZYSTKIE pliki od nowa, niwelując benefit chunked caching.
//
// Nowe zachowanie: Workbox sam wykrywa zmienione chunki (content hash w nazwie
// pliku) i pobiera TYLKO je. checkVersion() robi teraz tylko reload strony
// gdy wykryje nową wersję — Workbox już zainstalował zaktualizowane chunki
// przez autoUpdate/SKIP_WAITING w tle.
//
// Kiedy NADAL kasować cache ręcznie: breaking changes (zmiana schematu DB,
// zmiana formatu localStorage). W takim przypadku zmień prefiks STORED_KEY
// np. z 'eaa_build_v' na 'eaa_build_v2' — to wymusi pełny reload u wszystkich.
async function checkVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();

    const stored = localStorage.getItem(STORED_KEY);

    if (stored && stored !== v) {
      localStorage.setItem(STORED_KEY, v);
      // Workbox pobiera zmienione chunki automatycznie przez autoUpdate.
      // My robimy tylko reload — przeglądarka użyje świeżo zainstalowanych
      // plików z cache service workera, bez ponownego pobierania wszystkiego.
      window.location.reload();
      return;
    }

    localStorage.setItem(STORED_KEY, v);
  } catch {
    // Brak sieci lub błąd — uruchom z cache
  }
}

checkVersion();

setInterval(() => {
  if (document.visibilityState !== 'hidden') checkVersion();
}, 15 * 60 * 1000);

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
  });

  navigator.serviceWorker.ready.then(reg => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          nw.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => {});
}

// Splash znika gdy spełnione są OBA warunki jednocześnie:
//   1. React zamontował pierwsze drzewo (onMounted)
//   2. minęła minimum 1 sekunda (timer)
// Oba startują równolegle — żadne nie czeka na drugie.
const splashReady = (() => {
  let resolveMounted, resolveTimer;
  const mounted = new Promise(r => { resolveMounted = r; });
  const timer   = new Promise(r => { resolveTimer   = r; });
  setTimeout(resolveTimer, 1000);
  Promise.all([mounted, timer]).then(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 380);
  });
  return resolveMounted;
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App onMounted={splashReady} />
  </React.StrictMode>
)

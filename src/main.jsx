import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

/* ── Sprawdzanie wersji i inwalidacja cache ───────────────────────────────
   Przy każdym uruchomieniu aplikacja po cichu pobiera /version.json
   (zawsze świeży — nie cache'owany przez SW ani przeglądarkę).
   Jeśli wersja różni się od zapamiętanej → czyści cache i przeładowuje.
   Użytkownik nie widzi nic — po jednym przeładowaniu ma nową wersję.
──────────────────────────────────────────────────────────────────────────*/
const BUILD_TIME = __BUILD_TIME__;
const STORED_KEY = 'eaa_build_v';

async function checkVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();

    const stored = localStorage.getItem(STORED_KEY);

    if (stored && stored !== v) {
      // Nowa wersja — wyczyść wszystkie cache i przeładuj
      localStorage.setItem(STORED_KEY, v);
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload(true);
      return;
    }

    // Pierwsza wizyta lub ta sama wersja — zapisz i kontynuuj
    localStorage.setItem(STORED_KEY, v);
  } catch (e) {
    // Brak sieci lub błąd — nic nie rób, uruchom z cache
  }
}

// Uruchom sprawdzanie w tle (nie blokuje renderowania)
checkVersion();

// Polling co 5 minut — aktualizacja dla użytkowników z długo otwartą apką
// Jeśli apka jest w tle (hidden), sprawdzenie jest pomijane — oszczędność baterii
setInterval(() => {
  if (document.visibilityState !== 'hidden') checkVersion();
}, 15 * 60 * 1000);

// Service Worker — obsługa aktualizacji
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
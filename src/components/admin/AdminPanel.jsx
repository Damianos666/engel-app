import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { C, GROUPS } from "../../lib/constants";
import { db, realtime } from "../../lib/supabase";
import { Spinner } from "../SharedUI";

// ─── LAZY ADMIN SUB-PANELE ────────────────────────────────────────────────
// Admin zawsze ląduje w zakładce 0 (Terminarz). Pozostałe 5 paneli ładuje
// się dopiero przy pierwszym kliknięciu zakładki — nie przy logowaniu.
// Łączny rozmiar paneli admina to ~800KB — lazy loading skraca czas do
// interakcji przy pierwszym otwarciu panelu nawet o kilka sekund.
const AdminMessages      = lazy(() => import("./AdminMessages").then(m => ({ default: m.AdminMessages })));
const AdminTrainings     = lazy(() => import("./AdminTrainings").then(m => ({ default: m.AdminTrainings })));
const AdminSchedule      = lazy(() => import("./AdminSchedule").then(m => ({ default: m.AdminSchedule })));
const AdminUsers = lazy(() => import("./AdminUsers").then(m => ({ default: m.AdminUsers })));
const AdminInterested    = lazy(() => import("./AdminInterested").then(m => ({ default: m.AdminInterested })));
const AdminRegistrations = lazy(() => import("./AdminRegistrations").then(m => ({ default: m.AdminRegistrations })));
// ScheduleTab (chunk client-tabs) — lazy żeby admin chunk nie wciągał kodu klienta
const ScheduleTab        = lazy(() => import("../ScheduleTab").then(m => ({ default: m.ScheduleTab })));
const LOGO_URL = "/logo.png";
const ALL_GROUPS = GROUPS.map(g => g.id);

// Desktop: wszystkie zakładki w sidebarze
const ADMIN_TABS = [
  ["Terminarz",      "📅"],
  ["Widok klienta", "👁"],
  ["Wiadomości",     "✉"],
  ["Edytor szkoleń", "📋"],
  ["Użytkownicy",   "👥"],
  ["Zgłoszenia",     "🙋"],
  ["Rejestracje",    "📩"],
];

// Mobile: bez "Terminarz w.k." — zastąpiona długim przytrzymaniem
const MOBILE_TABS = [
  ["Terminarz",  "📅", 0],  // [label, icon, desktopIndex]
  ["Wiadomości", "✉",  2],  // długie przytrzymanie → Edytor szkoleń
  ["Użytkownicy", "👥", 4],
  ["Zgłoszenia", "🙋", 5],
  ["Rejestracje","📩", 6],
];

const STORAGE_KEY_SCHEDULE_VIEW = "eea_admin_schedule_view"; // "admin" | "client"
const STORAGE_KEY_MSG_VIEW      = "eea_admin_msg_view";      // "messages" | "editor"
const STORAGE_KEY_ZR_ORDER      = "eea_admin_zr_order";      // "zg_first" | "reg_first"


const tabVisible = { display:"flex", flexDirection:"column", height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch" };
const tabHidden  = { display:"none" };

/* ─── Hook: czy jesteśmy na desktopie (>= 1025px) ─────────────────────── */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1025px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function AdminPanel({ user, onLogout }) {
  const [tab,                setTabRaw]            = useState(0);
  const [interestedCount,    setInterestedCount]   = useState(0);
  const [registrationsCount, setRegistrationsCount] = useState(0);
  const [scheduleRefreshKey,     setScheduleRefreshKey]     = useState(0);
  const [interestedRefreshKey,   setInterestedRefreshKey]   = useState(0);
  const [registrationsRefreshKey,setRegistrationsRefreshKey] = useState(0);
  const prevTabRef = useRef(null);

  // mount-on-first-visit — każdy panel admina ładuje chunk przy pierwszym kliknięciu
  const [visited, setVisited] = useState({ 0: true });

  function setTab(newTab) {
    const prev = prevTabRef.current;
    if (newTab === 0 && prev !== 0) setScheduleRefreshKey(k => k + 1);
    if (newTab === 5 && prev !== 5) setInterestedRefreshKey(k => k + 1);
    if (newTab === 6 && prev !== 6) setRegistrationsRefreshKey(k => k + 1);
    prevTabRef.current = newTab;
    setTabRaw(newTab);
    if (!visited[newTab]) setVisited(p => ({ ...p, [newTab]: true }));
  }
  // scheduleView: "admin" | "client" — persystowane w localStorage
  const [scheduleView, setScheduleView] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_SCHEDULE_VIEW) || "admin"; }
    catch { return "admin"; }
  });
  // msgView: "messages" | "editor" — persystowane w localStorage
  const [msgView, setMsgView] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_MSG_VIEW) || "messages"; }
    catch { return "messages"; }
  });
  // zrOrder: kolejność Zgłoszenia/Rejestracje — "zg_first" | "reg_first"
  const [zrOrder, setZrOrder] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_ZR_ORDER) || "zg_first"; }
    catch { return "zg_first"; }
  });

  function toggleZrOrder() {
    setZrOrder(prev => {
      const next = prev === "zg_first" ? "reg_first" : "zg_first";
      try { localStorage.setItem(STORAGE_KEY_ZR_ORDER, next); } catch {}
      return next;
    });
  }
  const isDesktop = useIsDesktop();
  const realtimeUnsub   = useRef(null);
  const lastInterestAt  = useRef(null);
  const longPressTimer  = useRef(null);

  if (!user) return null;

  const token = user.accessToken;

  function toggleScheduleView() {
    setScheduleView(prev => {
      const next = prev === "admin" ? "client" : "admin";
      try { localStorage.setItem(STORAGE_KEY_SCHEDULE_VIEW, next); } catch {}
      return next;
    });
  }

  function toggleMsgView() {
    setMsgView(prev => {
      const next = prev === "messages" ? "editor" : "messages";
      try { localStorage.setItem(STORAGE_KEY_MSG_VIEW, next); } catch {}
      return next;
    });
  }

  function makeLongPressHandlers(onLongPress, condition = true) {
    if (!condition) return {};
    return {
      onMouseDown:   () => { longPressTimer.current = setTimeout(() => { onLongPress(); if ("vibrate" in navigator) navigator.vibrate(40); }, 600); },
      onMouseUp:     () => clearTimeout(longPressTimer.current),
      onMouseLeave:  () => clearTimeout(longPressTimer.current),
      onTouchStart:  () => { longPressTimer.current = setTimeout(() => { onLongPress(); if ("vibrate" in navigator) navigator.vibrate(40); }, 600); },
      onTouchEnd:    () => clearTimeout(longPressTimer.current),
      onTouchCancel: () => clearTimeout(longPressTimer.current),
    };
  }

  function handleScheduleLongPressStart(e) {
    longPressTimer.current = setTimeout(() => {
      toggleScheduleView();
      if ("vibrate" in navigator) navigator.vibrate(40);
    }, 600);
  }

  function handleScheduleLongPressEnd() {
    clearTimeout(longPressTimer.current);
  }

  // Wzorzec identyczny jak checkMessages w App.jsx —
  // pobiera dane z bazy, porównuje timestampy, WTEDY odpala Notification.
  // Notification odpalana z async funkcji (nie bezpoArednio z WS handler).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const checkInterests = useCallback(async (tok) => {
    try {
      const data = await db.get(tok, "training_interests",
        "select=id,created_at,name,email,contacted,is_withdrawn&order=created_at.desc&limit=20"
      );
      if (!Array.isArray(data)) return;
      const nonContacted = data.filter(i => !i.contacted && !i.is_withdrawn);
      setInterestedCount(nonContacted.length);
      if (!data.length) return;
      const newestAt = data[0].created_at;
      if (lastInterestAt.current && newestAt > lastInterestAt.current) {
        const newOnes = data.filter(i => i.created_at > lastInterestAt.current);
        // Nowe zgłoszenie → przsuń Zgłoszenia na pierwsze miejsce
        setZrOrder(prev => {
          if (prev !== "zg_first") {
            try { localStorage.setItem(STORAGE_KEY_ZR_ORDER, "zg_first"); } catch {}
            return "zg_first";
          }
          return prev;
        });
        if ("Notification" in window && Notification.permission === "granted") {
          newOnes.forEach(item => {
            new Notification("🙋 ENGEL Expert Academy", {
              body: `Nowe zgłoszenie: ${item.name || item.email || "Ktoś jest zainteresowany"}`,
              icon: "/pwa-192.png", badge: "/pwa-192.png",
              tag: `interest-${item.id}`, renotify: true,
            });
          });
        }
      }
      lastInterestAt.current = newestAt;
    } catch { /* cicho ignoruj */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    checkInterests(token);
    // Realtime — wywołuje checkInterests (jak onNewMessage wywołuje checkMessages)
    realtimeUnsub.current = realtime.onNewInterest(token, () => {
      checkInterests(token);
    });
    return () => {
      if (realtimeUnsub.current) { realtimeUnsub.current(); realtimeUnsub.current = null; }
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Badge dla nowych rejestracji z formularza /rejestracja
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const lastRegAt = useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const checkRegistrations = useCallback(async (tok) => {
    try {
      const data = await db.get(tok, "training_registrations",
        "select=id,created_at,company_name,contact_name,is_handled&order=created_at.desc&limit=50"
      );
      if (!Array.isArray(data)) return;
      const pending = data.filter(r => !r.is_handled);
      setRegistrationsCount(pending.length);
      if (!data.length) return;
      const newestAt = data[0].created_at;
      if (lastRegAt.current && newestAt > lastRegAt.current) {
        const newOnes = data.filter(r => r.created_at > lastRegAt.current);
        // Nowa rejestracja → przesuń Rejestracje na pierwsze miejsce
        setZrOrder(prev => {
          if (prev !== "reg_first") {
            try { localStorage.setItem(STORAGE_KEY_ZR_ORDER, "reg_first"); } catch {}
            return "reg_first";
          }
          return prev;
        });
        if ("Notification" in window && Notification.permission === "granted") {
          newOnes.forEach(item => {
            new Notification("📩 ENGEL Expert Academy", {
              body: `Nowa rejestracja: ${item.company_name || item.contact_name || "Nowe zgłoszenie"}`,
              icon: "/pwa-192.png", badge: "/pwa-192.png",
              tag: `reg-${item.id}`, renotify: true,
            });
          });
        }
      }
      lastRegAt.current = newestAt;
    } catch { /* cicho ignoruj */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    checkRegistrations(token);
    // Poll co 2 minuty (brak dedykowanego realtime kanału dla tej tabeli)
    const interval = setInterval(() => checkRegistrations(token), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`app-container${isDesktop ? " admin-desktop" : ""}`}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
        background: C.greyBg,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ── Nagłówek ──────────────────────────────────────────────────── */}
      <div style={{
        background: C.darkHdr,
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: "12px",
        paddingLeft: "16px",
        paddingRight: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={LOGO_URL} alt="ENGEL" style={{ height: 22, mixBlendMode: "screen" }}/>
          <span style={{ color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>ADMIN</span>
          {isDesktop && (
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginLeft: 4 }}>
              — Panel zarządzania
            </span>
          )}
          {/* Mobile: info o aktywnym widoku alternatywnym */}
          {!isDesktop && tab === 0 && scheduleView === "client" && (
            <span {...makeLongPressHandlers(toggleScheduleView)}
              style={{ color: "#E67E22", fontSize: 10, fontWeight: 700, marginLeft: 4,
                       WebkitUserSelect:"none", userSelect:"none" }}>
              👁 widok klienta
            </span>
          )}
          {!isDesktop && tab === 2 && msgView === "editor" && (
            <span {...makeLongPressHandlers(toggleMsgView)}
              style={{ color: "#E67E22", fontSize: 10, fontWeight: 700, marginLeft: 4,
                       WebkitUserSelect:"none", userSelect:"none" }}>
              📋 edytor szkoleń
            </span>
          )}
        </div>
        <button
          onClick={onLogout}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,.3)",
            color: "#ccc",
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Wyloguj
        </button>
      </div>

      {/* ── Zielona kreska ────────────────────────────────────────────── */}
      <div style={{ height: 3, background: C.green, flexShrink: 0 }}/>

      {/* ── Górne zakładki MOBILE (ukryte na desktopie przez CSS) ─ */}
      <div className="admin-top-tabs" style={{
        display: "flex",
        background: C.white,
        borderBottom: `1px solid ${C.grey}`,
        flexShrink: 0,
      }}>
        {MOBILE_TABS.map(([label, icon, desktopIdx], mIdx) => {
          const isActive    = tab === desktopIdx;
          const isSchedule  = desktopIdx === 0;
          const isMessages  = desktopIdx === 2;
          const isZg        = desktopIdx === 5;
          const isReg       = desktopIdx === 6;
          const isClientView  = isSchedule && scheduleView === "client";
          const isEditorView  = isMessages && msgView === "editor";

          // Dla Zgłoszenia/Rejestracje — dynamiczna kolejność
          // Wyświetlamy je w kolejności zależnej od zrOrder
          // MOBILE_TABS ma je w pozycjach 3 i 4 (mIdx 3=Zgłoszenia, 4=Rejestracje)
          // Zamieniamy tylko ikonę/label/desktopIdx w renderze
          let renderDesktopIdx = desktopIdx;
          let renderLabel = label;
          let renderIcon = icon;
          if (mIdx === 3) {
            // slot 3: pierwszy z pary ZG/REG
            renderDesktopIdx = zrOrder === "zg_first" ? 5 : 6;
            renderLabel      = zrOrder === "zg_first" ? "Zgłoszenia" : "Rejestracje";
            renderIcon       = zrOrder === "zg_first" ? "🙋" : "📩";
          } else if (mIdx === 4) {
            // slot 4: drugi z pary
            renderDesktopIdx = zrOrder === "zg_first" ? 6 : 5;
            renderLabel      = zrOrder === "zg_first" ? "Rejestracje" : "Zgłoszenia";
            renderIcon       = zrOrder === "zg_first" ? "📩" : "🙋";
          }
          const isActiveRender  = tab === renderDesktopIdx;
          const isZgReg = mIdx === 3 || mIdx === 4;

          // długie przytrzymanie
          const lpHandlers = isSchedule
            ? makeLongPressHandlers(toggleScheduleView)
            : isMessages
              ? makeLongPressHandlers(toggleMsgView)
              : isZgReg
                ? makeLongPressHandlers(toggleZrOrder)
                : {};
          return (
            <button
              key={mIdx}
              onClick={() => setTab(renderDesktopIdx)}
              {...lpHandlers}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                borderBottom: `3px solid ${isActiveRender ? C.green : "transparent"}`,
                padding: "10px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                cursor: "pointer",
                position: "relative",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
            >
              {/* badge Zgłoszenia */}
              {renderDesktopIdx === 5 && interestedCount > 0 && (
                <div style={{
                  position: "absolute", top: 4, right: "calc(50% - 14px)",
                  background: C.red, color: C.white, borderRadius: "50%",
                  width: 15, height: 15, fontSize: 8, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {interestedCount}
                </div>
              )}
              {/* badge Rejestracje */}
              {renderDesktopIdx === 6 && registrationsCount > 0 && (
                <div style={{
                  position: "absolute", top: 4, right: "calc(50% - 14px)",
                  background: "#2980B9", color: C.white, borderRadius: "50%",
                  width: 15, height: 15, fontSize: 8, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {registrationsCount}
                </div>
              )}
              <span style={{ fontSize: 16, color: isActiveRender ? C.black : C.greyMid }}>
                {isSchedule && isClientView ? "👁" : isMessages && isEditorView ? "📋" : renderIcon}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: isActiveRender ? C.black : C.greyMid, letterSpacing: .5, textTransform: "uppercase" }}>
                {isSchedule && isClientView ? "Widok klienta" : isMessages && isEditorView ? "Edytor" : renderLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Główna zawartość ──────────────────────────────────────────── */}
      {isDesktop ? (
        /* DESKTOP: sidebar po lewej + treść po prawej */
        <div className="admin-layout">
          <nav className="admin-sidebar">
            {ADMIN_TABS.map(([label, icon], i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                className={`admin-sidebar-btn${tab === i ? " active" : ""}`}
                style={{ position: "relative" }}
              >
                <span className="tab-icon">{icon}</span>
                <span>{label}</span>
                {/* badge dla Zainteresowani (index 5) */}
                {i === 5 && interestedCount > 0 && (
                  <div style={{
                    marginLeft: "auto",
                    background: C.red, color: C.white, borderRadius: "50%",
                    minWidth: 18, height: 18, fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 3px", flexShrink: 0,
                  }}>
                    {interestedCount}
                  </div>
                )}
                {/* badge dla Rejestracje (index 6) */}
                {i === 6 && registrationsCount > 0 && (
                  <div style={{
                    marginLeft: "auto",
                    background: "#2980B9", color: C.white, borderRadius: "50%",
                    minWidth: 18, height: 18, fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 3px", flexShrink: 0,
                  }}>
                    {registrationsCount}
                  </div>
                )}
              </button>
            ))}
          </nav>
          <div className="admin-content-area">
            <div style={tab === 0 ? tabVisible : tabHidden}>
              {visited[0] && <Suspense fallback={<Spinner/>}><AdminSchedule token={token} refreshKey={scheduleRefreshKey}/></Suspense>}
            </div>
            <div style={tab === 1 ? tabVisible : tabHidden}>
              {visited[1] && <Suspense fallback={<Spinner/>}><ScheduleTab activeGroups={ALL_GROUPS}/></Suspense>}
            </div>
            <div style={tab === 2 ? tabVisible : tabHidden}>
              {visited[2] && <Suspense fallback={<Spinner/>}><AdminMessages token={token}/></Suspense>}
            </div>
            <div style={tab === 3 ? tabVisible : tabHidden}>
              {visited[3] && <Suspense fallback={<Spinner/>}><AdminTrainings token={token}/></Suspense>}
            </div>
            <div style={tab === 4 ? tabVisible : tabHidden}>
              {visited[4] && <Suspense fallback={<Spinner/>}><AdminUsers token={token}/></Suspense>}
            </div>
            <div style={tab === 5 ? tabVisible : tabHidden}>
              {visited[5] && <Suspense fallback={<Spinner/>}><AdminInterested token={token} onContactedChange={() => checkInterests(token)} refreshKey={interestedRefreshKey}/></Suspense>}
            </div>
            <div style={tab === 6 ? tabVisible : tabHidden}>
              {visited[6] && <Suspense fallback={<Spinner/>}><AdminRegistrations token={token} onRegistrationsChange={() => checkRegistrations(token)} refreshKey={registrationsRefreshKey}/></Suspense>}
            </div>
          </div>
        </div>
      ) : (
        /* MOBILE: 4 zakładki */
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          <div style={tab === 0 ? tabVisible : tabHidden}>
            {visited[0] && (scheduleView === "client"
              ? <Suspense fallback={<Spinner/>}><ScheduleTab activeGroups={ALL_GROUPS}/></Suspense>
              : <Suspense fallback={<Spinner/>}><AdminSchedule token={token} refreshKey={scheduleRefreshKey}/></Suspense>
            )}
          </div>
          <div style={tab === 2 ? tabVisible : tabHidden}>
            {visited[2] && (msgView === "editor"
              ? <Suspense fallback={<Spinner/>}><AdminTrainings token={token}/></Suspense>
              : <Suspense fallback={<Spinner/>}><AdminMessages token={token}/></Suspense>
            )}
          </div>
          <div style={tab === 4 ? tabVisible : tabHidden}>
            {visited[4] && <Suspense fallback={<Spinner/>}><AdminUsers token={token}/></Suspense>}
          </div>
          <div style={tab === 5 ? tabVisible : tabHidden}>
            {visited[5] && <Suspense fallback={<Spinner/>}><AdminInterested token={token} onContactedChange={() => checkInterests(token)} refreshKey={interestedRefreshKey}/></Suspense>}
          </div>
          <div style={tab === 6 ? tabVisible : tabHidden}>
            {visited[6] && <Suspense fallback={<Spinner/>}><AdminRegistrations token={token} onRegistrationsChange={() => checkRegistrations(token)} refreshKey={registrationsRefreshKey}/></Suspense>}
          </div>
        </div>
      )}

      {/* Portal dla toastów — wewnątrz app-container, nie w viewport */}
      <div id="toast-portal" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 99999 }} />
    </div>
  );
}

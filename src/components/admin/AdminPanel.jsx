import { useState, useEffect, useRef } from "react";
import { C, GROUPS } from "../../lib/constants";
import { db, realtime } from "../../lib/supabase";
import { AdminMessages } from "./AdminMessages";
import { AdminTrainings } from "./AdminTrainings";
import { AdminSchedule } from "./AdminSchedule";
import { AdminBatchComplete } from "./AdminBatchComplete";
import { AdminInterested } from "./AdminInterested";
import { ScheduleTab } from "../ScheduleTab";

const LOGO_URL = "/logo.png";
const ALL_GROUPS = GROUPS.map(g => g.id);
const ADMIN_TABS = [
  ["Terminarz",      "📅"],
  ["Terminarz w.k.", "👁"],
  ["Wiadomości",     "✉"],
  ["Edytor szkoleń", "📋"],
  ["Zaliczenia",     "🎓"],
  ["Zgłoszenia",     "🙋"],
];

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
  const [tab,             setTab]             = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);
  const isDesktop = useIsDesktop();
  const realtimeUnsub = useRef(null);

  if (!user) return null;

  const token = user.accessToken;

  // Pobiera liczbę nieskontaktowanych zainteresowań
  async function fetchInterestedCount(tok) {
    try {
      const data = await db.get(tok, "training_interests", "select=id&contacted=eq.false");
      setInterestedCount(Array.isArray(data) ? data.length : 0);
    } catch { /* cicho ignoruj */ }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    fetchInterestedCount(token);
    // Realtime — natychmiastowe powiadomienie gdy pojawi się nowe zainteresowanie
    realtimeUnsub.current = realtime.onNewInterest(token, (type, record) => {
      fetchInterestedCount(token);
      if (type === "INSERT") {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("🙋 ENGEL Expert Academy", {
            body: `Masz nowe zgłoszenie na szkolenie!`,
            icon: "/pwa-192.png", badge: "/pwa-192.png",
            vibrate: [200, 100, 200],
          });
        }
      }
    });
    return () => {
      if (realtimeUnsub.current) { realtimeUnsub.current(); realtimeUnsub.current = null; }
    };
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

      {/* ── Górne zakładki (tylko mobile, na desktopie ukryte przez CSS) ─ */}
      <div className="admin-top-tabs" style={{
        display: "flex",
        background: C.white,
        borderBottom: `1px solid ${C.grey}`,
        flexShrink: 0,
      }}>
        {ADMIN_TABS.map(([label, icon], i) => (
          <button key={i} onClick={() => setTab(i)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              borderBottom: `3px solid ${tab === i ? C.green : "transparent"}`,
              padding: "10px 4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              cursor: "pointer",
              position: "relative",
            }}
          >
            {/* badge dla Zainteresowani (index 5) */}
            {i === 5 && interestedCount > 0 && (
              <div style={{
                position: "absolute", top: 4, right: "calc(50% - 14px)",
                background: C.red, color: C.white, borderRadius: "50%",
                width: 15, height: 15, fontSize: 8, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {interestedCount}
              </div>
            )}
            <span style={{ fontSize: 16, color: tab === i ? C.black : C.greyMid }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: tab === i ? C.black : C.greyMid, letterSpacing: .5, textTransform: "uppercase" }}>
              {label}
            </span>
          </button>
        ))}
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
              </button>
            ))}
          </nav>
          <div className="admin-content-area">
            <div style={tab === 0 ? tabVisible : tabHidden}><AdminSchedule token={token}/></div>
            <div style={tab === 1 ? tabVisible : tabHidden}><ScheduleTab activeGroups={ALL_GROUPS}/></div>
            <div style={tab === 2 ? tabVisible : tabHidden}><AdminMessages token={token}/></div>
            <div style={tab === 3 ? tabVisible : tabHidden}><AdminTrainings token={token}/></div>
            <div style={tab === 4 ? tabVisible : tabHidden}><AdminBatchComplete token={token}/></div>
            <div style={tab === 5 ? tabVisible : tabHidden}><AdminInterested token={token} onContactedChange={() => fetchInterestedCount(token)}/></div>
          </div>
        </div>
      ) : (
        /* MOBILE: zakładki na górze, treść pod spodem */
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          <div style={tab === 0 ? tabVisible : tabHidden}><AdminSchedule token={token}/></div>
          <div style={tab === 1 ? tabVisible : tabHidden}><ScheduleTab activeGroups={ALL_GROUPS}/></div>
          <div style={tab === 2 ? tabVisible : tabHidden}><AdminMessages token={token}/></div>
          <div style={tab === 3 ? tabVisible : tabHidden}><AdminTrainings token={token}/></div>
          <div style={tab === 4 ? tabVisible : tabHidden}><AdminBatchComplete token={token}/></div>
          <div style={tab === 5 ? tabVisible : tabHidden}><AdminInterested token={token} onContactedChange={() => fetchInterestedCount(token)}/></div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { C, GROUPS, ADMIN_EMAIL } from "./lib/constants";
import { auth, db, session, setOnTokenRefreshed } from "./lib/supabase";
import { calcProgress } from "./lib/helpers";
import { log, err as logErr } from "./lib/logger";
import { LangProvider } from "./lib/LangContext";
import { ToastProvider, useToast } from "./lib/ToastContext";
import { UserContext, useUser } from "./lib/UserContext";
import { Header, Spinner } from "./components/SharedUI";
import { LoginScreen } from "./components/Login";
import { TrainingTab } from "./components/TrainingTab";
import { CatalogTab } from "./components/CatalogTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { MessagesTab } from "./components/MessagesTab";
import { ProfileTab } from "./components/ProfileTab";
import { TrainerScheduleTab } from "./components/TrainerScheduleTab";
import { TabBar } from "./components/TabBar";
import { GramTab } from "./components/GramTab";

// Lazy imports — AdminPanel (~400KB) i komponenty trenera ładują się tylko gdy potrzebne
const AdminPanel   = lazy(() => import("./components/admin/AdminPanel").then(m => ({ default: m.AdminPanel })));
const AdminCodeGen = lazy(() => import("./components/admin/AdminCodeGen").then(m => ({ default: m.AdminCodeGen })));
const AdminQuiz    = lazy(() => import("./components/admin/AdminQuiz").then(m => ({ default: m.AdminQuiz })));

// OPTYMALIZACJA: Style wyciągnięte poza render — nowe obiekty NIE tworzą się co renderze.
const styles = {
  loadingWrapper: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.greyBg, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" },
  loadingInner:   { textAlign: "center" },
  spinner:        { width: 40, height: 40, border: `3px solid ${C.grey}`, borderTopColor: C.green, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" },
  loadingText:    { color: C.greyDk, fontSize: 14 },
  appContainer:   { height: "100%", display: "flex", flexDirection: "column", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", background: C.greyBg, overflow: "hidden" },
  banner:         { background: C.greyBanner, borderBottom: "1px solid #D0D3D6", padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  bannerName:     { fontSize: 13, color: C.greyDk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 },
  trainerBadge:   { fontSize: 11, fontWeight: 700, color: C.green, flexShrink: 0, background: C.greenBg, padding: "2px 8px", borderRadius: 4 },
  progressText:   { fontSize: 13, fontWeight: 700, color: C.green, flexShrink: 0 },
  appContent:     { flex: 1, minHeight: 0, position: "relative", overflow: "hidden" },
  tabVisible:     { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  tabHidden:      { display: "none",  flexDirection: "column", height: "100%", overflow: "hidden" },
  trainerContent: { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" },
  tabBar:         { display: "flex", background: C.white, borderTop: `1px solid ${C.grey}`, flexShrink: 0 },
  suspenseFallback: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.greyBg },
};

const TRAINER_TABS = [
  ["Terminarz", "📅"],
  ["Kody",      "🔑"],
  ["Wiadomości","✉"],
  ["Quiz",      "🎯"],
  ["Profil",    "⚙"],
];

export default function App() {
  return (
    <LangProvider>
      <ToastProvider>
        <AppRoot />
      </ToastProvider>
    </LangProvider>
  );
}

function AppRoot() {
  const { addToast } = useToast();

  const [user,              setUserRaw]         = useState(null);
  const [tab,               setTab]             = useState(0);
  const [completed,         setCompleted]       = useState([]);
  const [activeGroups,      setActiveGroups]    = useState(["tech","ur","maszyny"]);
  const [notifReminder,     setNotifReminder]   = useState(true);
  const [notifCert,         setNotifCert]       = useState(true);
  const [dataLoading,       setDataLoading]     = useState(false);
  const [msgCount,          setMsgCount]        = useState(0);
  const [sessionChecked,    setSessionChecked]  = useState(false);
  const [trainerView,       setTrainerViewRaw]  = useState("client");
  const [trainingOverrides, setTrainingOverrides] = useState({});
  const [gameData,          setGameData]         = useState({ points: 0, streak_current: 0 });

  const lastMsgAt    = useRef(null);
  const pollInterval = useRef(null);

  function requestNotifPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  const checkMessages = useCallback(async (token) => {
    if (!token) return;
    try {
      const msgs = await db.get(token, "messages", "order=created_at.desc&select=id,created_at,title&limit=20");
      setMsgCount(msgs.length);
      if (!msgs.length) return;
      const newestAt = msgs[0].created_at;
      if (lastMsgAt.current && newestAt > lastMsgAt.current) {
        const newMsgs = msgs.filter(m => m.created_at > lastMsgAt.current);
        if ("Notification" in window && Notification.permission === "granted") {
          newMsgs.forEach(m => {
            new Notification("📬 ENGEL Expert Academy", {
              body: m.title, icon: "/pwa-192.png", badge: "/pwa-192.png",
              tag: `msg-${m.id}`, renotify: true,
            });
          });
        }
      }
      lastMsgAt.current = newestAt;
    } catch { /* cicho ignoruj błędy pollingu */ }
  }, []);

  useEffect(() => {
    if (!user) {
      if (pollInterval.current) { clearInterval(pollInterval.current); pollInterval.current = null; }
      lastMsgAt.current = null;
      return;
    }
    requestNotifPermission();
    checkMessages(user.accessToken);

    // NAPRAWA BUGU: Było 24 * 60 * 60_000 (24 GODZINY!) — wiadomości sprawdzane raz na dobę.
    // Zmienione na 5 minut (300_000 ms). Dostosuj do potrzeb: 60_000 = 1 min, 300_000 = 5 min.
    pollInterval.current = setInterval(() => checkMessages(user.accessToken), 5 * 60_000);
    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, [user, checkMessages]);

  const setTrainerView = useCallback(async (v) => {
    setTrainerViewRaw(v);
    setTab(0);
    try {
      await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, { trainer_view: v });
    } catch(e) { logErr("[TRAINER VIEW] save error:", e.message); }
  }, [user]);

  // Rejestruje callback który db._withRefresh() wywoła po odświeżeniu tokenu.
  // Dzięki temu React state (user.accessToken) jest zawsze aktualny.
  useEffect(() => {
    setOnTokenRefreshed((newToken) => {
      session.setToken(newToken);
      setUserRaw(prev => prev ? { ...prev, accessToken: newToken } : prev);
      log("[TOKEN REFRESH] accessToken zaktualizowany w stanie React");
    });
  }, []);

  // Proaktywne odświeżanie tokenu co 50 minut.
  // JWT Supabase wygasa po 60 min — odświeżamy z 10-minutowym zapasem,
  // żeby żaden request nie trafił na wygasły token.
  const refreshTimerRef = useRef(null);
  const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minut

  const proactiveRefresh = useCallback(async () => {
    const saved = session.load();
    if (!saved?.refreshToken) return;
    try {
      const refreshed = await auth.refreshSession(saved.refreshToken);
      session.save(refreshed.access_token, refreshed.refresh_token, refreshed.user);
      session.setToken(refreshed.access_token);
      setUserRaw(prev => prev ? { ...prev, accessToken: refreshed.access_token } : prev);
      log("[TOKEN REFRESH] proaktywne odświeżenie zakończone sukcesem");
    } catch(e) {
      logErr("[TOKEN REFRESH] błąd proaktywnego odświeżenia:", e.message);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null; }
      return;
    }
    refreshTimerRef.current = setInterval(proactiveRefresh, TOKEN_REFRESH_INTERVAL);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [user, proactiveRefresh]);

  // Odtwórz sesję z localStorage przy starcie
  useEffect(() => {
    async function restoreSession() {
      const saved = session.load();
      if (!saved?.refreshToken) { setSessionChecked(true); return; }
      try {
        const refreshed = await auth.refreshSession(saved.refreshToken);
        session.save(refreshed.access_token, refreshed.refresh_token, refreshed.user);
        await handleLogin({
          id:          refreshed.user.id,
          accessToken: refreshed.access_token,
          email:       refreshed.user.email,
          _skipSessionSave: true,
        });
      } catch {
        session.clear();
      } finally {
        setSessionChecked(true);
      }
    }
    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useCallback(async (rawUser) => {
    setDataLoading(true);
    try {
      log("[LOGIN] user.id =", rawUser.id);

      // OPTYMALIZACJA: Oba requesty startują równolegle (Promise.all zamiast sekwencyjnie)
      // Wcześniej: czekaliśmy na profile, potem completions → dwa roundtrips w szeregu.
      // Teraz: oba lecą jednocześnie — czas logowania skraca się o ~50%.
      const [profiles, comps, overrides, gameRows] = await Promise.all([
        db.get(rawUser.accessToken, "profiles", `id=eq.${rawUser.id}&select=*`).catch(() => []),
        db.get(rawUser.accessToken, "completions", `user_id=eq.${rawUser.id}&order=created_at.asc&select=*`).catch(() => []),
        db.get(rawUser.accessToken, "training_overrides", "select=*").catch(() => []),
        db.get(rawUser.accessToken, "user_gamification", `user_id=eq.${rawUser.id}&select=points,streak_current`).catch(() => []),
      ]);

      const profile = profiles[0] || null;

      const u = {
        id:           rawUser.id,
        email:        rawUser.email,
        accessToken:  rawUser.accessToken,
        name:         profile?.name          || rawUser.name         || rawUser.email,
        login:        profile?.login         || rawUser.login        || rawUser.email,
        role:         profile?.role          || rawUser.role         || null,
        firma:        profile?.firma         || rawUser.firma        || null,
        active_groups: profile?.active_groups || rawUser.active_groups || ["tech","ur","maszyny"],
        notif_reminder: profile?.notif_reminder ?? rawUser.notif_reminder ?? true,
        notif_cert:     profile?.notif_cert     ?? rawUser.notif_cert     ?? true,
        trainer_id:     profile?.trainer_id     ?? rawUser.trainer_id     ?? null,
        trainer_view:   profile?.trainer_view    ?? "client",
      };
      u.displayName = u.name;
      u.displayRole = u.role || "";

      setUserRaw(u);

      if (Array.isArray(u.active_groups) && u.active_groups.length)
        setActiveGroups(u.active_groups);
      setNotifReminder(u.notif_reminder);
      setNotifCert(u.notif_cert);
      setTrainerViewRaw(u.trainer_view || "client");

      log("[LOGIN] completions loaded:", comps.length);
      setCompleted(comps.map(c => ({
        training:   c.training_data,
        date:       c.date,
        key:        c.code_key,
        trainer:    c.trainer || null,
        trainerNum: parseInt(c.code_key?.slice(-1)) || 1,
      })));

      const overridesMap = {};
      overrides.forEach(ov => { overridesMap[ov.training_id] = ov; });
      setTrainingOverrides(overridesMap);

      const gd = gameRows[0] || { points: 0, streak_current: 0 };
      setGameData({ points: gd.points || 0, streak_current: gd.streak_current || 0 });

    } catch(e) {
      logErr("[LOGIN] ERROR loading data:", e.message);
    } finally {
      setDataLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback(async (entry) => {
    setCompleted(p => {
      const filtered = p.filter(c => c.training.id !== entry.training.id);
      return [...filtered, entry];
    });
    try {
      const payload = {
        training_data: entry.training,
        date:          entry.date,
        code_key:      entry.key,
        trainer:       entry.trainer || null,
      };
      // Najpierw próbuj update (jeśli rekord istnieje), potem insert
      const updated = await db.update(
        user.accessToken, "completions",
        `user_id=eq.${user.id}&training_id=eq.${entry.training.id}`,
        payload
      );
      if (!updated || updated.length === 0) {
        await db.insert(user.accessToken, "completions", {
          user_id:     user.id,
          training_id: entry.training.id,
          ...payload,
        });
      }
    } catch(e) {
      logErr("[COMPLETE] ERROR saving:", e.message);
      addToast("⚠️ Błąd zapisu: " + e.message);
    }
  }, [user, addToast]);

  const handleLogout = useCallback(async () => {
    try { await auth.signOut(user?.accessToken); } catch {}
    localStorage.removeItem("eea_trainer_view");
    setUserRaw(null); setCompleted([]); setTab(0); setMsgCount(0);
    setTrainerViewRaw("client"); setTrainingOverrides({});
    setActiveGroups(["tech","ur","maszyny"]); setNotifReminder(true); setNotifCert(true);
  }, [user]);

  const refreshGameData = useCallback(async () => {
    if (!user?.accessToken || !user?.id) return;
    try {
      const rows = await db.get(user.accessToken, "user_gamification", `user_id=eq.${user.id}&select=points,streak_current`);
      const gd = rows[0] || { points: 0, streak_current: 0 };
      setGameData({ points: gd.points || 0, streak_current: gd.streak_current || 0 });
    } catch {}
  }, [user]);
  // Wcześniej wywoływany niezależnie w App, TrainingTab i ProfileTab = 3x ta sama praca.
  const progress = useMemo(
    () => calcProgress(completed, activeGroups),
    [completed, activeGroups]
  );

  const bannerSub = useMemo(
    () => [user?.displayRole, user?.firma].filter(Boolean).join(" · "),
    [user?.displayRole, user?.firma]
  );

  // BEZPIECZEŃSTWO + OPTYMALIZACJA: Wartość kontekstu memoizowana — nie powoduje
  // re-renderów potomków przy każdej zmianie niepowiązanego stanu w AppRoot.
  const userContextValue = useMemo(() => ({
    user,
    token: user?.accessToken ?? null,
    setUser: setUserRaw,
    progress,
  }), [user, progress]);

  if (!sessionChecked) return (
    <div style={styles.loadingWrapper}>
      <div style={styles.loadingInner}>
        <div style={styles.spinner}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={styles.loadingText}>Ładowanie...</span>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin}/>;

  // BEZPIECZEŃSTWO: Sprawdzenie roli odbywa się PO stronie serwera (Supabase RLS).
  // Ten warunek decyduje tylko o tym, który UI pokazujemy — nie o dostępie do danych.
  // VITE_ADMIN_EMAIL to fallback dla kont które nie mają roli "admin" w bazie.
  // UWAGA: VITE_ env vars są widoczne w bundlu JS — nie umieszczaj tu sekretów!
  const isAdmin = user.role === "admin" || user.email === ADMIN_EMAIL;

  const isTrainer     = user.trainer_id != null;
  const inTrainerView = isTrainer && trainerView === "trainer";

  return (
    <UserContext.Provider value={userContextValue}>
      {isAdmin ? (
        <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
          <AdminPanel user={user} onLogout={handleLogout}/>
        </Suspense>
      ) : inTrainerView ? (
        <TrainerView
          tab={tab} setTab={setTab}
          msgCount={msgCount}
          completed={completed}
          activeGroups={activeGroups}
          setActiveGroups={setActiveGroups}
          onLogout={handleLogout}
          trainerView={trainerView}
          setTrainerView={setTrainerView}
          bannerSub={bannerSub}
        />
      ) : (
        <ClientView
          tab={tab} setTab={setTab}
          completed={completed}
          activeGroups={activeGroups}
          setActiveGroups={setActiveGroups}
          onLogout={handleLogout}
          trainerView={trainerView}
          setTrainerView={setTrainerView}
          dataLoading={dataLoading}
          msgCount={msgCount}
          progress={progress}
          bannerSub={bannerSub}
          trainingOverrides={trainingOverrides}
          onComplete={handleComplete}
          gameData={gameData}
          onTipConfirmed={refreshGameData}
        />
      )}
    </UserContext.Provider>
  );
}

/* ─── WIDOK TRENERA ──────────────────────────────────────────────────────── */
// Wydzielony jako osobny komponent — AppRoot re-renderuje się rzadziej,
// bo zmiany stanu specyficzne dla trenera nie dotyczą widoku klienta.
function TrainerView({ tab, setTab, msgCount, completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView, bannerSub }) {
  const { user, token } = useUser();  // token z kontekstu — bez prop drilling
  return (
    <div className="app-container" style={styles.appContainer}>
      <Header onLogout={onLogout}/>
      <div style={styles.banner}>
        <span style={styles.bannerName}>
          {user.displayName}{bannerSub ? ` · ${bannerSub}` : ""}
        </span>
        <span style={styles.trainerBadge}>TRENER</span>
      </div>
      <div style={styles.trainerContent}>
        {/* display:none zamiast conditional render — zachowuje stan zakładek */}
        {/* NAPRAWA: tabVisible miało overflow:hidden + height:100% co blokowało scroll.
            trainerContent już scrolluje — dzieci nie powinny ograniczać wysokości. */}
        <div style={tab === 0 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <TrainerScheduleTab trainerNum={user.trainer_id}/>
        </div>
        <div style={tab === 1 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <Suspense fallback={<Spinner/>}>
            <AdminCodeGen defaultTrainer={user.trainer_id}/>
          </Suspense>
        </div>
        <div style={tab === 2 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <MessagesTab/>
        </div>
        <div style={tab === 3 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <Suspense fallback={<Spinner/>}>
            <AdminQuiz/>
          </Suspense>
        </div>
        <div style={tab === 4 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <ProfileTab
            completed={completed}
            activeGroups={activeGroups}
            setActiveGroups={setActiveGroups}
            onLogout={onLogout}
            trainerView={trainerView}
            setTrainerView={setTrainerView}
          />
        </div>
      </div>
      <TrainerTabBar tab={tab} setTab={setTab} msgCount={msgCount}/>
    </div>
  );
}

/* ─── WIDOK KLIENTA ──────────────────────────────────────────────────────── */
function ClientView({ tab, setTab, completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView, dataLoading, msgCount, progress, bannerSub, trainingOverrides, onComplete, gameData, onTipConfirmed }) {
  const { user } = useUser();
  const [showGram, setShowGram] = useState(false);
  return (
    <div className="app-container" style={styles.appContainer}>
      <Header onLogout={onLogout}/>
      <div style={styles.banner}>
        <span style={styles.bannerName}>
          {user.displayName}{bannerSub ? ` · ${bannerSub}` : ""}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setShowGram(true)}
            style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderRadius: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.greyDk }}>🔥 {gameData?.streak_current || 0}</span>
            <span style={{ color: C.grey, fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{gameData?.points || 0} pkt</span>
          </button>
        </div>
      </div>
      <div style={styles.appContent}>
        <div style={tab === 0 ? styles.tabVisible : styles.tabHidden}>
          <TrainingTab completed={completed} onComplete={onComplete} activeGroups={activeGroups} loading={dataLoading} trainingOverrides={trainingOverrides}/>
        </div>
        <div style={tab === 1 ? styles.tabVisible : styles.tabHidden}>
          <CatalogTab completed={completed} activeGroups={activeGroups}/>
        </div>
        <div style={tab === 2 ? styles.tabVisible : styles.tabHidden}>
          <ScheduleTab activeGroups={activeGroups} trainerNum={user.trainer_id}/>
        </div>
        <div style={tab === 3 ? styles.tabVisible : styles.tabHidden}>
          <MessagesTab onTipConfirmed={onTipConfirmed}/>
        </div>
        <div style={tab === 4 ? styles.tabVisible : styles.tabHidden}>
          <ProfileTab
            completed={completed}
            activeGroups={activeGroups}
            setActiveGroups={setActiveGroups}
            onLogout={onLogout}
            trainerView={trainerView}
            setTrainerView={setTrainerView}
          />
        </div>
      </div>
      <TabBar tab={tab} setTab={setTab} completedCount={completed.length} msgCount={msgCount}/>
      {showGram && <GramTab onClose={() => setShowGram(false)}/>}
    </div>
  );
}
/* ─── TABBAR TRENERA ─────────────────────────────────────────────────────── */
// Wydzielony żeby uniknąć re-renderu całego TrainerView przy zmianie zakładki.
const tabBtnBase = { flex: 1, background: "none", border: "none", padding: "8px 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", position: "relative" };

function TrainerTabBar({ tab, setTab, msgCount }) {
  return (
    <div style={styles.tabBar}>
      {TRAINER_TABS.map(([label, icon], i) => (
        <button key={i} onClick={() => setTab(i)}
          style={{ ...tabBtnBase, borderTop: `3px solid ${tab === i ? C.green : "transparent"}` }}>
          {i === 2 && msgCount > 0 && (
            <div style={{ position: "absolute", top: 4, right: "calc(50% - 16px)", background: C.red, color: C.white, borderRadius: "50%", width: 15, height: 15, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {msgCount}
            </div>
          )}
          <span style={{ fontSize: 16, color: tab === i ? C.black : C.greyMid }}>{icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: tab === i ? C.black : C.greyMid, letterSpacing: .2 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

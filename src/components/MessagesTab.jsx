import { useState, useEffect, memo } from "react";
import { C, MSG_TYPES, ADMIN_EMAIL } from "../lib/constants";
import { db } from "../lib/supabase";
import { formatDate } from "../lib/helpers";
import { Spinner, Toggle } from "./SharedUI";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { getDailyTipQuestion, TIP_POINTS, calcNewStreak, isQuizDay, getWeekKey, getWeekQuestions, calcQuizPoints } from "../lib/gamification";
import { WeeklyQuiz } from "./GramTab";

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "";
const CONTACT_PHONE = import.meta.env.VITE_CONTACT_PHONE || "";

const toISO = (d = new Date()) => d.toISOString().slice(0, 10);

/* ─── TipBanner — Tip dnia na górze zakładki Wiadomości ─────────────────── */
function TipBanner({ token, userId }) {
  const [tipQ,       setTipQ]       = useState(null);   // pytanie (quiz_question row)
  const [confirmed,  setConfirmed]  = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const today = toISO();
        const [questions, tipConfs] = await Promise.all([
          db.get(token, "quiz_questions", "order=created_at.asc&select=*").catch(() => []),
          db.get(token, "tip_confirmations", `user_id=eq.${userId}&tip_date=eq.${today}&select=id`).catch(() => []),
        ]);
        const q = getDailyTipQuestion(questions, today);
        setTipQ(q);
        setConfirmed(tipConfs.length > 0);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [token, userId]);

  async function handleConfirm() {
    if (confirming || confirmed || !tipQ) return;
    setConfirming(true);
    const today = toISO();
    try {
      // Zapisz potwierdzenie
      await db.insert(token, "tip_confirmations", {
        user_id:        userId,
        tip_date:       today,
        question_id:    tipQ.id,
        points_awarded: TIP_POINTS,
      });
      // Pobierz aktualne dane gamifikacji i zaktualizuj
      const gameRows = await db.get(token, "user_gamification", `user_id=eq.${userId}&select=*`).catch(() => []);
      const gd = gameRows[0] || { points: 0, streak_current: 0, streak_last_date: null };
      const newStreak = calcNewStreak(gd.streak_current, gd.streak_last_date, today);
      await db.upsert(token, "user_gamification", {
        user_id:            userId,
        points:             (gd.points || 0) + TIP_POINTS,
        streak_current:     newStreak,
        streak_last_date:   today,
        program_start_date: gd.program_start_date || today,
      }, "user_id");
      setConfirmed(true);
    } catch (e) {
      alert("Błąd zapisu: " + e.message);
    } finally {
      setConfirming(false);
    }
  }

  // Brak pytań lub brak tipu na dziś — nie pokazuj banera
  if (loading || !tipQ) return null;

  // Tip potwierdzony dziś — mały badge zamiast karty
  if (confirmed) return (
    <div style={{ margin: "12px 12px 0", background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>✅</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.greenDk }}>Tip dnia przeczytany</div>
        <div style={{ fontSize: 11, color: C.greenDk }}>+{TIP_POINTS} pkt zostało dodanych do Twojego konta</div>
      </div>
    </div>
  );

  const correctAnswer = tipQ[`answer_${tipQ.correct}`];
  return (
    <div style={{ margin: "12px 12px 0", borderRadius: 12, overflow: "hidden", border: "0.5px solid rgba(0,0,0,0.15)", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
      {/* Nagłówek */}
      <div style={{ background: "#262624", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid rgba(0,0,0,0.15)" }}>
        <span style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#A0A0A0", letterSpacing: .5 }}>TIP DNIA</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6E9430", background: "#EAF3DE", padding: "2px 8px", borderRadius: 4 }}>⭐ +{TIP_POINTS} pkt</span>
      </div>
      {/* Treść */}
      <div style={{ background: "#30302E", padding: "14px 16px 16px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", marginBottom: 12, lineHeight: 1.5 }}>
          {tipQ.question}
        </div>
        <div style={{ background: "#1A1A1A", border: "1px solid #8AB73E", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "#8AB73E", fontWeight: 700, letterSpacing: .5, marginBottom: 4 }}>ODPOWIEDŹ</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.4 }}>{correctAnswer}</div>
        </div>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          style={{ width: "100%", padding: "11px", background: confirming ? "#8AB73E" : "#639922", border: "none", borderRadius: 8, color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: confirming ? "not-allowed" : "pointer", boxSizing: "border-box", transition: "background .2s" }}>
          {confirming ? "Zapisuję..." : "✓ Potwierdzam"}
        </button>
      </div>
    </div>
  );
}

/* ─── WeeklyQuizBanner — pojawia się w 7. dniu w Wiadomościach ──────────── */
function WeeklyQuizBanner({ token, userId }) {
  const [quizDone,    setQuizDone]    = useState(false);
  const [questions,   setQuestions]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showQuiz,    setShowQuiz]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [result,      setResult]      = useState(null);
  const [programStart,setProgramStart]= useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { week, year } = getWeekKey();
        const [qs, weekRes, gameRows] = await Promise.all([
          db.get(token, "quiz_questions", "order=created_at.asc&select=*").catch(() => []),
          db.get(token, "quiz_weekly_results", `user_id=eq.${userId}&week_year=eq.${year}&week_number=eq.${week}&select=id`).catch(() => []),
          db.get(token, "user_gamification", `user_id=eq.${userId}&select=program_start_date`).catch(() => []),
        ]);
        setQuestions(getWeekQuestions(qs));
        setQuizDone(weekRes.length > 0);
        setProgramStart(gameRows[0]?.program_start_date || null);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [token, userId]);

  async function handleResult(res) {
    setShowQuiz(false);
    setSaving(true);
    try {
      const { week, year } = getWeekKey();
      const today = toISO();
      await db.insert(token, "quiz_weekly_results", {
        user_id:        userId,
        week_year:      year,
        week_number:    week,
        score_pct:      res.pct,
        points_awarded: res.points,
      });
      if (res.points > 0) {
        const gameRows = await db.get(token, "user_gamification", `user_id=eq.${userId}&select=*`).catch(() => []);
        const gd = gameRows[0] || { points: 0, streak_current: 0, streak_last_date: null };
        await db.upsert(token, "user_gamification", {
          user_id:            userId,
          points:             (gd.points || 0) + res.points,
          streak_current:     gd.streak_current  || 0,
          streak_last_date:   gd.streak_last_date || null,
          program_start_date: gd.program_start_date || today,
        }, "user_id");
      }
      setResult(res);
      setQuizDone(true);
    } catch (e) {
      alert("Błąd zapisu: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // Nie pokazuj jeśli ładuje, brak daty startu lub to nie dzień quizu
  if (loading || !isQuizDay(programStart)) return null;

  // Quiz właśnie ukończony — pokaż wynik
  if (result) return (
    <div style={{ margin: "8px 12px 0", borderRadius: 12, overflow: "hidden", border: "0.5px solid rgba(0,0,0,0.15)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
      <div style={{ background: "#262624", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid rgba(0,0,0,0.15)" }}>
        <span style={{ fontSize: 14 }}>📝</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#A0A0A0", letterSpacing: .5 }}>QUIZ TYGODNIOWY</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6E9430", background: "#EAF3DE", padding: "2px 8px", borderRadius: 4 }}>⭐ +{result.points} pkt</span>
      </div>
      <div style={{ background: "#30302E", padding: "14px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>{result.points >= 50 ? "🏆" : result.points >= 30 ? "🥈" : "📚"}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Wynik: {result.pct}%</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 4 }}>
          {result.correct} / {result.total} poprawnych · +{result.points} pkt
        </div>
      </div>
    </div>
  );

  // Quiz już wykonany w tym tygodniu
  if (quizDone) return (
    <div style={{ margin: "8px 12px 0", background: "#EAF3DE", border: `1px solid #8AB73E`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>✅</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#27500A" }}>Quiz tygodniowy ukończony</div>
        <div style={{ fontSize: 11, color: "#3B6D11" }}>Wróć za tydzień po kolejne punkty</div>
      </div>
    </div>
  );

  if (saving) return (
    <div style={{ margin: "8px 12px 0", padding: "12px 16px", textAlign: "center", fontSize: 12, color: "#A0A0A0" }}>
      Zapisuję wynik...
    </div>
  );

  // Quiz dostępny — karta z przyciskiem
  return (
    <>
      <div style={{ margin: "8px 12px 0", borderRadius: 12, overflow: "hidden", border: "0.5px solid rgba(0,0,0,0.15)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
        <div style={{ background: "#262624", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid rgba(0,0,0,0.15)" }}>
          <span style={{ fontSize: 14 }}>📝</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#A0A0A0", letterSpacing: .5 }}>QUIZ TYGODNIOWY</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6E9430", background: "#EAF3DE", padding: "2px 8px", borderRadius: 4 }}>do 60 pkt</span>
        </div>
        <div style={{ background: "#30302E", padding: "14px 16px" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", marginBottom: 12, lineHeight: 1.5 }}>
            Czas na podsumowanie tygodnia! {questions.length} pytań z tipów które poznałeś przez ostatnie 7 dni.
          </div>
          <button
            onClick={() => setShowQuiz(true)}
            style={{ width: "100%", padding: "11px", background: "#639922", border: "none", borderRadius: 8, color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", boxSizing: "border-box" }}>
            ▶ Rozpocznij quiz
          </button>
        </div>
      </div>
      {showQuiz && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}
          onClick={() => setShowQuiz(false)}>
          <div style={{ background: "#EFEFEF", width: "100%", maxWidth: 390, maxHeight: "92dvh", borderRadius: 18, boxShadow: "0 32px 80px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: "#2C2C2C", padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>📝 Quiz tygodniowy</span>
              <button onClick={() => setShowQuiz(false)} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#ccc", fontSize: 16, cursor: "pointer", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <WeeklyQuiz questions={questions} onResult={handleResult}/>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function MessagesTab() {
  const T = useT();
  const { user, token } = useUser();
  const isAdmin = user?.role === "admin" || user?.email === ADMIN_EMAIL;

  // Dane użytkownika wyciągnięte na poziomie komponentu
  const userName  = user?.displayName || user?.name  || "";
  const userMail  = user?.email       || "";
  const userRole  = user?.role        || "";
  const userFirma = user?.firma       || "";
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  // formularz nowej wiadomości
  const [showForm,  setShowForm]  = useState(false);
  const [fTitle,    setFTitle]    = useState("");
  const [fBody,     setFBody]     = useState("");
  const [fType,     setFType]     = useState("info");
  const [fPinned,   setFPinned]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState("");
  const [deleting,  setDeleting]  = useState(null);
  const [contactOpen, setContactOpen] = useState(false);

  async function loadMessages() {
    try {
      const data = await db.get(token, "messages", "order=pinned.desc,created_at.desc&select=*");
      setMessages(data);
    } catch { setErr(T.cannot_load); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadMessages(); }, []);

  async function sendMessage() {
    if (!fTitle.trim()) { setFormErr("Tytuł jest wymagany"); return; }
    if (!fBody.trim())  { setFormErr("Treść jest wymagana"); return; }
    setSaving(true); setFormErr("");
    try {
      await db.insert(token, "messages", {
        title:   fTitle.trim(),
        body:    fBody.trim(),
        type:    fType,
        pinned:  fPinned,
      });
      setFTitle(""); setFBody(""); setFType("info"); setFPinned(false);
      setShowForm(false);
      await loadMessages();
    } catch(e) { setFormErr("Błąd wysyłania: " + e.message); }
    finally { setSaving(false); }
  }

  async function deleteMessage(id) {
    setDeleting(id);
    try {
      await db.remove(token, "messages", `id=eq.${id}`);
      setMessages(p => p.filter(m => m.id !== id));
    } catch(e) { alert("Błąd usuwania: " + e.message); }
    finally { setDeleting(null); }
  }

  if (loading) return <div style={{background:C.greyBg,flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;

  return (
    <div style={{background:C.greyBg,flex:1,minHeight:0,display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      {err && <div style={{background:"#FDEDEC",border:`1px solid ${C.red}`,margin:12,padding:"12px 16px",fontSize:13,color:C.red}}>{err}</div>}

      {/* TIP DNIA — tylko dla nie-adminów */}
      {!isAdmin && <TipBanner token={token} userId={user?.id}/>}

      {/* QUIZ TYGODNIOWY — 7. dzień programu, tylko dla nie-adminów */}
      {!isAdmin && <WeeklyQuizBanner token={token} userId={user?.id}/>}

      {/* PANEL ADMINA */}
      {isAdmin && (
        <div style={{margin:"12px 12px 0",background:C.white,border:`2px solid ${C.green}`,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showForm?16:0}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greenDk,textTransform:"uppercase"}}>⚙ Panel administratora</div>
            <button
              style={{background:showForm?"none":C.black,border:`1px solid ${showForm?C.grey:C.black}`,color:showForm?C.greyDk:C.white,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}
              onClick={() => { setShowForm(p => !p); setFormErr(""); }}>
              {showForm ? "Anuluj" : "+ Nowa wiadomość"}
            </button>
          </div>

          {showForm && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Tytuł */}
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>TYTUŁ *</label>
                <input
                  style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:14,color:C.black,outline:"none",boxSizing:"border-box"}}
                  value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="np. Nowe szkolenie w ofercie"/>
              </div>

              {/* Treść */}
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>TREŚĆ *</label>
                <textarea
                  style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:13,color:C.black,outline:"none",boxSizing:"border-box",minHeight:90,resize:"vertical",fontFamily:"inherit"}}
                  value={fBody} onChange={e => setFBody(e.target.value)} placeholder="Treść wiadomości..."/>
              </div>

              {/* Typ */}
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:8,letterSpacing:.5}}>TYP WIADOMOŚCI</label>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {Object.entries(MSG_TYPES).map(([key, mt]) => (
                    <button key={key} onClick={() => setFType(key)}
                      style={{padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:`2px solid ${fType===key?mt.color:C.grey}`,background:fType===key?mt.bg:C.white,color:fType===key?mt.color:C.greyDk}}>
                      {mt.icon} {key.charAt(0).toUpperCase()+key.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Przypnij */}
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Toggle value={fPinned} color={C.green} onChange={() => setFPinned(p => !p)}/>
                <span style={{fontSize:13,color:C.black}}>Przypnij wiadomość na górze</span>
              </div>

              {/* Podgląd */}
              {(fTitle||fBody) && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>PODGLĄD</div>
                  <div style={{background:fPinned?(MSG_TYPES[fType]||MSG_TYPES.info).bg:C.greyBg,border:`1px solid ${(MSG_TYPES[fType]||MSG_TYPES.info).color+"44"}`,padding:14}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:18}}>{(MSG_TYPES[fType]||MSG_TYPES.info).icon}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:C.black,marginBottom:4}}>{fTitle||"(brak tytułu)"}</div>
                        <div style={{fontSize:12,color:C.greyDk,lineHeight:1.6}}>{fBody||"(brak treści)"}</div>
                        {fPinned && <span style={{fontSize:9,fontWeight:700,color:(MSG_TYPES[fType]||MSG_TYPES.info).color,letterSpacing:1}}>PRZYPIĘTE</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {formErr && <div style={{color:C.red,fontSize:12}}>{formErr}</div>}

              <button
                style={{background:saving?C.greyDk:C.black,border:"none",color:C.white,padding:"12px",fontSize:13,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}
                onClick={sendMessage} disabled={saving}>
                {saving ? "Wysyłanie..." : "Wyślij wiadomość"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* LISTA WIADOMOŚCI */}
      {!messages.length && !err && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60%",padding:32,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>📭</div>
          <div style={{fontSize:16,fontWeight:600,color:C.black,marginBottom:8}}>Brak wiadomości</div>
          <div style={{fontSize:13,color:C.greyMid}}>Nowe ogłoszenia pojawią się tutaj.</div>
        </div>
      )}
      <div style={{padding:"8px 12px 32px",display:"flex",flexDirection:"column",gap:8}}>
        {messages.map(m => {
          const mt = MSG_TYPES[m.type] || MSG_TYPES.info;
          return (
            <div key={m.id} style={{background:m.pinned?mt.bg:C.white,border:`1px solid ${m.pinned?mt.color+"44":"rgba(0,0,0,.06)"}`,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
              <div style={{padding:16}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{mt.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.black,lineHeight:1.3}}>{m.title}</div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        {m.pinned && <span style={{fontSize:9,fontWeight:700,color:mt.color,background:`${mt.color}22`,padding:"2px 8px",letterSpacing:1}}>PRZYPIĘTE</span>}
                        {isAdmin && (
                          <button
                            onClick={() => { if(window.confirm("Usunąć tę wiadomość?")) deleteMessage(m.id); }}
                            disabled={deleting===m.id}
                            style={{background:"none",border:`1px solid ${C.red}`,color:C.red,padding:"3px 8px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                            {deleting===m.id ? "..." : T.delete}
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{fontSize:13,color:C.greyDk,lineHeight:1.6}}>{m.body}</div>
                    <div style={{fontSize:11,color:C.greyMid,marginTop:8}}>{formatDate(m.created_at)}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>{/* end scroll */}

      {/* ── FAB KONTAKT ── */}
      <div className="contact-fab" style={{position:"absolute",bottom:"calc(16px + env(safe-area-inset-bottom, 0px))",right:16,zIndex:900}}>
        {contactOpen && (
          <div style={{position:"absolute",bottom:56,right:0,background:C.white,borderRadius:12,boxShadow:"0 4px 24px rgba(0,0,0,.18)",padding:"8px 0",minWidth:180,overflow:"hidden"}}>
            {/* EMAIL */}
            <a href="#"
              onClick={(e) => {
                e.preventDefault();
                const subject = encodeURIComponent("Zapytanie o szkolenie - " + userName);
                const body = encodeURIComponent(
                  "Dzien dobry,\n\njestem zainteresowany/a szkoleniem.\n\nImie i nazwisko: " + userName +
                  "\nStanowisko: " + userRole +
                  "\nFirma: " + userFirma +
                  "\nAdres e-mail: " + userMail +
                  "\nTelefon kontaktowy: \n\nProsze o kontakt.\n\nZ powazaniem,\n" + userName
                );
                setContactOpen(false);
                window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + subject + "&body=" + body;
              }}
              style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",textDecoration:"none",color:C.black,borderBottom:`1px solid ${C.grey}`}}>
              <span style={{fontSize:20}}>✉️</span>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>E-mail</div>
                <div style={{fontSize:10,color:C.greyMid}}>{CONTACT_EMAIL}</div>
              </div>
            </a>
            {/* TELEFON */}
            <a href={`tel:${CONTACT_PHONE.replace(/\s/g,"")}`}
              onClick={() => setContactOpen(false)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",textDecoration:"none",color:C.black}}>
              <span style={{fontSize:20}}>📞</span>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>Telefon</div>
                <div style={{fontSize:10,color:C.greyMid}}>{CONTACT_PHONE}</div>
              </div>
            </a>
          </div>
        )}
        <button onClick={() => setContactOpen(o => !o)}
          style={{width:64,height:64,borderRadius:"50%",background:contactOpen?C.greyDk:C.black,border:"none",color:C.white,fontSize:52,cursor:"pointer",boxShadow:"0 2px 16px rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,paddingBottom:2}}>
          {contactOpen ? "✕" : "✆"}
        </button>
      </div>

      {/* Overlay zamykający menu */}
      {contactOpen && (
        <div onClick={() => setContactOpen(false)}
          style={{position:"absolute",inset:0,zIndex:899}}/>
      )}
    </div>
  );
}
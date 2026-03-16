import { useState, useEffect, useCallback, useRef } from "react";
import { C } from "../lib/constants";
import { db } from "../lib/supabase";
import { useUser } from "../lib/UserContext";
import { Spinner } from "./SharedUI";
import {
  PROG_LEVELS, getLevelInfo, getEarnedBadges,
  calcQuizPoints, QUIZ_DURATION,
} from "../lib/gamification";

/* ─── Pomocniki ──────────────────────────────────────────────────────────── */
const toISO = (d = new Date()) => d.toISOString().slice(0, 10);

function anonymize(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map(p => (p[0] || "?").toUpperCase() + ".").join("");
}

/* ─── Quiz tygodniowy ────────────────────────────────────────────────────── */
export function WeeklyQuiz({ questions, onResult }) {
  const [qIdx,    setQIdx]    = useState(0);
  const [answers, setAnswers] = useState({});   // { questionId: chosen }
  const [chosen,  setChosen]  = useState(null);
  const [phase,   setPhase]   = useState("question"); // question | answer | result
  const [timeLeft,setTimeLeft]= useState(QUIZ_DURATION);
  const timerRef              = useRef(null);

  /* Wspólny timer dla całego quizu */
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setPhase("result"); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAnswer(key) {
    if (chosen) return;
    clearInterval(timerRef.current);
    setChosen(key);
    setAnswers(prev => ({ ...prev, [questions[qIdx].id]: key }));
    setPhase("answer");
  }

  function goNext() {
    const nextIdx = qIdx + 1;
    if (nextIdx >= questions.length) {
      setPhase("result");
    } else {
      setQIdx(nextIdx);
      setChosen(null);
      setPhase("question");
      startTimer();
    }
  }

  const currentQ = questions[qIdx];
  const timerPct = (timeLeft / QUIZ_DURATION) * 100;
  const timerColor = timerPct > 50 ? C.green : timerPct > 20 ? C.amber : C.red;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  /* Wynik końcowy */
  if (phase === "result") {
    const correct = questions.filter(q => answers[q.id] === q.correct).length;
    const { pct, points } = calcQuizPoints(correct, questions.length);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>
            {points >= 70 ? "🏆" : points >= 50 ? "🥈" : points >= 30 ? "🥉" : "📚"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.black }}>Quiz tygodniowy</div>
          <div style={{ fontSize: 13, color: C.greyMid, marginTop: 4 }}>Wynik: {pct}%</div>
        </div>
        <div style={{ background: C.black, borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", letterSpacing: .5, marginBottom: 6, fontWeight: 700 }}>
            ZDOBYTE PUNKTY
          </div>
          <div style={{ fontSize: 52, fontWeight: 900, color: points > 0 ? C.green : C.greyMid, lineHeight: 1 }}>
            +{points}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", marginTop: 6 }}>
            {correct} / {questions.length} poprawnych · {pct}%
          </div>
        </div>
        <div style={{ background: C.white, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: C.greyDk, textAlign: "center", lineHeight: 1.5 }}>
          {pct >= 90 ? "Doskonały wynik! Jesteś ekspertem 🌟" :
           pct >= 70 ? "Świetna robota! Następnym razem może 90%?" :
           pct >= 50 ? "Dobry start! Czytaj tipy uważniej 📖" :
           "Powtórz tipy i spróbuj za tydzień 💪"}
        </div>
        <button onClick={() => onResult({ pct, points, correct, total: questions.length })}
          style={{ padding: "14px", background: C.green, border: "none", borderRadius: 10, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Zapisz wynik →
        </button>
      </div>
    );
  }

  if (!currentQ) return null;
  const ANSWER_COLORS = { a: "#2980B9", b: "#8E44AD", c: "#E67E22" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Timer + licznik */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.greyMid, fontWeight: 600 }}>
            Pytanie {qIdx + 1} / {questions.length}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: timerColor }}>
            {mins}:{String(secs).padStart(2, "0")}
          </span>
        </div>
        <div style={{ height: 4, background: C.grey, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${timerPct}%`, background: timerColor, borderRadius: 2, transition: "width 1s linear, background .3s" }}/>
        </div>
      </div>

      {/* Pasek postępu pytań */}
      <div style={{ display: "flex", gap: 3 }}>
        {questions.map((q, i) => {
          const ans = answers[q.id];
          const correct = ans === q.correct;
          return (
            <div key={i} style={{
              flex: 1, height: 5, borderRadius: 3,
              background: i < qIdx
                ? (correct ? C.green : C.red)
                : i === qIdx ? C.amber : C.grey,
              transition: "background .3s",
            }}/>
          );
        })}
      </div>

      {/* Pytanie */}
      <div style={{ background: C.black, padding: "18px 16px", borderRadius: 12 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontWeight: 700, letterSpacing: .5, marginBottom: 8 }}>
          PYTANIE TYGODNIA
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.white, lineHeight: 1.5 }}>
          {currentQ.question}
        </div>
      </div>

      {/* Odpowiedzi */}
      {phase === "question" && ["a", "b", "c"].map(k => (
        <button key={k} onClick={() => handleAnswer(k)}
          style={{
            padding: "12px 14px", background: C.white, border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 600, color: C.black, cursor: "pointer",
            textAlign: "left", display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", background: ANSWER_COLORS[k],
            color: "#fff", fontSize: 12, fontWeight: 800,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {k.toUpperCase()}
          </span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{currentQ[`answer_${k}`]}</span>
        </button>
      ))}

      {/* Odpowiedź z wynikiem */}
      {phase === "answer" && (
        <>
          {["a", "b", "c"].map(k => {
            const isCorrect = k === currentQ.correct;
            const isChosen  = k === chosen;
            const bg     = isCorrect ? "#F0F7E0" : isChosen ? "#FDEDEC" : "#f5f5f5";
            const color  = isCorrect ? C.greenDk : isChosen ? C.red : C.greyMid;
            const border = isCorrect ? `2px solid ${C.green}` : isChosen ? `2px solid ${C.red}` : "2px solid transparent";
            return (
              <div key={k} style={{ padding: "12px 14px", background: bg, border, borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: isCorrect ? C.green : isChosen ? C.red : "#ccc",
                  color: "#fff", fontSize: 12, fontWeight: 800,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {k.toUpperCase()}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color, lineHeight: 1.4 }}>
                  {currentQ[`answer_${k}`]}
                </span>
                {isCorrect && <span style={{ fontSize: 16 }}>✓</span>}
              </div>
            );
          })}
          <button onClick={goNext}
            style={{ padding: "14px", background: C.green, border: "none", borderRadius: 10, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {qIdx + 1 < questions.length ? "Dalej →" : "Wynik 🏆"}
          </button>
        </>
      )}
    </div>
  );
}

/* ─── RANKING ────────────────────────────────────────────────────────────── */
function Ranking({ token, userId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [gameRows, profiles] = await Promise.all([
          db.get(token, "user_gamification", "order=points.desc&limit=30&select=*"),
          db.get(token, "profiles", "select=id,name"),
        ]);
        const profileMap = {};
        profiles.forEach(p => { profileMap[p.id] = p.name || ""; });
        setEntries(gameRows.map((r, i) => ({
          ...r,
          rank:     i + 1,
          initials: anonymize(profileMap[r.user_id] || ""),
          isMe:     r.user_id === userId,
        })));
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [token, userId]);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spinner/></div>;

  const me = entries.find(e => e.isMe);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Moja pozycja */}
      <div style={{ background: C.black, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700, letterSpacing: .5 }}>TWOJA POZYCJA</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: me ? C.green : C.greyMid }}>
            {me ? `#${me.rank}` : "—"}
          </div>
        </div>
        {me && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{me.points} pkt</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>🔥 {me.streak_current || 0} dni</div>
          </div>
        )}
      </div>

      {/* TOP lista */}
      {entries.map(e => (
        <div key={e.user_id} style={{
          background:  e.isMe ? C.greenBg : C.white,
          border:      e.isMe ? `2px solid ${C.green}` : `1px solid ${C.grey}`,
          borderRadius: 8,
          padding:     "10px 14px",
          display:     "flex",
          alignItems:  "center",
          gap:         12,
          boxShadow:   "0 1px 3px rgba(0,0,0,.05)",
        }}>
          {/* Medal dla top 3 */}
          <span style={{ fontSize: 15, width: 28, textAlign: "center", flexShrink: 0 }}>
            {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.black }}>
              {e.initials}
              {e.isMe && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.green, background: C.greenBg, padding: "1px 5px", borderRadius: 3 }}>TY</span>}
            </div>
            <div style={{ fontSize: 11, color: C.greyMid }}>🔥 {e.streak_current || 0} dni</div>
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: e.isMe ? C.greenDk : C.black }}>
            {e.points} pkt
          </span>
        </div>
      ))}

      {!entries.length && (
        <div style={{ textAlign: "center", color: C.greyMid, padding: 32, fontSize: 13 }}>
          Brak danych rankingu
        </div>
      )}
    </div>
  );
}

/* ─── GŁÓWNY KOMPONENT ───────────────────────────────────────────────────── */
export function GramTab({ onClose }) {
  const { user, token } = useUser();
  const [view,         setView]         = useState("dashboard");
  const [loading,      setLoading]      = useState(true);
  const [gameData,     setGameData]     = useState({ points: 0, streak_current: 0, streak_last_date: null, program_start_date: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gameRows] = await Promise.all([
        db.get(token, "user_gamification", `user_id=eq.${user.id}&select=*`).catch(() => []),
      ]);
      const gd = gameRows[0] || { points: 0, streak_current: 0, streak_last_date: null, program_start_date: null };
      setGameData(gd);
    } catch {}
    finally { setLoading(false); }
  }, [token, user.id]);

  useEffect(() => { load(); }, [load]);

  /* ── Modal wrapper ── */
  const wrap = (content) => (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#EFEFEF", width: "100%", maxWidth: 390, maxHeight: "92dvh", borderRadius: 18, boxShadow: "0 32px 80px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: C.darkHdr, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>🎮 Gram — ENGEL Virtual Expert Academy</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#ccc", fontSize: 16, cursor: "pointer", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Nawigacja wewnętrzna */}
        <div style={{ display: "flex", background: C.white, borderBottom: `1px solid ${C.grey}`, flexShrink: 0 }}>
          {[
            ["dashboard", "🏠", "Dashboard"],
            ["ranking",   "🏆", "Ranking"],
          ].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)}
              style={{
                flex: 1, background: "none", border: "none",
                borderBottom: `3px solid ${view === v ? C.green : "transparent"}`,
                padding: "9px 4px", fontSize: 11, fontWeight: 700,
                color: view === v ? C.black : C.greyMid,
                cursor: "pointer", letterSpacing: .3,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Treść */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {content}
        </div>
      </div>
    </div>
  );

  /* Loading */
  if (loading) return wrap(<div style={{ textAlign: "center", padding: 40 }}><Spinner/></div>);

  /* Ranking */
  if (view === "ranking") return wrap(<Ranking token={token} userId={user.id}/>);

  /* ── DASHBOARD ─────────────────────────────────────────────────────────── */
  const { current: lvl, next: nextLvl, pct: lvlPct } = getLevelInfo(gameData.points || 0);
  const earnedBadges = getEarnedBadges(gameData.points || 0);
  const daysInProgram = gameData.program_start_date
    ? Math.floor((Date.now() - new Date(gameData.program_start_date + "T00:00:00").getTime()) / 86400000)
    : 0;
  const programPct = Math.min(100, Math.round((daysInProgram / 365) * 100));

  return wrap(
    <>
      {/* ── Karta poziomu ── */}
      <div style={{ background: C.black, borderRadius: 14, padding: "18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>{lvl.badge}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontWeight: 700, letterSpacing: .5 }}>
              POZIOM {lvl.level}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.white }}>{lvl.label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.green, lineHeight: 1 }}>
              {gameData.points || 0}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>punktów</div>
          </div>
        </div>

        {/* Pasek postępu do następnego poziomu */}
        {nextLvl && (
          <>
            <div style={{ height: 6, background: "rgba(255,255,255,.1)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${lvlPct}%`, background: C.green, borderRadius: 3, transition: "width .4s ease" }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{lvl.pts} pkt</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                {nextLvl.badge} {nextLvl.label} · {nextLvl.pts} pkt
              </span>
            </div>
          </>
        )}
        {!nextLvl && (
          <div style={{ textAlign: "center", fontSize: 12, color: C.green, fontWeight: 700, marginTop: 4 }}>
            🏆 Najwyższy poziom osiągnięty!
          </div>
        )}
      </div>

      {/* ── Seria dni + program ── */}
      <div style={{ display: "flex", gap: 8 }}>
        {/* Streak */}
        <div style={{ flex: 1, background: C.white, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(0,0,0,.07)" }}>
          <span style={{ fontSize: 26 }}>🔥</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.black, lineHeight: 1 }}>
              {gameData.streak_current || 0}
            </div>
            <div style={{ fontSize: 10, color: C.greyMid, marginTop: 2 }}>dni nauki</div>
          </div>
        </div>
        {/* Program */}
        <div style={{ flex: 1, background: C.white, borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.greyMid, fontWeight: 700 }}>PROGRAM 365 DNI</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.green }}>{programPct}%</span>
          </div>
          <div style={{ height: 5, background: C.grey, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${programPct}%`, background: C.green, borderRadius: 3 }}/>
          </div>
          <div style={{ fontSize: 10, color: C.greyMid, marginTop: 4 }}>
            Dzień {Math.min(daysInProgram, 365)} / 365
          </div>
        </div>
      </div>

      {/* ── Odznaki ── */}
      {earnedBadges.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: .5, marginBottom: 8 }}>
            ODZNAKI ({earnedBadges.length} / {PROG_LEVELS.length})
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PROG_LEVELS.map(b => {
              const earned = (gameData.points || 0) >= b.pts;
              return (
                <div key={b.level} style={{
                  background:  earned ? C.white : C.greyBg,
                  border:      `1px solid ${earned ? C.grey : "transparent"}`,
                  borderRadius: 8, padding: "8px 10px",
                  textAlign:   "center", minWidth: 56,
                  opacity:     earned ? 1 : 0.35,
                }}>
                  <div style={{ fontSize: 22 }}>{b.badge}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.greyMid, marginTop: 3, lineHeight: 1.2 }}>
                    {b.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Info o max punktach ── */}
      <div style={{ background: C.white, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: C.greyMid, textAlign: "center", lineHeight: 1.6 }}>
        Max. 6770 pkt w ciągu roku (3650 z tipów + 3120 z quizów).{"\n"}
        Ukończ program i zdobądź certyfikat ENGEL Virtual Expert Academy!
      </div>
    </>
  );
}
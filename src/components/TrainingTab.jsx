import { useState, useMemo } from "react";
import { C, LVL_COLOR, GROUPS } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { parseCode, calcProgress } from "../lib/helpers";
import { Spinner, SecTitle, ClipboardSvg } from "./SharedUI";
import { CelebModal, CertModal } from "./Modals";
import { useT } from "../lib/LangContext";
import { QuizGame, QuizResultModal } from "./QuizGame";
import { GramTab } from "./GramTab";
import { useUser } from "../lib/UserContext";

function formatDays(n, T) {
  const d = parseInt(n, 10);
  if (!d || d < 1) return "-";
  return d === 1 ? `1 ${T.day_unit}` : `${d} ${T.days_unit}`;
}

export function TrainingTab({ completed, onComplete, activeGroups, loading }) {
  const { user } = useUser();
  const T = useT();
  const [code,        setCode]        = useState("");
  const [status,      setStatus]      = useState(null);
  const [celebEntry,  setCelebEntry]  = useState(null);
  const [certEntry,   setCertEntry]   = useState(null);
  const [showQuiz,    setShowQuiz]    = useState(false);
  const [quizMode,    setQuizMode]    = useState("training"); // "training"|"custom"
  const [quizResult,  setQuizResult]  = useState(null);

  // Okienko potwierdzenia (dni + opcjonalnie nazwa dla ST)
  const [confirm,     setConfirm]     = useState(null); // { parsed, training, rawCode }
  const [confirmDays, setConfirmDays] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const progress = calcProgress(completed, activeGroups);

  // Memoizacja deduplication — przelicza się tylko gdy zmienia się completed
  const uniqueCompleted = useMemo(
    () => Object.values(
      completed.reduce((acc, c) => { acc[c.training.id] = c; return acc; }, {})
    ),
    [completed]
  );

  function verify() {
    // Trigger quizu
    if (code.trim().toLowerCase() === "sprawdzam") {
      setCode(""); setStatus(null);
      setQuizMode("training");
      setShowQuiz(true);
      return;
    }

    const parsed = parseCode(code);
    if (!parsed) { setStatus("invalid"); return; }

    const rawCode = code.trim().toUpperCase();

    if (parsed.isSpecial) {
      const training = {
        id:       `ST_${rawCode}`,
        title:    "",
        category: "specjalne",
        duration: "",
        level:    1,
        group:    "tech",
        short:    "ST",
      };
      setConfirm({ parsed, training, rawCode, isSpecial: true });
      setConfirmName("");
      setConfirmDays("1");
      return;
    }

    const t = TRAININGS.find(t => t.id === parsed.prefix);
    if (!t) { setStatus("invalid"); return; }

    setConfirm({ parsed, training: t, rawCode, isSpecial: false });
    setConfirmDays(t.duration || "");
  }

  function submitConfirm() {
    if (!confirm) return;
    if (confirm.isSpecial && !confirmName.trim()) return;

    const training = confirm.isSpecial
      ? { ...confirm.training, title: confirmName.trim(), duration: formatDays(confirmDays, T) }
      : { ...confirm.training };

    const entry = {
      training,
      date:       confirm.parsed.date,
      key:        confirm.rawCode,
      trainer:    confirm.parsed.trainer,
      trainerNum: confirm.parsed.trainerNum,
    };
    onComplete(entry);
    setCelebEntry(entry);
    // Haptic feedback — wzorzec: krótki puls · pauza · mocniejszy akcent · pauza · finał
    if (navigator.vibrate) navigator.vibrate([60, 80, 120, 60, 200]);
    setCode("");
    setStatus(null);
    setConfirm(null);
    setConfirmName("");
    setConfirmDays("");
  }

  function cancelConfirm() {
    setConfirm(null);
    setConfirmName("");
    setConfirmDays("");
  }

  const canSubmit = confirm && (!confirm.isSpecial || (confirmName.trim() && confirmDays.trim()));

  // Modal potwierdzenia (wspólny dla zwykłych i specjalnych)
  const confirmModal = confirm && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}}>
      <div style={{background:C.white,width:"100%",maxWidth:380,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.35)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{background:C.darkHdr,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{color:C.white,fontSize:13,fontWeight:700,letterSpacing:1}}>
            {confirm.isSpecial ? T.special_training : T.confirm_training}
          </span>
          <button onClick={cancelConfirm} style={{background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",opacity:.7}}>✕</button>
        </div>
        <div style={{height:3,background:C.green}}/>

        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>

          {/* Info o trenerze i dacie */}
          <div style={{fontSize:11,color:C.greyMid}}>
            {T.trainer_label} <strong style={{color:C.black}}>{confirm.parsed.trainer}</strong>
            &nbsp;·&nbsp; {T.date_label} <strong style={{color:C.black}}>{confirm.parsed.date}</strong>
          </div>

          {/* Nazwa (tylko ST) */}
          {confirm.isSpecial && (
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>NAZWA SZKOLENIA *</label>
              <input
                autoFocus
                style={{width:"100%",border:`1.5px solid ${C.green}`,padding:"10px 14px",fontSize:14,color:C.black,outline:"none",boxSizing:"border-box",borderRadius:4}}
                placeholder={T.enter_name_ph}
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                onKeyDown={e => e.key==="Enter" && document.getElementById("confirmDaysInput")?.focus()}
              />
            </div>
          )}

          {/* Tytuł szkolenia (dla zwykłych) */}
          {!confirm.isSpecial && (
            <div style={{background:C.greyBg,padding:"10px 14px",borderLeft:`3px solid ${C.green}`,fontSize:13,fontWeight:600,color:C.black}}>
              {confirm.training.title}
            </div>
          )}

          {/* Liczba dni — tylko dla ST/DST */}
          {confirm.isSpecial && (
          <div>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>{T.duration_label}</label>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input
                id="confirmDaysInput"
                type="number"
                min="1"
                max="99"
                style={{width:64,border:`1.5px solid ${C.grey}`,padding:"10px 12px",fontSize:18,fontWeight:700,color:C.black,outline:"none",borderRadius:4,textAlign:"center"}}
                value={confirmDays}
                onChange={e => setConfirmDays(e.target.value)}
                onKeyDown={e => e.key==="Enter" && canSubmit && submitConfirm()}
              />
              <span style={{fontSize:14,color:C.greyDk,fontWeight:600}}>{T.days_unit}</span>
            </div>
          </div>
          )}
        </div>

        {/* Przyciski */}
        <div style={{padding:"0 20px 20px",display:"flex",gap:10}}>
          <button onClick={cancelConfirm}
            style={{flex:1,background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"11px 0",fontSize:13,fontWeight:600,cursor:"pointer",borderRadius:4}}>
            Anuluj
          </button>
          <button onClick={submitConfirm} disabled={!canSubmit}
            style={{flex:2,background:canSubmit?C.green:"#ccc",border:"none",color:C.white,padding:"11px 0",fontSize:13,fontWeight:700,cursor:canSubmit?"pointer":"not-allowed",borderRadius:4}}>
            Zatwierdź
          </button>
        </div>
      </div>
    </div>
  );

  const codeInput = (
    <div style={{display:"flex",gap:8}}>
      <input
        style={{flex:1,border:`1.5px solid ${status==="invalid"||status==="already"?C.red:C.grey}`,padding:"11px 14px",fontSize:14,fontFamily:"monospace",fontWeight:700,letterSpacing:1,color:C.black,outline:"none"}}
        value={code}
        onChange={e => { setCode(e.target.value.toUpperCase()); setStatus(null); }}
        placeholder="np. PIM393659"
        maxLength={24}
        onKeyDown={e => e.key==="Enter" && verify()}
      />
      <button style={{background:C.black,border:"none",color:C.white,padding:"11px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}} onClick={verify}>{T.check}</button>
    </div>
  );

  if (loading) return <div style={{background:C.greyBg,flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;

  if (completed.length === 0) return (
    <div style={{background:C.greyBg,flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      {showQuiz && quizMode === "custom"  && <GramTab onClose={() => setShowQuiz(false)}/>}
      {showQuiz && quizMode === "training" && <QuizGame token={user.accessToken} user={user} mode="training" onComplete={entry => { onComplete(entry); }} onClose={() => setShowQuiz(false)}/>}
      {celebEntry && <CelebModal entry={celebEntry} onClose={() => setCelebEntry(null)}/>}
      {confirmModal}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",padding:"32px 24px 48px",textAlign:"center"}}>
        <ClipboardSvg/>
        <div style={{fontSize:18,fontWeight:600,color:C.black,marginTop:20,marginBottom:24}}>{T.enter_code}</div>
        <div style={{width:"100%",maxWidth:340}}>{codeInput}
          {status==="invalid" && <div style={{color:C.red,fontSize:13,marginTop:10}}>{T.invalid_code}</div>}
          {status==="already" && <div style={{color:C.amber,fontSize:13,marginTop:10}}>{T.already_done}</div>}
        </div>
        {!activeGroups.length && <div style={{marginTop:24,background:"#FEF3E2",border:`1px solid ${C.amber}`,padding:"12px 16px",maxWidth:340,textAlign:"left",fontSize:12,color:C.greyDk,lineHeight:1.6}}>{T.enable_groups_msg} <strong>{T.tab_profile}</strong>.</div>}
      </div>
    </div>
  );

  return (
    <div style={{background:C.greyBg,flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      {showQuiz && quizMode === "custom"  && <GramTab onClose={() => setShowQuiz(false)}/>}
      {showQuiz && quizMode === "training" && <QuizGame token={user.accessToken} user={user} mode="training" onComplete={entry => { onComplete(entry); setShowQuiz(false); }} onClose={() => setShowQuiz(false)}/>}
      {celebEntry && <CelebModal entry={celebEntry} onClose={() => setCelebEntry(null)}/>}
      {certEntry   && <CertModal       entry={certEntry}  user={user} onClose={() => setCertEntry(null)}/>}
      {quizResult  && <QuizResultModal entry={quizResult} onClose={() => setQuizResult(null)}/>}
      {confirmModal}
      <div style={{background:C.white,margin:12,padding:18,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:14,textTransform:"uppercase"}}>{T.enter_code}</div>
        {codeInput}
        {status==="invalid" && <div style={{color:C.red,fontSize:12,marginTop:8}}>{T.invalid_code}</div>}
        {status==="already" && <div style={{color:C.amber,fontSize:12,marginTop:8}}>{T.already_done}</div>}
      </div>
      {progress.active ? (
        <div style={{background:C.white,margin:"0 12px 12px",padding:18,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,textTransform:"uppercase"}}>{T.training_progress}</div>
            <div style={{fontSize:22,fontWeight:700,color:C.green}}>{progress.pct}%</div>
          </div>
          <div style={{height:6,background:C.grey}}><div style={{height:"100%",background:C.green,width:`${progress.pct}%`,transition:"width .5s",maxWidth:"100%"}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:12,color:C.black}}>{progress.done} / {progress.total} {T.completed_of}</span>
            <span style={{fontSize:12,color:C.greyMid}}>{progress.total-progress.done} {T.remaining}</span>
          </div>
          <div style={{marginTop:12,display:"flex",gap:6,flexWrap:"wrap"}}>
            {GROUPS.filter(g => activeGroups.includes(g.id)).map(g => {
              const gT = TRAININGS.filter(t => t.group===g.id);
              const doneIds = new Set(completed.map(c => c.training.id));
              const gD = gT.filter(t => doneIds.has(t.id)).length;
              return <div key={g.id} style={{background:C.greyBg,border:`1px solid ${C.grey}`,padding:"5px 10px",fontSize:11}}><span style={{color:g.color,fontWeight:700}}>●</span> {g.label}: <strong>{gD}/{gT.length}</strong></div>;
            })}
          </div>
        </div>
      ) : (
        <div style={{background:"#FEF3E2",border:`1px solid ${C.amber}`,margin:"0 12px 12px",padding:"12px 16px",fontSize:12,color:C.greyDk}}>{T.enable_groups_msg} <strong>{T.tab_profile}</strong>.</div>
      )}
      <div style={{background:C.white,margin:"0 12px 12px",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <SecTitle>{T.completed_trainings}</SecTitle>
        {uniqueCompleted.map((c,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 18px",borderTop:i>0?`1px solid ${C.grey}`:"none"}}>
              <div style={{width:4,alignSelf:"stretch",background:LVL_COLOR[c.training.level],borderRadius:2,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:C.black}}>{c.training.title}</div>
                <div style={{fontSize:12,color:C.greyMid,marginTop:2}}>{c.training.category} · {c.training.duration} · {c.date}</div>
              </div>
              {c.training.category !== "quiz" && <button style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"7px 12px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}} onClick={() => setCertEntry(c)}>{T.certificate}</button>}
              {c.training.category === "quiz" && <button style={{background:"#F0F7E0",border:"none",color:"#6E9430",padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",borderRadius:4}} onClick={() => setQuizResult(c)}>🏆 Wynik</button>}
            </div>
          ))}
      </div>
    </div>
  );
}
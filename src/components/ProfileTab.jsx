import { useState, memo } from "react";
import { C, GROUPS } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { db } from "../lib/supabase";
import { calcProgress } from "../lib/helpers";
import { Toggle, SecTitle } from "./SharedUI";
import { log, warn, err as logErr } from "../lib/logger";
import { useT, useLang } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { GramTab } from "./GramTab";

export function ProfileTab({ completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView }) {
  const { user, setUser } = useUser();
  const T = useT();
  const { lang, switchLang } = useLang();
  const [editName,  setEditName]  = useState(user.displayName);
  const [editRole,  setEditRole]  = useState(user.displayRole || "");
  const [editFirma, setEditFirma] = useState(user.firma || "");
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveErr,   setSaveErr]   = useState("");
  const [showGram,  setShowGram]  = useState(false);
  const progress = calcProgress(completed, activeGroups);

  async function saveProfile() {
    const name  = editName.trim()  || user.name;
    const role  = editRole.trim()  || null;
    const firma = editFirma.trim() || null;
    setSaving(true); setSaveErr("");
    try {
      log("[SAVE PROFILE] updating user id:", user.id, { name, role, firma });
      const res = await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, { name, role, firma });
      log("[SAVE PROFILE] result:", res);
      if (!res || res.length === 0) {
        warn("[SAVE PROFILE] OSTRZEŻENIE: update zwrócił pustą tablicę — prawdopodobnie RLS blokuje UPDATE na tabeli users");
        setSaveErr(T.no_permission);
        return;
      }
      setUser(p => ({...p, displayName:name, displayRole:role||"", firma:firma||"", name, role}));
      setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch(e) {
      logErr("[SAVE PROFILE] ERROR:", e.message);
      setSaveErr(T.save_error + e.message);
    }
    finally { setSaving(false); }
  }

  async function toggleGroup(gid) {
    const next = activeGroups.includes(gid) ? activeGroups.filter(x => x!==gid) : [...activeGroups, gid];
    setActiveGroups(next);
    try {
      const res = await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, { active_groups:next });
      log("[TOGGLE GROUP] result:", res);
      if (!res || res.length === 0) warn("[TOGGLE GROUP] RLS może blokować UPDATE na active_groups");
    } catch(e) { logErr("[TOGGLE GROUP] ERROR:", e.message); }
  }

  const initials = user.displayName.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
  const subtitle = [user.displayRole, user.firma].filter(Boolean).join(" · ");

  return (
    <>
      <div style={{background:C.greyBg,flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      <div style={{background:C.white,borderBottom:`1px solid ${C.grey}`,padding:20,display:"flex",gap:16,alignItems:"center"}}>
        <div style={{width:52,height:52,background:C.black,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{color:C.white,fontWeight:700,fontSize:18}}>{initials}</span>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:18,fontWeight:700,color:C.black,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.displayName}</div>
          {subtitle && <div style={{fontSize:12,color:C.greyDk,marginTop:2}}>{subtitle}</div>}
          <div style={{fontSize:11,color:C.greyMid,marginTop:2}}>{user.email}</div>
          {saved && <div style={{fontSize:11,color:C.green,marginTop:3,fontWeight:600}}>✓ Zapisano zmiany</div>}
        </div>
        <button style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}} onClick={() => { setEditing(true); setSaved(false); }}>Edytuj</button>
      </div>

      {editing && (
        <div style={{background:C.white,margin:"8px 12px 0",padding:20,boxShadow:"0 1px 3px rgba(0,0,0,.08)",borderTop:`3px solid ${C.green}`}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:16,textTransform:"uppercase"}}>Edytuj dane</div>
          {[[T.full_name,editName,setEditName,T.example_name],[T.position,editRole,setEditRole,T.optional],[T.company,editFirma,setEditFirma,T.optional]].map(([lbl,val,set,ph]) => (
            <div key={lbl} style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>{lbl}</label>
              <input style={{width:"100%",border:"none",borderBottom:`2px solid ${C.green}`,padding:"9px 0",fontSize:15,color:C.black,outline:"none",boxSizing:"border-box"}}
                value={val} placeholder={ph} onChange={e => set(e.target.value)}/>
            </div>
          ))}
          {saveErr && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{saveErr}</div>}
          <div style={{fontSize:11,color:C.greyMid,marginBottom:16}}>Widoczne w aplikacji i na certyfikatach. E-mail pozostaje bez zmian.</div>
          <div style={{display:"flex",gap:8}}>
            <button style={{flex:1,background:saving?C.greyDk:C.black,border:"none",color:C.white,padding:12,fontSize:13,fontWeight:600,cursor:saving?"not-allowed":"pointer"}} onClick={saveProfile} disabled={saving}>{saving?T.saving:T.save}</button>
            <button style={{flex:1,background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:12,fontSize:13,fontWeight:600,cursor:"pointer"}} onClick={() => { setEditing(false); setEditName(user.displayName); setEditRole(user.displayRole||""); setEditFirma(user.firma||""); setSaveErr(""); }}>Anuluj</button>
          </div>
        </div>
      )}

      <div style={{padding:"8px 12px 40px",display:"flex",flexDirection:"column",gap:8}}>

        {/* ENGEL Virtual Expert Academy — na górze */}
        <div style={{background:C.white}}>
          <button
            onClick={() => setShowGram(true)}
            style={{width:"100%",padding:"14px 18px",background:"none",border:"none",display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left"}}>
            <div style={{width:40,height:40,background:C.black,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:20}}>🎮</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:C.black}}>Virtual Expert Academy</div>
              <div style={{fontSize:11,color:C.greyMid,marginTop:2}}>Punkty · Ranking · Certyfikat</div>
            </div>
            <span style={{fontSize:20,color:C.greyMid}}>›</span>
          </button>
        </div>

        <div style={{background:C.white}}>
          {trainerView !== "trainer" && <>
            <SecTitle>{T.training_groups}</SecTitle>
            {GROUPS.map(g => {
              const active = activeGroups.includes(g.id);
              const gT = TRAININGS.filter(t => t.group===g.id);
              const gD = completed.filter(c => gT.some(t => t.id===c.training.id)).length;
              return (
                <div key={g.id} style={{padding:"13px 18px",borderBottom:`1px solid ${C.grey}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:active?g.color:C.grey,flexShrink:0,display:"inline-block"}}/>
                      <span style={{fontSize:14,fontWeight:active?700:400,color:active?C.black:C.greyMid}}>{g.label}</span>
                    </div>
                    <div style={{fontSize:11,color:C.greyMid,paddingLeft:20}}>{gT.length} szkoleń{active?` · ${gD} ${T.completed_word}`:""}</div>
                  </div>
                  <Toggle value={active} color={g.color} onChange={() => toggleGroup(g.id)}/>
                </div>
              );
            })}
            {activeGroups.length > 0 && (
              <div style={{padding:"12px 18px",background:C.greyBg,borderTop:`1px solid ${C.grey}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:12,color:C.greyDk}}>Łączny postęp</span>
                  <span style={{fontSize:16,fontWeight:700,color:C.green}}>{progress.pct}%</span>
                </div>
                <div style={{height:4,background:C.grey}}><div style={{height:"100%",background:C.green,width:`${progress.pct}%`,transition:"width .5s"}}/></div>
                <div style={{fontSize:11,color:C.greyMid,marginTop:4}}>{progress.done} / {progress.total} szkoleń zaliczonych</div>
              </div>
            )}
          </>}
          {/* Panel Klienta toggle — tylko dla kont trenerów */}
          {user.trainer_id != null && trainerView !== undefined && (
            <div style={{padding:"13px 18px",borderTop:`1px solid ${C.grey}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:trainerView==="client"?C.green:C.grey,flexShrink:0,display:"inline-block"}}/>
                  <span style={{fontSize:14,fontWeight:trainerView==="client"?700:400,color:trainerView==="client"?C.black:C.greyMid}}>Panel Klienta</span>
                </div>
                <div style={{fontSize:11,color:C.greyMid,paddingLeft:20}}>
                  {trainerView==="client" ? "Widok aktywny" : "Widok trenera aktywny"}
                </div>
              </div>
              <Toggle value={trainerView==="client"} color={C.green} onChange={() => setTrainerView && setTrainerView(trainerView==="client" ? "trainer" : "client")}/>
            </div>
          )}
        </div>

        <div style={{background:C.white}}>
          <SecTitle>{T.language_section}</SecTitle>
          <div style={{padding:"14px 18px",display:"flex",gap:8}}>
            {["pl","en"].map(l => (
              <button key={l} onClick={() => switchLang(l)}
                style={{flex:1,padding:"12px",fontSize:13,fontWeight:700,border:`2px solid ${lang===l?C.black:C.grey}`,background:lang===l?C.black:C.white,color:lang===l?C.white:C.greyDk,cursor:"pointer",letterSpacing:.5}}>
                {l === "pl" ? "🇵🇱  Polski" : "🇬🇧  English"}
              </button>
            ))}
          </div>
        </div>

        {/* Informacja o bezpieczeństwie */}
        <div style={{background:C.white,padding:"14px 18px",borderTop:`3px solid ${C.green}`}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:8,textTransform:"uppercase"}}>Bezpieczeństwo konta</div>
          <div style={{fontSize:12,color:C.greyMid,lineHeight:1.6,marginBottom:4}}>Twoje hasło jest szyfrowane przez Supabase Auth. Aby zmienić hasło, wyloguj się i użyj opcji "Zapomniałem hasła".</div>
        </div>

        <button style={{background:C.black,border:"none",color:C.white,padding:16,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8}} onClick={onLogout}>Wyloguj się</button>
      </div>
    </div>
    {showGram && <GramTab onClose={() => setShowGram(false)}/>}
    </>
  );
}
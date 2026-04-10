import { useState, lazy, Suspense } from "react";
import { C, GROUPS } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { db } from "../lib/supabase";
import { calcProgress } from "../lib/helpers";
import { Toggle, SecTitle, Spinner } from "./SharedUI";
import { log, warn, err as logErr } from "../lib/logger";
import { useT, useLang } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";

// ─── LAZY — GramTab (~gamifikacja) ładuje się tylko gdy użytkownik kliknie
// przycisk 🔥. Nie wchodzi do chunk shared-tabs przy starcie.
const GramTab = lazy(() => import("./GramTab").then(m => ({ default: m.GramTab })));

/* ─── Modal potwierdzenia zmiany nazwiska ─────────────────────────────────
 * Wyświetlany PRZED zapisem gdy user zmienia imię/nazwisko.
 * Po potwierdzeniu: zapis + name_locked=true → pole blokuje się na zawsze.
 */
function NameChangeConfirmModal({ oldName, newName, onConfirm, onCancel, T }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: C.white, borderRadius: 12, maxWidth: 380, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "#2C2C2C", padding: "18px 20px",
          borderBottom: `4px solid #e67e22`,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>
            {T.name_lock_modal_title}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            {T.name_lock_modal_subtitle}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ fontSize: 13, color: C.greyDk, lineHeight: 1.6, marginBottom: 16 }}>
            {T.name_lock_modal_body}
          </div>

          {/* Zmiana */}
          <div style={{
            background: "#FFF8F0", border: "1px solid #f0c080", borderRadius: 8,
            padding: "12px 14px", marginBottom: 16, fontSize: 13,
          }}>
            <div style={{ color: C.greyMid, marginBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: .5 }}>
              {T.name_lock_modal_label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                background: "#fde8e8", color: "#7a1a12", padding: "3px 10px",
                borderRadius: 6, fontWeight: 600, textDecoration: "line-through",
              }}>{oldName}</span>
              <span style={{ color: C.greyMid, fontSize: 16 }}>→</span>
              <span style={{
                background: "rgba(138,183,62,.15)", color: "#3a5a10", padding: "3px 10px",
                borderRadius: 6, fontWeight: 700,
              }}>{newName}</span>
            </div>
          </div>

          <div style={{
            fontSize: 12, color: "#7a4a00", lineHeight: 1.5,
            background: "#fffbea", border: "1px solid #f5d78e",
            borderRadius: 8, padding: "10px 12px", marginBottom: 20,
          }}>
            {T.name_lock_modal_footer}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${C.grey}` }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: 16, background: C.white, border: "none",
              borderRight: `1px solid ${C.grey}`, fontSize: 14, fontWeight: 600,
              color: C.greyDk, cursor: "pointer",
            }}>
            {T.name_lock_cancel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: 16, background: "#e67e22", border: "none",
              fontSize: 14, fontWeight: 700, color: C.white, cursor: "pointer",
            }}>
            {T.name_lock_confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfileTab({ completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView }) {
  const { user, setUser } = useUser();
  const T = useT();
  const { lang, switchLang } = useLang();
  const [editName,       setEditName]       = useState(user.displayName);
  const [editStanowisko, setEditStanowisko] = useState(user.stanowisko || "");
  const [editFirma,      setEditFirma]      = useState(user.firma || "");
  const [editPhone,      setEditPhone]      = useState(user.phone || "");
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveErr,   setSaveErr]   = useState("");
  const [showGram,  setShowGram]  = useState(false);

  // Modal potwierdzenia zmiany nazwiska
  const [pendingNameSave, setPendingNameSave] = useState(false);

  const progress = calcProgress(completed, activeGroups);

  // Czy użytkownik próbuje zmienić imię/nazwisko?
  const nameChanged = editName.trim() !== "" && editName.trim() !== user.displayName;

  async function doSaveProfile(lockName) {
    const name       = editName.trim()       || user.name;
    const stanowisko = editStanowisko.trim() || null;
    const firma      = editFirma.trim()      || null;
    const phone      = editPhone.trim()      || null;
    setSaving(true); setSaveErr("");
    try {
      const payload = { name, stanowisko, firma, phone };
      // Jeśli zmieniano nazwisko — przy tej samej operacji zapisujemy blokadę
      if (lockName) payload.name_locked = true;

      log("[SAVE PROFILE] updating user id:", user.id, payload);
      const res = await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, payload);
      log("[SAVE PROFILE] result:", res);
      if (!res || res.length === 0) {
        warn("[SAVE PROFILE] OSTRZEŻENIE: update zwrócił pustą tablicę — prawdopodobnie RLS blokuje UPDATE na tabeli users");
        setSaveErr(T.no_permission);
        return;
      }
      setUser(p => ({
        ...p,
        displayName: name, displayRole: stanowisko || "", stanowisko,
        firma: firma || "", name, phone,
        ...(lockName ? { name_locked: true } : {}),
      }));
      setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch(e) {
      logErr("[SAVE PROFILE] ERROR:", e.message);
      setSaveErr(T.save_error + e.message);
    } finally {
      setSaving(false);
      setPendingNameSave(false);
    }
  }

  async function saveProfile() {
    // Jeśli imię/nazwisko się zmieniło i nie jest jeszcze zablokowane → pokaż modal
    if (nameChanged && !user.name_locked) {
      setPendingNameSave(true);
      return;
    }
    await doSaveProfile(false);
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
  const subtitle = [user.stanowisko, user.firma].filter(Boolean).join(" · ");

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
          {user.phone && <div style={{fontSize:11,color:C.greyMid,marginTop:1}}>📞 {user.phone}</div>}
          {saved && <div style={{fontSize:11,color:C.green,marginTop:3,fontWeight:600}}>✓ Zapisano zmiany</div>}
        </div>
        <button style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}} onClick={() => { setEditing(true); setSaved(false); }}>Edytuj</button>
      </div>

      {editing && (
        <div style={{background:C.white,margin:"8px 12px 0",padding:20,boxShadow:"0 1px 3px rgba(0,0,0,.08)",borderTop:`3px solid ${C.green}`}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:16,textTransform:"uppercase"}}>Edytuj dane</div>

          {/* ── Pole imię i nazwisko — z logiką blokady ── */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>
              {T.full_name}
              {user.name_locked && (
                <span style={{
                  marginLeft:8, fontSize:10, fontWeight:700, letterSpacing:.5,
                  color:"#7a4a00", background:"#fffbea", border:"1px solid #f5d78e",
                  borderRadius:4, padding:"2px 7px",
                }}>
                  {T.name_lock_badge}
                </span>
              )}
            </label>
            <input
              style={{
                width:"100%", border:"none",
                borderBottom:`2px solid ${user.name_locked ? C.grey : C.green}`,
                padding:"9px 0", fontSize:15,
                color: user.name_locked ? C.greyMid : C.black,
                outline:"none", boxSizing:"border-box",
                background: "transparent",
                cursor: user.name_locked ? "not-allowed" : "text",
              }}
              value={editName}
              placeholder={T.example_name}
              disabled={user.name_locked}
              onChange={e => setEditName(e.target.value)}
            />
            {user.name_locked ? (
              <div style={{fontSize:11,color:"#7a4a00",marginTop:5,lineHeight:1.4}}>
                {T.name_lock_frozen_hint}
              </div>
            ) : (
              <div style={{fontSize:11,color:C.greyMid,marginTop:5,lineHeight:1.4}}>
                {T.name_lock_hint}
              </div>
            )}
          </div>

          {/* Pozostałe pola — bez blokady */}
          {[[T.position,editStanowisko,setEditStanowisko,T.optional],[T.company,editFirma,setEditFirma,T.optional],["Telefon (opcjonalnie)",editPhone,setEditPhone,"np. +48 600 000 000"]].map(([lbl,val,set,ph]) => (
            <div key={lbl} style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>{lbl}</label>
              <input style={{width:"100%",border:"none",borderBottom:`2px solid ${C.green}`,padding:"9px 0",fontSize:15,color:C.black,outline:"none",boxSizing:"border-box"}}
                value={val} placeholder={ph} onChange={e => set(e.target.value)}/>
            </div>
          ))}

          {saveErr && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{saveErr}</div>}
          <div style={{fontSize:11,color:C.greyMid,marginBottom:16}}>{T.profile_note}</div>
          <div style={{display:"flex",gap:8}}>
            <button style={{flex:1,background:saving?C.greyDk:C.black,border:"none",color:C.white,padding:12,fontSize:13,fontWeight:600,cursor:saving?"not-allowed":"pointer"}} onClick={saveProfile} disabled={saving}>{saving?T.saving:T.save}</button>
            <button style={{flex:1,background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:12,fontSize:13,fontWeight:600,cursor:"pointer"}} onClick={() => { setEditing(false); setEditName(user.displayName); setEditStanowisko(user.stanowisko||""); setEditFirma(user.firma||""); setEditPhone(user.phone||""); setSaveErr(""); }}>{T.cancel}</button>
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
              <div style={{fontSize:11,color:C.greyMid,marginTop:2}}>{T.points_ranking}</div>
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
                  <span style={{fontSize:12,color:C.greyDk}}>{T.overall_progress}</span>
                  <span style={{fontSize:16,fontWeight:700,color:C.green}}>{progress.pct}%</span>
                </div>
                <div style={{height:4,background:C.grey}}><div style={{height:"100%",background:C.green,width:`${progress.pct}%`,transition:"width .5s"}}/></div>
                <div style={{fontSize:11,color:C.greyMid,marginTop:4}}>{progress.done} / {progress.total} {T.trainings_done}</div>
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
                  {trainerView==="client" ? T.view_active : T.trainer_view_active}
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
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:8,textTransform:"uppercase"}}>{T.account_security}</div>
          <div style={{fontSize:12,color:C.greyMid,lineHeight:1.6,marginBottom:4}}>{T.security_note}</div>
        </div>

        <button style={{background:C.black,border:"none",color:C.white,padding:16,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8}} onClick={onLogout}>{T.logout}</button>
      </div>
    </div>

    {/* Modal potwierdzenia zmiany nazwiska */}
    {pendingNameSave && (
      <NameChangeConfirmModal
        oldName={user.displayName}
        newName={editName.trim()}
        onConfirm={() => doSaveProfile(true)}
        onCancel={() => setPendingNameSave(false)}
        T={T}
      />
    )}

    {showGram && <Suspense fallback={<Spinner/>}><GramTab onClose={() => setShowGram(false)}/></Suspense>}
    </>
  );
}

import { useState, useEffect, useMemo } from "react";
import { C, GROUPS } from "../../lib/constants";
import { TRAININGS } from "../../data/trainings";
import { db, realtime } from "../../lib/supabase";

export function AdminInterested({ token, onContactedChange }) {
  const [interests,  setInterests]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null); // id kasowanego rekordu lub "group-{sid}"

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await db.get(
          token,
          "training_interests",
          "select=*,scheduled:scheduled_trainings(id,date,end_date,training_id,custom_name)&order=created_at.asc"
        );
        setInterests(Array.isArray(data) ? data : []);
      } catch(e) {
        setError("Błąd ładowania danych: " + e.message);
        setInterests([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    
    // Auto-odświeżanie po nadejściu UPDATE/INSERT/DELETE z Supabase
    const unsub = realtime.onNewInterest(token, () => {
      // Pobieramy dane od nowa tłem bez setLoading(true) żeby nie migało
      db.get(
        token,
        "training_interests",
        "select=*,scheduled:scheduled_trainings(id,date,end_date,training_id,custom_name)&order=created_at.asc"
      ).then(data => {
        setInterests(Array.isArray(data) ? data : []);
      }).catch(() => {});
    });
    
    return () => unsub();
  }, [token]);

  // Automatyczne czyszczenie zgłoszeń dla miniónych szkoleń
  useEffect(() => {
    async function cleanupPastInterests() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        // Pobierz ID szkoleń które się już odbyły
        const past = await db.get(token, "scheduled_trainings",
          `select=id&date=lt.${today}&end_date=is.null`);
        const pastMulti = await db.get(token, "scheduled_trainings",
          `select=id&end_date=lt.${today}`);
        const ids = [
          ...( Array.isArray(past)      ? past      : [] ),
          ...( Array.isArray(pastMulti) ? pastMulti : [] ),
        ].map(r => r.id);
        const unique = [...new Set(ids)];
        if (unique.length === 0) return;
        await db.remove(token, "training_interests",
          `scheduled_training_id=in.(${unique.join(",")})`);
      } catch(e) {
        console.warn("[AdminInterested] cleanup error:", e.message);
      }
    }
    cleanupPastInterests();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteItem(item) {
    if (!window.confirm(`Usunąć zgłoszenie od ${item.name || item.email || "tej osoby"}?`)) return;
    setDeletingId(item.id);
    try {
      await db.remove(token, "training_interests", `id=eq.${item.id}`);
      setInterests(prev => prev.filter(i => i.id !== item.id));
      if (onContactedChange) onContactedChange();
    } catch(e) {
      alert("Błąd usuwania: " + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleContacted(item) {
    if (updatingId === item.id) return;
    setUpdatingId(item.id);
    try {
      const newVal = !item.contacted;
      await db.update(token, "training_interests", `id=eq.${item.id}`, {
        contacted:    newVal,
        contacted_at: newVal ? new Date().toISOString() : null,
      });
      setInterests(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, contacted: newVal, contacted_at: newVal ? new Date().toISOString() : null }
          : i
      ));
      if (onContactedChange) onContactedChange();
    } catch(e) {
      console.error("[AdminInterested] toggleContacted error:", e);
    } finally {
      setUpdatingId(null);
    }
  }

  // Grupuj po scheduled_training_id, sortuj grupy wg daty rosnąco
  const groups = useMemo(() => {
    const map = new Map();
    interests.forEach(item => {
      const sid = item.scheduled_training_id;
      if (!map.has(sid)) {
        map.set(sid, { scheduled: item.scheduled, items: [] });
      }
      map.get(sid).items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => {
      const da = a.scheduled?.date || "";
      const db2 = b.scheduled?.date || "";
      return da.localeCompare(db2);
    });
  }, [interests]);

  const totalCount     = interests.length;
  const contactedCount = interests.filter(i => i.contacted).length;

  return (
    <div style={{
      flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch",
      background:C.greyBg, display:"flex", flexDirection:"column",
    }}>
      {/* ── nagłówek z licznikami ── */}
      <div style={{
        background:C.white, borderBottom:`1px solid ${C.grey}`,
        padding:"14px 16px", display:"flex", gap:16, alignItems:"center",
        flexWrap:"wrap",
      }}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyMid,textTransform:"uppercase",marginBottom:2}}>
            Zainteresowani
          </div>
          <div style={{fontSize:12,color:C.greyDk}}>
            {totalCount === 0
              ? "Brak zgłoszeń"
              : `${totalCount} ${totalCount === 1 ? "zgłoszenie" : totalCount < 5 ? "zgłoszenia" : "zgłoszeń"}`
            }
            {totalCount > 0 && (
              <span style={{marginLeft:8,color:C.greenDk,fontWeight:700}}>
                · {contactedCount} skontaktowanych
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── stany ładowania / błędu / brak danych ── */}
      {loading && (
        <div style={{textAlign:"center",padding:32,color:C.greyMid,fontSize:13}}>Ładowanie…</div>
      )}
      {!loading && error && (
        <div style={{margin:16,padding:"12px 16px",background:"#FDEDEC",border:`1px solid ${C.red}`,borderRadius:6,fontSize:13,color:C.red}}>
          {error}
        </div>
      )}
      {!loading && !error && groups.length === 0 && (
        <div style={{textAlign:"center",padding:48,color:C.greyMid,fontSize:13}}>
          <div style={{fontSize:28,marginBottom:12}}>📭</div>
          Żaden uczestnik nie wyraził jeszcze zainteresowania szkoleniem.
        </div>
      )}

      {/* ── grupy szkoleń ── */}
      {!loading && !error && (
        <div style={{padding:"10px 12px 24px", display:"flex", flexDirection:"column", gap:16}}>
          {groups.map(group => {
            const sched = group.scheduled;
            const trainingId = sched?.training_id;
            const t = trainingId && trainingId !== "ST"
              ? TRAININGS.find(x => x.id === trainingId)
              : null;
            const grp   = t ? GROUPS.find(g => g.id === t.group) : null;
            const isST  = trainingId === "ST";
            const barColor = isST ? "#8E44AD" : (grp?.color || C.green);
            const trainingTitle = isST
              ? (sched?.custom_name || "Szkolenie specjalne")
              : (t?.title || trainingId || "—");

            const dateStr = sched?.date || "";
            const dateObj = dateStr ? new Date(dateStr + "T00:00:00") : null;
            const dateLabel = dateObj
              ? dateObj.toLocaleDateString("pl-PL", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
              : "—";

            const endDateStr = sched?.end_date;
            const dateRange  = endDateStr && endDateStr !== dateStr
              ? `${dateStr} – ${endDateStr}`
              : dateStr;

            const groupContacted  = group.items.filter(i => i.contacted).length;
            const groupTotal      = group.items.length;

            return (
              <div key={sched?.id || dateStr} style={{
                background:C.white,
                borderRadius:8,
                boxShadow:"0 1px 3px rgba(0,0,0,.07)",
                overflow:"hidden",
              }}>
                  {/* nagłówek szkolenia */}
                <div style={{
                  borderLeft:`4px solid ${barColor}`,
                  padding:"12px 14px",
                  background:C.white,
                  borderBottom:`1px solid ${C.grey}`,
                }}>
                  <div style={{fontSize:11,fontWeight:700,color:barColor,marginBottom:3,textTransform:"capitalize"}}>
                    {dateLabel}
                    {endDateStr && endDateStr !== dateStr && (
                      <span style={{fontWeight:400,color:C.greyMid}}> – {endDateStr}</span>
                    )}
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:6}}>
                    {trainingTitle}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    {isST ? (
                      <span style={{fontSize:9,fontWeight:700,color:"#8E44AD",background:"#F9F0FF",padding:"2px 7px"}}>⭐ ST</span>
                    ) : grp ? (
                      <span style={{fontSize:9,fontWeight:700,color:grp.color,background:`${grp.color}18`,padding:"2px 7px"}}>{grp.label}</span>
                    ) : null}
                    <span style={{fontSize:11,color:C.greyMid}}>
                      {groupContacted === groupTotal
                        ? <span style={{color:C.greenDk,fontWeight:700}}>✓ Wszyscy skontaktowani ({groupTotal})</span>
                        : <>{groupTotal} {groupTotal === 1 ? "osoba" : "osoby"} · <span style={{color:C.greenDk,fontWeight:700}}>{groupContacted} skontaktowanych</span></>
                      }
                    </span>
                  </div>
                </div>

                {/* lista osób */}
                <div>
                  {group.items.map((item, idx) => {
                    const isUpdating    = updatingId === item.id;
                    const isContacted   = item.contacted;
                    const contactedDate = item.contacted_at
                      ? new Date(item.contacted_at).toLocaleDateString("pl-PL", { day:"numeric", month:"short" })
                      : null;

                    return (
                      <div key={item.id} style={{
                        padding:"12px 14px",
                        borderBottom: idx < group.items.length - 1 ? `1px solid ${C.grey}` : "none",
                        display:"flex",alignItems:"flex-start",gap:12,
                        background: isContacted ? "#FAFFF5" : C.white,
                        transition:"background .2s",
                        opacity: item.is_withdrawn ? 0.6 : 1,
                      }}>
                        {/* inicjały */}
                        <div style={{
                          width:36,height:36,borderRadius:"50%",flexShrink:0,
                          background:isContacted ? C.greenBg : C.greyBg,
                          border:`1.5px solid ${isContacted ? C.green : C.grey}`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:13,fontWeight:700,
                          color:isContacted ? C.greenDk : C.greyDk,
                        }}>
                          {(item.name || "?").split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                        </div>

                        {/* dane osoby */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:isContacted?C.greyDk:C.black,marginBottom:2,textDecoration:item.is_withdrawn?"line-through":"none"}}>
                            {item.name || "—"}
                          </div>
                          {item.is_withdrawn && (
                             <div style={{fontSize:10,background:C.greyBg,color:C.greyDk,display:"inline-block",padding:"2px 6px",borderRadius:4,fontWeight:700,marginBottom:4}}>Zrezygnował/a</div>
                          )}
                          <div style={{fontSize:11,color:C.greyMid,marginBottom:1}}>{item.email || "—"}</div>
                          {(item.firma || item.stanowisko) && (
                            <div style={{fontSize:11,color:C.greyMid,marginBottom:1}}>
                              {[item.stanowisko, item.firma].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {item.phone && (
                            <div style={{fontSize:11,color:C.greyMid}}>📞 {item.phone}</div>
                          )}
                          {isContacted && contactedDate && (
                            <div style={{fontSize:10,color:C.greenDk,marginTop:3,fontWeight:600}}>
                              ✓ Skontaktowano {contactedDate}
                            </div>
                          )}
                        </div>

                        {/* przycisk skontaktowane + usuń */}
                        <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"flex-end"}}>
                          <button
                            onClick={() => toggleContacted(item)}
                            disabled={isUpdating}
                            title={isContacted ? "Cofnij status" : "Oznacz jako skontaktowany"}
                            style={{
                              padding:"7px 12px",
                              fontSize:11,
                              fontWeight:700,
                              border:`1.5px solid ${isContacted ? C.green : C.grey}`,
                              borderRadius:6,
                              background: isContacted ? C.green : C.white,
                              color: isContacted ? C.white : C.greyMid,
                              cursor:isUpdating ? "not-allowed" : "pointer",
                              opacity:isUpdating ? 0.5 : 1,
                              transition:"all .15s",
                              whiteSpace:"nowrap",
                            }}
                          >
                            {isUpdating ? "…" : isContacted ? "Zapisano" : "Skontaktowano"}
                          </button>
                          <button
                            onClick={() => deleteItem(item)}
                            disabled={deletingId === item.id}
                            title="Usuń to zgłoszenie"
                            style={{
                              padding:"4px 8px",
                              fontSize:10,
                              fontWeight:700,
                              border:`1px solid ${C.red}`,
                              borderRadius:4,
                              background:"none",
                              color:C.red,
                              cursor:deletingId === item.id ? "not-allowed" : "pointer",
                              opacity:deletingId === item.id ? 0.5 : 1,
                              whiteSpace:"nowrap",
                            }}
                          >
                            {deletingId === item.id ? "…" : "🗑 Usuń"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

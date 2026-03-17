import { useState, useEffect, useMemo } from "react";
import { C, GROUPS } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { db } from "../lib/supabase";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";

// ── Święta publiczne (PL) ─────────────────────────────────────────────────
// Pobierane raz na rok z date.nager.at — bezpłatne API, bez klucza.
// Cache w localStorage — żadnego pollingu, święta się nie zmieniają.
async function fetchHolidaysForYear(year) {
  const key = `eea_holidays_PL_${year}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PL`);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    data.forEach(h => { map[h.date] = h.localName; });
    localStorage.setItem(key, JSON.stringify(map));
    return map;
  } catch { return {}; }
}

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function today() { return toISO(new Date()); }

function downloadICS(s, t) {
  const isST   = s.training_id === "ST";
  const title  = isST ? (s.custom_name || "Szkolenie specjalne") : t.title;
  const fileId = isST ? ("ST-" + (s.custom_name||"spec").replace(/\s+/g,"-").slice(0,20)) : t.id;
  const dateStart = s.date.replace(/-/g, "");
  const endRaw  = s.end_date || s.date;
  const endDate = new Date(endRaw + "T12:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const dateEnd = `${endDate.getFullYear()}${String(endDate.getMonth()+1).padStart(2,"0")}${String(endDate.getDate()).padStart(2,"0")}`;
  const isMultiDay = s.end_date && s.end_date !== s.date;
  const now  = new Date().toISOString().replace(/[-:.]/g,"").slice(0,15) + "Z";
  const uid  = `${s.id}-${dateStart}@engel-academy`;
  const ics  = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ENGEL Expert Academy//PL",
    "BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${now}`,
    isMultiDay ? `DTSTART;VALUE=DATE:${dateStart}` : `DTSTART;TZID=Europe/Warsaw:${dateStart}T083000`,
    isMultiDay ? `DTEND;VALUE=DATE:${dateEnd}`      : `DTEND;TZID=Europe/Warsaw:${dateStart}T160000`,
    `SUMMARY:${title}`,"DESCRIPTION:ENGEL Expert Academy","END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `szkolenie-${fileId}-${dateStart}.ics`; a.click();
  URL.revokeObjectURL(url);
}

export function ScheduleTab({ activeGroups }) {
  const { token } = useUser();
  const T = useT();
  const [scheduled, setScheduled]   = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [selected,  setSelected]    = useState(null);
  const [viewYear,  setViewYear]    = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth]   = useState(new Date().getMonth());
  const [holidays,  setHolidays]    = useState({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await db.get(token, "scheduled_trainings", "order=date.asc");
        const all = Array.isArray(data) ? data : [];
        const todayStr = toISO(new Date());
        setScheduled(all.filter(s =>
          (s.end_date || s.date) >= todayStr && !s.is_hidden && !s.is_outgoing
        ));
      } catch { setScheduled([]); }
      finally { setLoading(false); }
    }
    load();
  }, [token]);

  // Pobierz święta dla bieżącego i następnego roku przy starcie
  useEffect(() => {
    const thisYear = new Date().getFullYear();
    Promise.all([
      fetchHolidaysForYear(thisYear),
      fetchHolidaysForYear(thisYear + 1),
    ]).then(([a, b]) => setHolidays({ ...a, ...b }));
  }, []);

  // Jeśli użytkownik nawiguje do roku spoza cache — pobierz go
  useEffect(() => {
    const key = `eea_holidays_PL_${viewYear}`;
    if (!localStorage.getItem(key)) {
      fetchHolidaysForYear(viewYear).then(map =>
        setHolidays(prev => ({ ...prev, ...map }))
      );
    }
  }, [viewYear]);

  const visible = useMemo(() => scheduled.filter(s => {
    const t = TRAININGS.find(t => t.id === s.training_id);
    return (s.training_id === "ST") ? true : (t && activeGroups.includes(t.group));
  }), [scheduled, activeGroups]);

  const datesWithTrainings = useMemo(() => {
    const map = {};
    visible.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      if (s.training_id === "ST") {
        map[s.date].push("ST");
      } else {
        const t = TRAININGS.find(t => t.id === s.training_id);
        if (t) map[s.date].push(t.group);
      }
    });
    return map;
  }, [visible]);

  const displayItems = useMemo(() => {
    const now = today();
    if (selected) return visible.filter(s => s.date === selected);
    return visible.filter(s => s.date >= now).slice(0, 10);
  }, [visible, selected]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); }
    else setViewMonth(m => m-1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); }
    else setViewMonth(m => m+1);
  }

  const todayStr = today();

  return (
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:C.greyBg,display:"flex",flexDirection:"column",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>

      <div style={{background:C.white,margin:"12px 12px 0",borderRadius:8,boxShadow:"0 1px 3px rgba(0,0,0,.07)",padding:"12px 10px"}}>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.greyDk,padding:"4px 8px"}}>‹</button>
          <span style={{fontSize:14,fontWeight:700,color:C.black,letterSpacing:.3}}>
            {T.months[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.greyDk,padding:"4px 8px"}}>›</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
          {T.days_short.map((d, i) => (
            <div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color: C.greyMid,padding:"2px 0",letterSpacing:.5}}>{d}</div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
          {calendarDays.map((day, i) => {
            if (!day) return <div key={`e${i}`}/>;
            const iso = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const groups    = datesWithTrainings[iso] || [];
            const isToday   = iso === todayStr;
            const isSel     = iso === selected;
            const dow       = new Date(iso + "T00:00:00").getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isHoliday = !!holidays[iso];
            const isDayOff  = isWeekend || isHoliday;

            let bg = "transparent";
            if (isSel)         bg = C.black;
            else if (isToday)  bg = C.greenBg;
            else if (isDayOff) bg = "#f0f0f0";

            const numColor = isSel ? C.white : isToday ? C.greenDk : isDayOff ? "#aaa" : C.greyDk;

            return (
              <button key={iso} onClick={() => setSelected(isSel ? null : iso)}
                title={holidays[iso] || undefined}
                style={{
                  background: bg,
                  border: isToday && !isSel ? `1px solid ${C.green}` : isDayOff && !isSel ? "1px solid #ddd" : "1px solid transparent",
                  borderRadius: 6,
                  padding: "5px 2px 3px",
                  cursor: groups.length ? "pointer" : "default",
                  display:"flex", flexDirection:"column", alignItems:"stretch", gap:2,
                }}>
                <span style={{fontSize:12,fontWeight: isToday||isSel||isHoliday ? 700 : 400, color: numColor, textAlign:"center"}}>
                  {day}
                </span>
                {groups.length > 0 && (() => {
                  const uniq = [...new Set(groups)].slice(0,3);
                  return (
                    <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:2,width:"100%"}}>
                      {uniq.map((g, idx) => {
                        const dotColor = g === "ST" ? "#8E44AD" : (GROUPS.find(x => x.id===g)?.color || C.green);
                        return <div key={idx} style={{width:4,height:4,borderRadius:"50%",flexShrink:0,background: isSel ? C.white : dotColor}}/>;
                      })}
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>

        <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:10,paddingTop:8,borderTop:`1px solid ${C.grey}`,flexWrap:"wrap"}}>
          {GROUPS.filter(g => activeGroups.includes(g.id)).map(g => (
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:g.color}}/>
              <span style={{fontSize:10,color:C.greyMid}}>{g.label}</span>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#8E44AD"}}/>
            <span style={{fontSize:10,color:C.greyMid}}>Specjalne</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:2,background:"#f0f0f0",border:"1px solid #ddd"}}/>
            <span style={{fontSize:10,color:C.greyMid}}>Weekend / Święto</span>
          </div>
        </div>

      </div>

      <div style={{padding:"10px 12px 12px"}}>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1}}>
            {selected
              ? (() => {
                  const d = new Date(selected+"T00:00:00");
                  const holidayLabel = holidays[selected] ? ` · 🎌 ${holidays[selected]}` : "";
                  return `${d.getDate()} ${T.months[d.getMonth()]} ${d.getFullYear()}${holidayLabel}`;
                })()
              : T.upcoming_3}
          </span>
          {selected && (
            <button onClick={() => setSelected(null)}
              style={{background:"none",border:"none",fontSize:11,color:C.greyMid,cursor:"pointer",textDecoration:"underline"}}>
              pokaż najbliższe
            </button>
          )}
        </div>

        {loading && <div style={{textAlign:"center",padding:24,color:C.greyMid,fontSize:13}}>Ładowanie…</div>}

        {!loading && displayItems.length === 0 && (
          <div style={{textAlign:"center",padding:24,color:C.greyMid,fontSize:13}}>
            {selected ? T.no_trainings_day : T.no_trainings}
          </div>
        )}

        {!loading && displayItems.map((s, i) => {
          const isST = s.training_id === "ST";
          const t = isST ? null : TRAININGS.find(x => x.id === s.training_id);
          if (!isST && !t) return null;
          const grp = t ? GROUPS.find(g => g.id === t.group) : null;
          const barColor = isST ? "#8E44AD" : (grp?.color || C.green);
          const title = isST ? (s.custom_name || "Szkolenie specjalne") : t.title;
          const date = new Date(s.date + "T00:00:00");

          return (
            <div key={`${s.date}-${i}`} style={{
              background:C.white,borderRadius:8,padding:"12px 14px",marginBottom:8,
              boxShadow:"0 1px 3px rgba(0,0,0,.07)",
              borderLeft:`4px solid ${barColor}`
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:11,fontWeight:700,color:barColor}}>
                  {T.days_full[date.getDay()]}, {date.getDate()} {T.months[date.getMonth()]} {date.getFullYear()}
                </span>
                <span style={{fontSize:10,background:C.greyBg,border:`1px solid ${C.grey}`,padding:"2px 8px",borderRadius:4,color:C.greyDk,fontWeight:600}}>
                  8:30
                </span>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:4}}>{title}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:6,flexWrap:"wrap",marginTop:4}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {isST ? (
                    <span style={{fontSize:9,fontWeight:700,color:"#8E44AD",background:"#F9F0FF",padding:"2px 7px"}}>⭐ ST</span>
                  ) : (
                    <>
                      <span style={{fontSize:9,fontWeight:700,color:grp?.color,background:`${grp?.color}18`,padding:"2px 7px"}}>{grp?.label}</span>
                      <span style={{fontSize:9,color:C.greyMid,padding:"2px 4px"}}>{t.duration}</span>
                      <span style={{fontSize:9,color:C.greyMid,padding:"2px 4px"}}>ID: {t.id}</span>
                    </>
                  )}
                </div>
                {!isST ? (
                  <button onClick={() => downloadICS(s, t)}
                    title="Dodaj do kalendarza (.ics)"
                    style={{background:"#F0F7FF",border:"1px solid #0072C6",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}}>
                    📅
                  </button>
                ) : (
                  <button onClick={() => downloadICS(s, null)}
                    title="Dodaj do kalendarza (.ics)"
                    style={{background:"#F9F0FF",border:"1px solid #8E44AD",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}}>
                    📅
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

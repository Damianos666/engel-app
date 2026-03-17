import { useState, useEffect, useMemo, useRef } from "react";
import { C, GROUPS, TRAINERS } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { db } from "../lib/supabase";
import { useUser } from "../lib/UserContext";

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

const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
                   "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const ALL_TRAINERS = [1,2,3,4,5];
const LS_KEY = "eea_active_trainers";

// Punkt odniesienia do obliczania absolutnych pozycji dni
const EPOCH = new Date("2020-01-01T12:00:00");

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function pad(n) { return String(n).padStart(2,"0"); }

// Zwraca numer dnia od EPOCH (do pozycjonowania pasków)
function absDay(isoDate) {
  return Math.round((new Date(isoDate + "T12:00:00") - EPOCH) / 86400000);
}

function daysInMon(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Przesuwa {year,month} o delta miesięcy
function shiftMonth({ year, month }, delta) {
  let m = month + delta, y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0)  { m += 12; y--; }
  return { year: y, month: m };
}

function loadActiveTrainers(trainerNum) {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved !== null) return JSON.parse(saved);
  } catch {}
  return trainerNum != null ? [Number(trainerNum)] : ALL_TRAINERS;
}

export function TrainerScheduleTab({ trainerNum }) {
  const { token } = useUser();
  const now       = new Date();
  const todayISO  = toISO(now);

  const [scheduled,      setScheduled]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [notesModal,     setNotesModal]     = useState(null);
  const [activeTrainers, setActiveTrainers] = useState(() => loadActiveTrainers(trainerNum));
  const [visibleLabel,   setVisibleLabel]   = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [holidays,       setHolidays]       = useState({});

  // Nieskończony timeline — tablica widocznych miesięcy {year, month}
  // Startujemy z poprzednim, bieżącym i następnym miesiącem
  const [months, setMonths] = useState(() => {
    const cur = { year: now.getFullYear(), month: now.getMonth() };
    return [shiftMonth(cur, -1), cur, shiftMonth(cur, 1)];
  });

  const timelineRef         = useRef(null);
  const pendingScrollAdjust = useRef(0);  // korekta scrollLeft po dodaniu miesiąca z lewej
  const initialScrollDone   = useRef(false);
  const isExtending         = useRef(false); // blokuje wielokrotne wywołania podczas jednego scrollu

  // Liczba dni widocznych w oknie bez scrollowania — zmień 12 na inną wartość aby dostosować szerokość komórek
  const [cellW, setCellW] = useState(28); // wartość zastępcza — ResizeObserver natychmiast ją poprawi

  function toggleTrainer(n) {
    setActiveTrainers(prev => {
      const next = prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Oblicza offsety pikselowe każdego miesiąca od początku wstążki
  const { monthOffsets, totalWidth, originAbsDay } = useMemo(() => {
    if (!months.length) return { monthOffsets: [], totalWidth: 0, originAbsDay: 0 };
    const origin = absDay(`${months[0].year}-${pad(months[0].month + 1)}-01`);
    const offsets = [];
    let off = 0;
    for (const m of months) {
      offsets.push(off);
      off += daysInMon(m.year, m.month) * cellW;
    }
    return { monthOffsets: offsets, totalWidth: off, originAbsDay: origin };
  }, [months, cellW]);

  // Oblicz cellW na podstawie szerokości kontenera
  useEffect(() => {
    if (!timelineRef.current) return;
    function recalc() {
      if (!timelineRef.current) return;
      const available = timelineRef.current.clientWidth - 46;
      // Liczba dni widocznych w oknie bez scrollowania — zmień 12 na inną wartość aby dostosować szerokość komórek
      setCellW(available / 12);
    }
    const ro = new ResizeObserver(recalc);
    ro.observe(timelineRef.current);
    function onOrient() { setTimeout(recalc, 50); setTimeout(recalc, 150); setTimeout(recalc, 400); }
    window.addEventListener("orientationchange", onOrient);
    window.addEventListener("resize", recalc);
    recalc();
    return () => { ro.disconnect(); window.removeEventListener("orientationchange", onOrient); window.removeEventListener("resize", recalc); };
  }, []);

  // Jednorazowe przewinięcie do dzisiaj po załadowaniu
  useEffect(() => {
    if (!timelineRef.current || loading || cellW === 0 || initialScrollDone.current) return;
    initialScrollDone.current = true;
    const left = 46 + (absDay(todayISO) - originAbsDay) * cellW;
    timelineRef.current.scrollLeft = Math.max(0, left - timelineRef.current.clientWidth / 4);
  }, [loading, cellW, originAbsDay]);

  // Korekta scrollLeft po dodaniu miesiąca z lewej strony (zapobiega skokowi)
  useEffect(() => {
    if (pendingScrollAdjust.current !== 0 && timelineRef.current) {
      timelineRef.current.scrollLeft += pendingScrollAdjust.current;
      pendingScrollAdjust.current = 0;
    }
    isExtending.current = false;
  }, [months]);

  // Wczytaj dane
  useEffect(() => {
    setLoading(true);
    db.get(token, "scheduled_trainings", "order=date.asc&select=*")
      .then(data => setScheduled(Array.isArray(data) ? data : []))
      .catch(() => setScheduled([]))
      .finally(() => setLoading(false));
  }, [token]);


  // Pobierz święta PL — raz przy starcie, cache w localStorage
  useEffect(() => {
    const y = now.getFullYear();
    Promise.all([fetchHolidaysForYear(y), fetchHolidaysForYear(y + 1)])
      .then(([a, b]) => setHolidays({ ...a, ...b }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Obsługa scrolla — rozszerza wstążkę i aktualizuje etykietę miesiąca
  function onScroll() {
    const el = timelineRef.current;
    if (!el || cellW === 0 || isExtending.current) return;
    const sl    = el.scrollLeft;
    const vw    = el.clientWidth;
    const maxSl = el.scrollWidth - vw;

    // Aktualizuj etykietę widocznego miesiąca (patrzy na środek widoku)
    const centerX = sl + vw / 2;
    for (let i = monthOffsets.length - 1; i >= 0; i--) {
      if (centerX >= monthOffsets[i]) {
        const m = months[i];
        setVisibleLabel(prev => (prev.year === m.year && prev.month === m.month) ? prev : m);
        break;
      }
    }

    // Dodaj miesiąc z prawej gdy zostały < 2 ekrany do końca
    if (sl > maxSl - vw * 2) {
      isExtending.current = true;
      setMonths(prev => [...prev, shiftMonth(prev[prev.length - 1], 1)]);
    }

    // Dodaj miesiąc z lewej gdy zostało < 1 ekran do początku
    if (sl < vw && sl > 0) {
      isExtending.current = true;
      setMonths(prev => {
        const newMon = shiftMonth(prev[0], -1);
        pendingScrollAdjust.current = daysInMon(newMon.year, newMon.month) * cellW;
        return [newMon, ...prev];
      });
    }
  }

  // Tap → modal z notatkami
  function handleTap(entry) {
    const isST = entry.training_id === "ST";
    const t    = isST ? null : TRAININGS.find(x => x.id === entry.training_id);
    setNotesModal({
      title:        isST ? (entry.custom_name || "ST") : (t?.title || entry.training_id),
      notes:        entry.notes || "",
      participants: entry.participants_count,
      date:         entry.date,
      endDate:      entry.end_date,
      trainer:      entry.trainer_id,
    });
  }

  const trainersToShow = activeTrainers.length > 0 ? activeTrainers : ALL_TRAINERS;

  // Buduje paski szkoleń z absolutnymi pozycjami pikselowymi
  const trainerBars = useMemo(() => {
    if (!months.length) return {};
    const firstISO = `${months[0].year}-${pad(months[0].month + 1)}-01`;
    const lastMon  = months[months.length - 1];
    const lastISO  = `${lastMon.year}-${pad(lastMon.month + 1)}-${pad(daysInMon(lastMon.year, lastMon.month))}`;
    const origin   = absDay(firstISO);

    const result = {};
    for (const trainerId of trainersToShow) {
      result[trainerId] = scheduled
        .filter(s => Number(s.trainer_id) === trainerId)
        .map(s => {
          const startISO = s.date || "";
          const endISO   = s.end_date || s.date || "";
          if (!startISO || endISO < firstISO || startISO > lastISO) return null;

          const isST      = s.training_id === "ST";
          const training  = isST ? null : TRAININGS.find(t => t.id === s.training_id);
          const grp       = GROUPS.find(g => g.id === training?.group);
          const isPlanned = (s.status || "active") === "planned";
          const color     = isPlanned ? "#BBBBBB" : (isST ? "#8E44AD" : (grp?.color || "#2980B9"));
          const title     = isST ? (s.custom_name || "ST") : (training?.short || s.training_id);

          const cs    = startISO < firstISO ? firstISO : startISO;
          const ce    = endISO   > lastISO  ? lastISO  : endISO;
          const left  = (absDay(cs) - origin) * cellW;
          const width = Math.max(cellW - 2, (absDay(ce) - absDay(cs) + 1) * cellW - 2);

          return { id: s.id, entry: s, left, width, color, title, isPlanned, isHidden: s.is_hidden, isOutgoing: s.is_outgoing, participantsCount: s.participants_count };
        })
        .filter(Boolean);
    }
    return result;
  }, [scheduled, months, cellW, trainersToShow]);

  return (
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:C.greyBg,display:"flex",flexDirection:"column"}}>

      {/* ── Wstążka kalendarza ── */}
      <div style={{background:C.white,margin:"12px 12px 0",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.1)"}}>

        {/* Etykieta widocznego miesiąca — aktualizuje się dynamicznie przy scrollu */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"8px 10px",borderBottom:`1px solid ${C.grey}`}}>
          <span style={{fontSize:13,fontWeight:700,color:C.black}}>
            {MONTHS_PL[visibleLabel.month]} {visibleLabel.year}
          </span>
        </div>

        {loading ? (
          <div style={{padding:20,textAlign:"center",color:C.greyMid,fontSize:12}}>Ładowanie…</div>
        ) : (
          <div ref={timelineRef} onScroll={onScroll} style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <div style={{display:"inline-block",minWidth:"100%",verticalAlign:"top"}}>

              {/* Nagłówek dni — ciągły pasek przez wszystkie miesiące */}
              <div style={{display:"flex",borderBottom:`2px solid ${C.grey}`}}>
                <div style={{width:46,minWidth:46,flexShrink:0,background:"#f7f7f7",borderRight:`1px solid ${C.grey}`,fontSize:9,fontWeight:700,color:C.greyMid,display:"flex",alignItems:"center",justifyContent:"center",height:22}}>T</div>
                <div style={{display:"flex"}}>
                  {months.map((mon, mi) => {
                    const days = daysInMon(mon.year, mon.month);
                    return (
                      <div key={`${mon.year}-${mon.month}`} style={{display:"flex",position:"relative",borderLeft: mi > 0 ? `2px solid ${C.grey}` : "none"}}>
                        {/* Miniaturka nazwy miesiąca nad pierwszym dniem */}
                        <div style={{position:"absolute",top:1,left:3,fontSize:7,fontWeight:700,color:C.green,letterSpacing:.3,pointerEvents:"none",lineHeight:"9px"}}>
                          {MONTHS_PL[mon.month].slice(0,3).toUpperCase()}
                        </div>
                        {Array.from({length:days},(_,i)=>i+1).map(d=>{
                          const iso     = `${mon.year}-${pad(mon.month+1)}-${pad(d)}`;
                          const isToday   = iso === todayISO;
                          const isWe      = new Date(iso+"T12:00:00").getDay()%6===0;
                          const isHoliday = !!holidays[iso];
                          const isDayOff  = isWe || isHoliday;
                          return (
                            <div key={d} title={holidays[iso]||undefined} style={{width:cellW,minWidth:cellW,flexShrink:0,height:22,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:2,fontSize:9,fontWeight:isToday||isHoliday?700:400,color:isToday?C.greenDk:isDayOff?"#aaa":C.greyMid,background:isToday?C.greenBg:isDayOff?"#e8e8e8":"transparent",borderRight:"1px solid #efefef",boxSizing:"border-box"}}>
                              {d}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Wiersze trenerów */}
              {trainersToShow.map(trainerId => (
                <div key={trainerId} style={{display:"flex",borderBottom:`1px solid ${C.grey}`}}>
                  <div style={{width:46,minWidth:46,flexShrink:0,background:"#f7f7f7",borderRight:`1px solid ${C.grey}`,fontSize:9,fontWeight:700,color:C.greyDk,display:"flex",alignItems:"center",justifyContent:"center",height:30}}>T{trainerId}</div>

                  {/* Ciągłe tło z absolutnymi pozycjami */}
                  <div style={{position:"relative",height:30,width:totalWidth,flexShrink:0}}>

                    {/* Tło dni (weekendy, dzisiaj) */}
                    {months.map((mon,mi) => Array.from({length:daysInMon(mon.year,mon.month)},(_,i)=>i+1).map(d=>{
                      const iso     = `${mon.year}-${pad(mon.month+1)}-${pad(d)}`;
                      const isToday   = iso === todayISO;
                      const isWe      = new Date(iso+"T12:00:00").getDay()%6===0;
                      const isHoliday = !!holidays[iso];
                      const isDayOff  = isWe || isHoliday;
                      return <div key={`${mi}-${d}`} title={holidays[iso]||undefined} style={{position:"absolute",left:monthOffsets[mi]+(d-1)*cellW,top:0,width:cellW,height:"100%",background:isToday?"rgba(138,183,62,.12)":isDayOff?"rgba(0,0,0,.05)":"transparent",pointerEvents:"none"}}/>;
                    }))}

                    {/* Pionowe linie separatorów miesięcy */}
                    {monthOffsets.slice(1).map((off,i)=>(
                      <div key={i} style={{position:"absolute",left:off,top:0,width:2,height:"100%",background:C.grey,pointerEvents:"none",zIndex:1}}/>
                    ))}

                    {/* Paski szkoleń */}
                    {(trainerBars[trainerId]||[]).map((bar,bi)=>(
                      <div key={bi}
                        onClick={()=>handleTap(bar.entry)}
                        onContextMenu={e=>e.preventDefault()}
                        title="Przytrzymaj → notatki"
                        style={{position:"absolute",left:bar.left,top:4,height:22,width:bar.width,zIndex:2,background:bar.color,borderRadius:3,display:"flex",alignItems:"center",padding:"0 3px",gap:2,cursor:"pointer",overflow:"hidden",boxSizing:"border-box",opacity:bar.isPlanned?0.75:1,border:bar.isHidden?"1px solid rgba(0,0,0,.35)":"none"}}>
                        {bar.isHidden&&<span style={{flexShrink:0,fontSize:7,color:"rgba(255,255,255,.85)"}}>🔒</span>}
                        {bar.isOutgoing&&!bar.isHidden&&<span style={{flexShrink:0,fontSize:7,color:"rgba(255,255,255,.85)"}}>✈️</span>}
                        <span style={{fontSize:8,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{bar.title}{bar.isPlanned?" ···":""}</span>
                        {bar.participantsCount!=null && (
                          <span style={{flexShrink:0,background:"rgba(0,0,0,.35)",borderRadius:"50%",width:12,height:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",lineHeight:"12px",fontWeight:700}}>{bar.participantsCount>99?"99+":bar.participantsCount}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filtr trenerów */}
      <div style={{background:C.white,margin:"8px 12px 0",borderRadius:8,boxShadow:"0 1px 3px rgba(0,0,0,.07)",padding:"10px 12px"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Widok trenerów</div>
        <div style={{display:"flex",gap:6}}>
          {ALL_TRAINERS.map(n=>{
            const active = activeTrainers.includes(n);
            return (
              <button key={n} onClick={()=>toggleTrainer(n)}
                style={{flex:1,padding:"10px 0",fontSize:15,fontWeight:700,cursor:"pointer",border:`1.5px solid ${active?C.black:C.grey}`,background:active?C.black:C.white,color:active?C.white:C.greyDk,borderRadius:6,transition:"background .15s,border-color .15s"}}>
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista nadchodzących */}
      <div style={{margin:"8px 12px 12px",background:C.white,borderRadius:8,padding:14,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Nadchodzące</div>
        {scheduled
          .filter(s=>(s.end_date||s.date)>=todayISO&&(activeTrainers.length===0||activeTrainers.includes(Number(s.trainer_id))))
          .slice(0,20)
          .map(s=>{
            const isST      = s.training_id==="ST";
            const t         = isST?null:TRAININGS.find(x=>x.id===s.training_id);
            const grp       = GROUPS.find(g=>g.id===t?.group);
            const barColor  = isST?"#8E44AD":(grp?.color||C.grey);
            const isPlanned = (s.status||"active")==="planned";
            return (
              <div key={s.id}
                onClick={()=>handleTap(s)}
                onContextMenu={e=>e.preventDefault()}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.grey}`,opacity:isPlanned?0.6:1,cursor:"pointer"}}>
                <div style={{width:4,alignSelf:"stretch",background:isPlanned?"#BBBBBB":barColor,borderRadius:2,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.black,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {isST?(s.custom_name||"ST"):(t?.title||s.training_id)}
                    {isPlanned&&<span style={{fontSize:10,fontWeight:400,color:C.greyMid}}> · planowane</span>}
                    {s.is_hidden&&<span style={{fontSize:10,color:C.amber}}> 🔒</span>}
                    {s.is_outgoing&&!s.is_hidden&&<span style={{fontSize:10}}> ✈️</span>}
                  </div>
                  <div style={{fontSize:11,color:C.greyMid,display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span>{s.date}{s.end_date&&s.end_date!==s.date?` → ${s.end_date}`:""}</span>
                    {s.trainer_id&&<span>· T{s.trainer_id} {TRAINERS[s.trainer_id]}</span>}
                    {s.participants_count!=null&&<span>· 👥 {s.participants_count}</span>}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal notatek */}
      {notesModal&&(
        <div onClick={()=>setNotesModal(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.white,borderRadius:12,padding:20,width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,.25)"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.black,marginBottom:4}}>{notesModal.title}</div>
            <div style={{fontSize:11,color:C.greyMid,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}>
              <span>📅 {notesModal.date}{notesModal.endDate&&notesModal.endDate!==notesModal.date?` → ${notesModal.endDate}`:""}</span>
              {notesModal.trainer&&<span>· T{notesModal.trainer} {TRAINERS[notesModal.trainer]}</span>}
              {notesModal.participants!=null&&<span>· 👥 {notesModal.participants}</span>}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Notatki</div>
            <div style={{fontSize:13,color:notesModal.notes?C.black:C.greyMid,lineHeight:1.6,minHeight:60,whiteSpace:"pre-wrap"}}>
              {notesModal.notes||"Brak notatek"}
            </div>
            <button onClick={()=>setNotesModal(null)}
              style={{width:"100%",marginTop:16,background:C.black,color:C.white,border:"none",padding:12,fontSize:13,fontWeight:600,borderRadius:6,cursor:"pointer"}}>
              Zamknij
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

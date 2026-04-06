import { useState, useMemo, memo } from "react";
import { useT } from "../lib/LangContext";
import { C, GROUPS, LVL_COLOR, LVL_LABEL } from "../lib/constants";
import { TRAININGS } from "../data/trainings";

// ─── STYLE CONSTANTS ──────────────────────────────────────────────────────
const S = {
  wrap:      { background: C.greyBg, flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" },
  filterBar: { display: "flex", gap: 8, padding: "10px 12px", overflowX: "auto", background: C.white, borderBottom: `1px solid ${C.grey}` },
  countRow:  { padding: "8px 12px", fontSize: 11, color: C.greyMid },
  list:      { padding: "0 12px 32px", display: "flex", flexDirection: "column", gap: 8 },
};

// ─── CATALOG ITEM — memoized ─────────────────────────────────────────────
// Katalog może mieć 50+ pozycji. memo() = tylko kliknięta karta re-renderuje
// się przy expand/collapse, pozostałe 49 pozostają nienaruszone.
const CatalogItem = memo(function CatalogItem({ t, done, open, isActive, grp, completedEntry, onToggle, T }) {
  return (
    <div style={{ background: done ? C.doneBg : C.white, boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: done ? `1px solid ${C.doneBorder}` : "1px solid rgba(0,0,0,.06)", opacity: isActive ? 1 : .6 }}>
      <div style={{ borderLeft: `4px solid ${done ? "#7aa832" : LVL_COLOR[t.level]}`, padding: 16, cursor: "pointer" }} onClick={() => onToggle(t.id)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: done ? C.greenDk : C.greyMid }}>{t.category.toUpperCase()}</span>
              {grp && <span style={{ fontSize: 9, fontWeight: 700, color: grp.color, background: `${grp.color}18`, padding: "2px 7px" }}>{grp.label}</span>}
              {done && <span style={{ fontSize: 9, fontWeight: 700, color: C.greenDk, background: "rgba(138,183,62,.2)", padding: "2px 8px", letterSpacing: 1 }}>✓ ZALICZONE</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: done ? C.greyDk : C.black, lineHeight: 1.3, marginBottom: 6 }}>{t.title}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.greyMid, flexWrap: "wrap" }}>
              <span>📅 {t.duration}</span>
              <span style={{ color: LVL_COLOR[t.level] }}>{LVL_LABEL[t.level]}</span>
              <span style={{ fontFamily: "monospace", fontSize: 10 }}>ID: {t.id}</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: C.greyMid, marginLeft: 12, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${done ? "rgba(138,183,62,.25)" : C.grey}` }}>
            <p style={{ fontSize: 13, color: C.greyDk, lineHeight: 1.7, margin: 0 }}>{t.desc}</p>
            {done && completedEntry && (
              <div style={{ marginTop: 12, background: "rgba(138,183,62,.12)", border: `1px solid ${C.green}`, padding: "8px 14px", fontSize: 12, color: C.greenDk, display: "flex", justifyContent: "space-between" }}>
                <span>{T.done_inline}</span>
                <span style={{ fontFamily: "monospace" }}>{completedEntry.date}</span>
              </div>
            )}
            {!isActive && (
              <div style={{ marginTop: 8, background: "#FEF3E2", borderLeft: `3px solid ${C.amber}`, padding: "8px 12px", fontSize: 12, color: C.greyDk }}>
                {T.enable_group_msg} <strong>{grp?.label}</strong> {T.in_profile}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export function CatalogTab({ completed, activeGroups }) {
  const T = useT();
  const [filter,   setFilter]   = useState("Wszystkie");
  const [expanded, setExpanded] = useState(null);

  // useMemo — doneIds nie przelicza się przy każdym expand/collapse
  const doneIds = useMemo(() => new Set(completed.map(c => c.training.id)), [completed]);

  // useMemo — filtrowanie listy przy zmianie filtra, nie przy expand
  const list = useMemo(
    () => TRAININGS.filter(t => filter === T.all || (GROUPS.find(g => g.label === filter)?.id === t.group)),
    [filter, T.all]
  );

  // useMemo — mapa zaliczonych szkoleń dla szybkiego dostępu
  const completedMap = useMemo(
    () => new Map(completed.map(c => [c.training.id, c])),
    [completed]
  );

  const doneInList = useMemo(() => list.filter(t => doneIds.has(t.id)).length, [list, doneIds]);

  function handleToggle(id) {
    setExpanded(prev => prev === id ? null : id);
  }

  return (
    <div style={S.wrap}>
      <div style={S.filterBar}>
        {[T.all, ...GROUPS.map(g => g.label)].map(c => (
          <button key={c}
            style={{ background: filter === c ? C.black : C.white, color: filter === c ? C.white : C.greyDk, border: `1px solid ${filter === c ? C.black : C.grey}`, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>
      <div style={S.countRow}>
        {list.length} szkoleń · <strong style={{ color: C.green }}>{doneInList}</strong> {T.completed_word}
      </div>
      <div style={S.list}>
        {list.map(t => (
          <CatalogItem
            key={t.id}
            t={t}
            done={doneIds.has(t.id)}
            open={expanded === t.id}
            isActive={activeGroups.includes(t.group)}
            grp={GROUPS.find(g => g.id === t.group)}
            completedEntry={completedMap.get(t.id)}
            onToggle={handleToggle}
            T={T}
          />
        ))}
      </div>
    </div>
  );
}

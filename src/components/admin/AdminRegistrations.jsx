/**
 * AdminRegistrations — zakładka panelu admina
 * Pokazuje zgłoszenia z formularza /rejestracja
 *
 * Układ karty:
 *   ┌─────────────────────────────────────────────┐
 *   │  [FIRMA]  ·  NIP          [kurs]  [termin]  │
 *   │  Osoba kontaktowa: Jan Nowak · email · tel   │
 *   ├─────────────────────────────────────────────┤
 *   │  📝 Notatki (textarea edytowalna)           │
 *   │  Uczestnicy:                                │
 *   │    1. Jan Kowalski (inżynier UR)            │
 *   │    2. ...                                   │
 *   └─────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback } from "react";
import { C } from "../../lib/constants";
import { db } from "../../lib/supabase";

const TABLE = "training_registrations";

function fmt(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("pl-PL", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return dateStr; }
}

function fmtDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("pl-PL", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

/* ─── Single registration card ─────────────────────────────────────────── */
function RegCard({ item, token, onUpdate, onDelete }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal,     setNotesVal]     = useState(item.admin_notes || "");
  const [saving,       setSaving]       = useState(false);
  const [toggling,     setToggling]     = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  const participants = Array.isArray(item.participants) ? item.participants : [];

  async function saveNotes() {
    setSaving(true);
    try {
      await db.update(token, TABLE, `id=eq.${item.id}`, { admin_notes: notesVal.trim() });
      onUpdate(item.id, { admin_notes: notesVal.trim() });
      setEditingNotes(false);
    } catch (e) {
      alert("Błąd zapisu: " + e.message);
    } finally { setSaving(false); }
  }

  async function toggleHandled() {
    if (toggling) return;
    setToggling(true);
    const newVal = !item.is_handled;
    try {
      await db.update(token, TABLE, `id=eq.${item.id}`, {
        is_handled:    newVal,
        handled_at:    newVal ? new Date().toISOString() : null,
      });
      onUpdate(item.id, { is_handled: newVal, handled_at: newVal ? new Date().toISOString() : null });
    } catch (e) {
      alert("Błąd: " + e.message);
    } finally { setToggling(false); }
  }

  async function handleDelete() {
    if (!window.confirm(`Usunąć zgłoszenie od firmy ${item.company_name || "—"}?`)) return;
    setDeleting(true);
    try {
      await db.remove(token, TABLE, `id=eq.${item.id}`);
      onDelete(item.id);
    } catch (e) {
      alert("Błąd usuwania: " + e.message);
    } finally { setDeleting(false); }
  }

  const isHandled = !!item.is_handled;
  const borderColor = isHandled ? C.green : C.grey;

  return (
    <div style={{
      background: C.white,
      borderRadius: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,.07)",
      overflow: "hidden",
      border: `1px solid ${borderColor}`,
      transition: "border-color .2s",
    }}>

      {/* ── Nagłówek karty ──────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${C.grey}`,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: isHandled ? "#FAFFF5" : C.white,
      }}>
        {/* Avatar firmy */}
        <div style={{
          width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
          background: isHandled ? C.greenBg : C.greyBg,
          border: `1.5px solid ${isHandled ? C.green : C.grey}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: isHandled ? C.greenDk : C.greyDk,
        }}>
          {(item.company_name || "?").slice(0, 2).toUpperCase()}
        </div>

        {/* Dane główne */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.black }}>
              {item.company_name || "—"}
            </span>
            {item.nip && (
              <span style={{ fontSize: 11, color: C.greyMid }}>NIP: {item.nip}</span>
            )}
          </div>
          {/* Osoba kontaktowa */}
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 2 }}>
            👤 <strong>{item.contact_name || "—"}</strong>
            {item.contact_position && <span style={{ color: C.greyMid }}> · {item.contact_position}</span>}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {item.contact_email && (
              <a href={`mailto:${item.contact_email}`} style={{ fontSize: 11, color: C.blue || "#2980B9", textDecoration: "none" }}>
                ✉ {item.contact_email}
              </a>
            )}
            {item.contact_phone && (
              <span style={{ fontSize: 11, color: C.greyMid }}>📞 {item.contact_phone}</span>
            )}
          </div>
        </div>

        {/* Prawy blok: kurs + termin */}
        <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {item.course && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.green,
              background: "#F0F7E0", padding: "3px 8px", borderRadius: 5,
              border: `1px solid rgba(138,183,62,.3)`,
            }}>
              {item.course}
            </span>
          )}
          {item.term && (
            <span style={{ fontSize: 11, color: C.greyMid }}>📅 {fmt(item.term)}</span>
          )}
          {item.address && (
            <span style={{ fontSize: 11, color: C.greyMid }}>📍 {item.address}</span>
          )}
          <span style={{ fontSize: 10, color: C.greyMid, marginTop: 2 }}>
            zgłoszono: {fmtDateTime(item.created_at)}
          </span>
        </div>
      </div>

      {/* ── Uczestnicy ──────────────────────────────────────────────────── */}
      {participants.length > 0 && (
        <div style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${C.grey}`,
          background: "#FDFDFD",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            textTransform: "uppercase", color: C.greyMid, marginBottom: 6,
          }}>
            👥 Uczestnicy ({participants.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {participants.map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: C.black }}>
                <span style={{ color: C.greyMid, marginRight: 6 }}>{i + 1}.</span>
                <strong>{p.name}</strong>
                {p.position && <span style={{ color: C.greyMid }}> · {p.position}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Notatki (kliknij nagłówek żeby edytować) ───────────────────── */}
      <div>
        <div
          onClick={() => {
            setNotesVal(item.admin_notes || "");
            setEditingNotes(v => !v);
          }}
          style={{
            padding: "8px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", background: editingNotes ? "#F8FFF0" : "#FAFAFA",
            borderBottom: editingNotes ? `1px solid ${C.grey}` : "none",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.greyDk }}>📝 Notatki admina</span>
            {item.admin_notes && !editingNotes && (
              <span style={{ fontSize: 11, color: C.greyMid, fontStyle: "italic" }}>
                {item.admin_notes.slice(0, 60)}{item.admin_notes.length > 60 ? "…" : ""}
              </span>
            )}
            {!item.admin_notes && !editingNotes && (
              <span style={{ fontSize: 11, color: C.greyMid }}>Kliknij, aby dodać notatki…</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: C.greyMid }}>{editingNotes ? "▲" : "✏️"}</span>
        </div>

        {editingNotes && (
          <div style={{ padding: "12px 16px", background: "#F8FFF0", display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={notesVal}
              onChange={e => setNotesVal(e.target.value)}
              rows={5}
              placeholder="Notatki wewnętrzne (widoczne tylko dla admina)…"
              style={{
                width: "100%", padding: "10px 12px",
                border: `1.5px solid ${C.grey}`, borderRadius: 6,
                fontSize: 12, color: C.black, background: C.white,
                boxSizing: "border-box", resize: "vertical",
                fontFamily: "inherit", lineHeight: 1.55, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditingNotes(false)}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, border: `1px solid ${C.grey}`, borderRadius: 6, background: C.white, color: C.greyDk, cursor: "pointer" }}
              >
                Anuluj
              </button>
              <button
                onClick={saveNotes}
                disabled={saving}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 6, background: C.green, color: C.white, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Zapisuję…" : "Zapisz"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Akcje dolne ─────────────────────────────────────────────────── */}
      <div style={{
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        borderTop: `1px solid ${C.grey}`,
        background: C.white,
      }}>
        {item.contact_email && (
          <a
            href={`mailto:${item.contact_email}?subject=Zgłoszenie szkolenia ${item.course || ""}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 12px", fontSize: 11, fontWeight: 700,
              border: `1.5px solid #2980B9`, borderRadius: 6,
              background: "none", color: "#2980B9", textDecoration: "none",
            }}
          >
            ✉ Email
          </a>
        )}
        <button
          onClick={toggleHandled}
          disabled={toggling}
          style={{
            padding: "7px 14px", fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${isHandled ? C.green : C.grey}`,
            borderRadius: 6,
            background: isHandled ? C.green : C.white,
            color: isHandled ? C.white : C.greyMid,
            cursor: toggling ? "not-allowed" : "pointer",
            opacity: toggling ? 0.5 : 1, transition: "all .15s",
          }}
        >
          {toggling ? "…" : isHandled ? "✓ Obsłużone" : "Oznacz jako obsłużone"}
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "5px 10px", fontSize: 10, fontWeight: 700,
            border: `1px solid ${C.red}`, borderRadius: 5,
            background: "none", color: C.red,
            cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? "…" : "🗑 Usuń"}
        </button>
      </div>
    </div>
  );
}

/* ─── Main panel ────────────────────────────────────────────────────────── */
export function AdminRegistrations({ token, refreshKey }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [filter,        setFilter]        = useState("all"); // "all" | "pending" | "handled"
  const [search,        setSearch]        = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await db.get(
        token, TABLE,
        "select=*&order=created_at.desc"
      );
      setRegistrations(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Błąd ładowania: " + e.message);
      setRegistrations([]);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load, refreshKey]);

  function handleUpdate(id, patch) {
    setRegistrations(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function handleDelete(id) {
    setRegistrations(prev => prev.filter(r => r.id !== id));
  }

  // Filtrowanie + wyszukiwanie
  const filtered = registrations.filter(r => {
    if (filter === "pending" && r.is_handled)  return false;
    if (filter === "handled" && !r.is_handled) return false;
    if (search) {
      const q = search.toLowerCase();
      return [r.company_name, r.contact_name, r.contact_email, r.course, r.nip]
        .some(v => (v || "").toLowerCase().includes(q));
    }
    return true;
  });

  const totalCount   = registrations.length;
  const pendingCount = registrations.filter(r => !r.is_handled).length;
  const handledCount = registrations.filter(r => r.is_handled).length;

  return (
    <div style={{
      flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
      background: C.greyBg, display: "flex", flexDirection: "column",
    }}>
      {/* ── Nagłówek ─────────────────────────────────────────────────── */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.grey}`,
        padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.greyMid, textTransform: "uppercase", marginBottom: 3 }}>
            Rejestracje ze strony
          </div>
          <div style={{ fontSize: 12, color: C.greyDk }}>
            {totalCount === 0 ? "Brak zgłoszeń" : `${totalCount} łącznie`}
            {pendingCount > 0 && (
              <span style={{ marginLeft: 8, color: C.amber || "#E67E22", fontWeight: 700 }}>
                · {pendingCount} oczekujących
              </span>
            )}
            {handledCount > 0 && (
              <span style={{ marginLeft: 8, color: C.greenDk, fontWeight: 700 }}>
                · {handledCount} obsłużonych
              </span>
            )}
          </div>
        </div>

        {/* Wyszukiwarka */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj firmy, osoby, kursu…"
          style={{
            padding: "8px 12px", border: `1px solid ${C.grey}`, borderRadius: 8,
            fontSize: 12, color: C.black, outline: "none",
            width: 200, fontFamily: "inherit",
          }}
        />

        {/* Filtry */}
        <div style={{ display: "flex", gap: 4 }}>
          {[["all", "Wszystkie"], ["pending", "Oczekujące"], ["handled", "Obsłużone"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{
                padding: "7px 12px", fontSize: 11, fontWeight: 700,
                border: `1px solid ${filter === val ? C.green : C.grey}`,
                borderRadius: 6,
                background: filter === val ? C.green : C.white,
                color: filter === val ? C.white : C.greyDk,
                cursor: "pointer", transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stany ────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: C.greyMid, fontSize: 13 }}>Ładowanie…</div>
      )}
      {!loading && error && (
        <div style={{ margin: 16, padding: "12px 16px", background: "#FDEDEC", border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: C.greyMid, fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          {registrations.length === 0
            ? "Brak zgłoszeń z formularza rejestracyjnego."
            : "Brak wyników dla wybranych filtrów."
          }
        </div>
      )}

      {/* ── Lista kart ───────────────────────────────────────────────── */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ padding: "12px 14px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map(item => (
            <RegCard
              key={item.id}
              item={item}
              token={token}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

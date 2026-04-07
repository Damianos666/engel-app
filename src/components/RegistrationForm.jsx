/**
 * RegistrationForm — publiczny formularz zgłoszeniowy
 * Dostępny bez logowania pod ścieżką /rejestracja
 * Po wypełnieniu → zapis do tabeli training_registrations w Supabase
 */

import { useState, useRef } from "react";
import { SB_URL } from "../lib/supabase";

const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const C = {
  green:   "#8AB73E",
  greyDk:  "#686868",
  greyMid: "#A0A0A0",
  grey:    "#E8E8E8",
  greyBg:  "#EFEFEF",
  white:   "#FFFFFF",
  black:   "#1A1A1A",
  red:     "#C0392B",
};

/* ─── Supabase public insert (bez tokena — używa anon key) ─────────────── */
async function insertRegistration(payload) {
  const r = await fetch(`${SB_URL}/rest/v1/training_registrations`, {
    method:  "POST",
    headers: {
      "apikey":        SB_ANON,
      "Authorization": `Bearer ${SB_ANON}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt);
  }
}

/* ─── Tiny helpers ──────────────────────────────────────────────────────── */
function Field({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, color: C.greyDk, fontWeight: 600 }}>
        {label}{required && <span style={{ color: C.green, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: `1px solid #C8C8C8`,
  borderRadius: 8,
  fontSize: 13,
  color: C.black,
  background: C.white,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const inputFocusStyle = {
  borderColor: C.green,
  boxShadow: "0 0 0 3px rgba(138,183,62,.20)",
};

function Input({ onFocus, onBlur, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(focused ? inputFocusStyle : {}), ...style }}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => { setFocused(false); onBlur?.(); }}
    />
  );
}

/* ─── Participant row ───────────────────────────────────────────────────── */
function ParticipantRow({ idx, data, onChange, onRemove, canRemove }) {
  return (
    <div style={{
      border: `1px solid ${C.grey}`,
      borderRadius: 10,
      padding: "12px 14px",
      background: "#FAFAFA",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: C.greyDk,
          border: `1px solid ${C.grey}`, borderRadius: 999,
          padding: "3px 10px", background: C.white,
        }}>
          Uczestnik #{idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              border: `1px solid rgba(192,57,43,.35)`, borderRadius: 6,
              background: C.white, color: "#7a1a12",
              padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            Usuń
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Imię i nazwisko" required>
          <Input
            value={data.name}
            onChange={e => onChange("name", e.target.value)}
            placeholder="Jan Kowalski"
          />
        </Field>
        <Field label="Stanowisko">
          <Input
            value={data.position}
            onChange={e => onChange("position", e.target.value)}
            placeholder="Inżynier utrzymania ruchu"
          />
        </Field>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export function RegistrationForm() {
  const [course,         setCourse]         = useState("");
  const [address,        setAddress]        = useState("");
  const [term,           setTerm]           = useState("");
  const [company,        setCompany]        = useState("");
  const [nip,            setNip]            = useState("");
  const [contactName,    setContactName]    = useState("");
  const [contactPos,     setContactPos]     = useState("");
  const [contactPhone,   setContactPhone]   = useState("");
  const [contactEmail,   setContactEmail]   = useState("");
  const [participants,   setParticipants]   = useState([{ name: "", position: "" }]);
  const [terms,          setTerms]          = useState(false);
  const [rodo,           setRodo]           = useState(false);
  const [status,         setStatus]         = useState(null); // null | "ok" | "err"
  const [errMsg,         setErrMsg]         = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const formRef = useRef(null);

  function addParticipant() {
    setParticipants(p => [...p, { name: "", position: "" }]);
  }

  function removeParticipant(idx) {
    setParticipants(p => p.filter((_, i) => i !== idx));
  }

  function updateParticipant(idx, field, val) {
    setParticipants(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Walidacja uczestników
    for (let i = 0; i < participants.length; i++) {
      if (!participants[i].name.trim()) {
        setStatus("err");
        setErrMsg(`Uczestnik #${i + 1}: brak imienia i nazwiska.`);
        return;
      }
    }

    if (!terms || !rodo) {
      setStatus("err");
      setErrMsg("Zaznacz obowiązkowe zgody, aby kontynuować.");
      return;
    }

    setSubmitting(true);
    setStatus(null);

    // Uczestnicy jako tekst do notatek — jeden wiersz per uczestnik
    const participantsNote = participants
      .map((p, i) => {
        const pos = p.position ? ` (${p.position})` : "";
        return `${i + 1}. ${p.name.trim()}${pos}`;
      })
      .join("\n");

    const payload = {
      course:         course.trim(),
      address:        address.trim(),
      term:           term || null,
      company_name:   company.trim(),
      nip:            nip.trim(),
      contact_name:   contactName.trim(),
      contact_position: contactPos.trim(),
      contact_phone:  contactPhone.trim(),
      contact_email:  contactEmail.trim(),
      participants:   participants.map(p => ({
        name:     p.name.trim(),
        position: p.position.trim(),
      })),
      participants_note: participantsNote,
      consent_terms: terms,
      consent_rodo:  rodo,
    };

    try {
      await insertRegistration(payload);
      setStatus("ok");
      // Reset formularza
      setCourse(""); setAddress(""); setTerm("");
      setCompany(""); setNip("");
      setContactName(""); setContactPos(""); setContactPhone(""); setContactEmail("");
      setParticipants([{ name: "", position: "" }]);
      setTerms(false); setRodo(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStatus("err");
      setErrMsg("Błąd zapisu. Spróbuj ponownie lub skontaktuj się z nami bezpośrednio.\n" + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: C.greyBg,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, 'Noto Sans', sans-serif",
      padding: "28px 16px 60px",
      boxSizing: "border-box",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ── Sukces globalny ───────────────────────────────────────────── */}
        {status === "ok" && (
          <div style={{
            marginBottom: 20,
            padding: "16px 20px",
            borderRadius: 10,
            background: "rgba(6,118,71,.06)",
            border: "1px solid rgba(6,118,71,.35)",
            fontSize: 14,
            color: "#067647",
            fontWeight: 600,
            lineHeight: 1.5,
          }}>
            ✅ Zgłoszenie zostało przyjęte! Skontaktujemy się z Tobą wkrótce.
          </div>
        )}

        {/* ── Karta formularza ─────────────────────────────────────────── */}
        <div style={{
          background: C.white,
          border: `1px solid ${C.grey}`,
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(16,24,40,.08)",
          overflow: "hidden",
        }}>

          {/* Nagłówek */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 20px",
            borderBottom: `4px solid ${C.green}`,
            background: C.white,
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                background: C.greyDk,
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img
                  src="/logo.png"
                  alt="ENGEL"
                  style={{ height: 26, width: "auto", display: "block", mixBlendMode: "screen" }}
                />
              </div>
              <div>
                <div style={{
                  fontSize: 16, fontWeight: 700, letterSpacing: .3,
                  textTransform: "uppercase", color: C.greyDk,
                }}>
                  Formularz zgłoszeniowy — szkolenie
                </div>
                <div style={{ fontSize: 12, color: C.greyMid, marginTop: 3 }}>
                  Wypełnij dane firmy, osoby kontaktowej oraz dodaj uczestników.
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.greyMid }}>
              <span style={{ color: C.green, fontWeight: 900 }}>*</span> pola obowiązkowe
            </div>
          </div>

          {/* Form */}
          <form ref={formRef} onSubmit={handleSubmit} noValidate style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Dane szkolenia ─────────────────────────────────────────── */}
            <Section title="Dane szkolenia" hint="Nazwa kursu, adres, termin">
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                <Field label="Nazwa kursu" required>
                  <Input value={course} onChange={e => setCourse(e.target.value)} placeholder="np. ENGEL e-mac" required />
                </Field>
                <Field label="Adres / lokalizacja">
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="np. Schwertberg, Austria" />
                </Field>
                <Field label="Termin">
                  <Input type="date" value={term} onChange={e => setTerm(e.target.value)} />
                </Field>
              </div>
            </Section>

            {/* ── Dane firmy ────────────────────────────────────────────── */}
            <Section title="Dane firmy (do faktury)" hint="Nazwa firmy, NIP">
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Nazwa firmy" required>
                  <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Sp. z o.o." required />
                </Field>
                <Field label="NIP" required>
                  <Input value={nip} onChange={e => setNip(e.target.value)} placeholder="000-000-00-00" required />
                </Field>
              </div>
            </Section>

            {/* ── Osoba kontaktowa ─────────────────────────────────────── */}
            <Section title="Osoba kontaktowa" hint="Telefon + e-mail do potwierdzeń">
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                <Field label="Imię i nazwisko" required>
                  <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Anna Nowak" required />
                </Field>
                <Field label="Stanowisko">
                  <Input value={contactPos} onChange={e => setContactPos(e.target.value)} placeholder="Kierownik szkoleń" />
                </Field>
                <Field label="Telefon">
                  <Input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+48 600 000 000" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="anna@firma.pl" required />
                </Field>
              </div>
            </Section>

            {/* ── Uczestnicy ───────────────────────────────────────────── */}
            <Section title="Uczestnicy" hint="Min. 1 uczestnik">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {participants.map((p, i) => (
                  <ParticipantRow
                    key={i}
                    idx={i}
                    data={p}
                    onChange={(f, v) => updateParticipant(i, f, v)}
                    onRemove={() => removeParticipant(i)}
                    canRemove={participants.length > 1}
                  />
                ))}
                <button
                  type="button"
                  onClick={addParticipant}
                  style={{
                    alignSelf: "flex-start",
                    border: `1px solid #C8C8C8`,
                    borderRadius: 8,
                    background: C.white,
                    color: C.greyDk,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  + Dodaj uczestnika
                </button>
                <div style={{ fontSize: 11, color: C.greyMid }}>
                  Uczestnicy: imię i nazwisko + stanowisko.
                </div>
              </div>
            </Section>

            {/* ── Zgody ────────────────────────────────────────────────── */}
            <Section title="Zgody" hint="Akceptacja OWU i RODO">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                <ConsentRow
                  checked={terms}
                  onChange={setTerms}
                  id="terms"
                  label={<>Tak, akceptuję Ogólne Warunki Świadczenia Usług Szkoleniowych <span style={{ color: C.green, fontWeight: 900 }}>*</span></>}
                  hint={<a href="/regulamin" target="_blank" rel="noopener" style={{ color: C.greyDk, textDecoration: "underline" }}>Otwórz regulamin</a>}
                />

                <ConsentRow
                  checked={rodo}
                  onChange={setRodo}
                  id="rodo"
                  label={<>Wyrażam zgodę na przetwarzanie podanych danych osobowych <span style={{ color: C.green, fontWeight: 900 }}>*</span></>}
                  hint={<>Informacje o ochronie danych: <a href="https://www.engelglobal.com/dataprotection" target="_blank" rel="noopener" style={{ color: C.greyDk, textDecoration: "underline" }}>engelglobal.com/dataprotection</a></>}
                />

                {/* Błąd / sukces inline */}
                {status === "err" && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(180,35,24,.06)",
                    border: "1px solid rgba(180,35,24,.35)",
                    fontSize: 13,
                    color: C.red,
                    whiteSpace: "pre-line",
                  }}>
                    {errMsg || "Uzupełnij wymagane pola i zaznacz obowiązkowe zgody."}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: submitting ? "#aac672" : C.green,
                      border: "none",
                      borderRadius: 8,
                      color: "#0b0c0d",
                      padding: "11px 22px",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer",
                      transition: "background .2s",
                    }}
                  >
                    {submitting ? "Wysyłanie…" : "Wyślij zgłoszenie"}
                  </button>
                </div>
              </div>
            </Section>

          </form>
        </div>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: C.greyMid }}>
          ENGEL Expert Academy · Formularz zgłoszeniowy
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */
function Section({ title, hint, children }) {
  return (
    <div style={{
      border: `1px solid ${C.grey}`,
      borderRadius: 10,
      padding: "14px 16px",
      background: C.white,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 12, paddingBottom: 10, marginBottom: 12,
        borderBottom: `1px solid ${C.grey}`,
      }}>
        <h2 style={{
          margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: .3,
          textTransform: "uppercase", color: C.greyDk,
        }}>
          {title}
        </h2>
        <span style={{ fontSize: 11, color: C.greyMid }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function ConsentRow({ checked, onChange, id, label, hint }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: C.green }}
      />
      <div>
        <label htmlFor={id} style={{ fontSize: 13, color: C.black, lineHeight: 1.4, display: "block" }}>
          {label}
        </label>
        {hint && <div style={{ fontSize: 11, color: C.greyMid, marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY PAGE — publiczna strona weryfikacji certyfikatu
// URL: /verify/:certId   np. /verify/17A0921K9X7M2
//
// Dostęp: bez logowania (anon key Supabase)
// Dane: tabela `completions` z kolumną cert_id (dodaj przez SQL w Supabase)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

const SB_URL  = import.meta.env.VITE_SUPABASE_URL;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const C = {
  black:   "#1A1A1A",
  white:   "#FFFFFF",
  green:   "#8AB73E",
  greenDk: "#5A8020",
  grey:    "#E5E5E5",
  greyBg:  "#F5F5F5",
  greyMid: "#999999",
  greyDk:  "#686868",
  red:     "#C0392B",
};

// Pobiera dane certyfikatu z Supabase (anon — bez tokenu)
async function fetchCert(certId) {
  const query = new URLSearchParams({
    cert_id: `eq.${certId}`,
    select:  "cert_id,date,training_data,trainer,created_at,user_display_name",
  });
  const r = await fetch(`${SB_URL}/rest/v1/completions?${query}`, {
    headers: {
      "apikey":        SB_ANON,
      "Authorization": `Bearer ${SB_ANON}`,
    },
  });
  if (!r.ok) throw new Error("Błąd połączenia z bazą danych.");
  const rows = await r.json();
  if (!rows.length) return null;
  return rows[0];
}

// Ikona checkmark (SVG)
function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={C.green} opacity="0.12"/>
      <circle cx="24" cy="24" r="18" fill={C.green} opacity="0.2"/>
      <path d="M14 24l8 8 12-14" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Ikona X (błąd)
function CrossIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={C.red} opacity="0.1"/>
      <circle cx="24" cy="24" r="18" fill={C.red} opacity="0.15"/>
      <path d="M16 16l16 16M32 16L16 32" stroke={C.red} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// Ikona LinkedIn
function LinkedInIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: C.greyMid, marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.black }}>
        {value}
      </div>
    </div>
  );
}

export function VerifyPage() {
  // Wyciągnij certId z URL: /verify/17A0921K9X7M2
  const certId = window.location.pathname.split("/verify/")[1]?.trim();

  const [status, setStatus] = useState("loading"); // "loading" | "valid" | "invalid" | "error"
  const [cert,   setCert]   = useState(null);

  useEffect(() => {
    if (!certId) { setStatus("invalid"); return; }
    fetchCert(certId)
      .then(data => {
        if (!data) { setStatus("invalid"); return; }
        setCert(data);
        setStatus("valid");
      })
      .catch(() => setStatus("error"));
  }, [certId]);

  const containerStyle = {
    minHeight:      "100vh",
    background:     C.greyBg,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    padding:        "32px 16px",
    fontFamily:     "'Helvetica Neue', Helvetica, Arial, sans-serif",
  };

  // ── ŁADOWANIE ──────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div style={containerStyle}>
        <span style={{ width: 32, height: 32, border: `3px solid ${C.grey}`, borderTopColor: C.green, borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" }}/>
        <div style={{ marginTop: 16, color: C.greyMid, fontSize: 14 }}>Weryfikacja certyfikatu…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── BŁĄD POŁĄCZENIA ────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div style={containerStyle}>
        <div style={{ background: C.white, maxWidth: 420, width: "100%", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
          <CrossIcon/>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.black, marginTop: 20 }}>Błąd połączenia</div>
          <div style={{ fontSize: 13, color: C.greyMid, marginTop: 8 }}>
            Nie udało się połączyć z bazą danych. Spróbuj ponownie za chwilę.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, background: C.black, border: "none", color: C.white, padding: "12px 28px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8 }}>
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  // ── NIEWAŻNY / NIE ZNALEZIONO ──────────────────────────────────────────────
  if (status === "invalid") {
    return (
      <div style={containerStyle}>
        <div style={{ background: C.white, maxWidth: 420, width: "100%", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
          <CrossIcon/>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.black, marginTop: 20 }}>Certyfikat nie istnieje</div>
          <div style={{ fontSize: 13, color: C.greyMid, marginTop: 8, lineHeight: 1.6 }}>
            Numer certyfikatu <strong style={{ fontFamily: "monospace" }}>{certId || "—"}</strong> nie został znaleziony w bazie ENGEL Expert Academy.
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: C.greyMid }}>
            Jeśli uważasz że to błąd, skontaktuj się z organizatorem szkolenia.
          </div>
          <a href="/" style={{ display: "inline-block", marginTop: 24, background: C.black, color: C.white, padding: "12px 28px", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8 }}>
            Wróć do strony głównej
          </a>
        </div>
      </div>
    );
  }

  // ── WAŻNY CERTYFIKAT ───────────────────────────────────────────────────────
  const training = cert.training_data || {};

  // Formatowanie daty z "DD.MM.YYYY" → "DD.MM.YYYY" (już jest OK)
  // lub z ISO (jeśli kiedyś zmienisz format w bazie)
  const dateDisplay = cert.date || "—";

  return (
    <div style={containerStyle}>

      {/* Karta certyfikatu */}
      <div style={{ background: C.white, maxWidth: 460, width: "100%", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>

        {/* Header */}
        <div style={{ background: "#1A1A1A", padding: "20px 28px", display: "flex", alignItems: "center", gap: 16 }}>
          <img src="/logo.png" alt="ENGEL" style={{ height: 24, mixBlendMode: "screen" }}/>
          <div>
            <div style={{ color: "#aaa", fontSize: 10, letterSpacing: 2 }}>EXPERT ACADEMY</div>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, marginTop: 2 }}>Weryfikacja certyfikatu</div>
          </div>
        </div>

        {/* Zielony pasek */}
        <div style={{ height: 4, background: C.green }}/>

        {/* Status badge */}
        <div style={{ padding: "28px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
            <CheckIcon/>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Certyfikat ważny</div>
              <div style={{ fontSize: 12, color: C.greyMid, marginTop: 2 }}>Dokument zweryfikowany w bazie ENGEL Expert Academy</div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: C.grey, marginBottom: 24 }}/>

          {/* Dane */}
          {cert.user_display_name && (
            <Field label="Uczestnik" value={cert.user_display_name}/>
          )}
          <Field label="Szkolenie" value={training.title || "—"}/>
          {training.category && (
            <Field label="Kategoria" value={`${training.category}${training.duration ? ` · ${training.duration}` : ""}`}/>
          )}
          <Field label="Data ukończenia" value={dateDisplay}/>
          {cert.trainer && (
            <Field label="Trener" value={cert.trainer}/>
          )}

          {/* Nr certyfikatu */}
          <div style={{ marginTop: 8, background: C.greyBg, padding: "14px 18px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: C.greyMid, textTransform: "uppercase", marginBottom: 4 }}>Nr certyfikatu</div>
              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: C.black, letterSpacing: 1 }}>{cert.cert_id}</div>
            </div>
            <div style={{ background: C.green, color: C.white, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 20, letterSpacing: 1 }}>
              WAŻNY
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 28px 28px", marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.greyMid, lineHeight: 1.6, borderTop: `1px solid ${C.grey}`, paddingTop: 16 }}>
            Certyfikat wydany przez <strong>ENGEL Expert Academy</strong>. Weryfikacja przeprowadzona automatycznie na podstawie zaszyfrowanego numeru certyfikatu. Data weryfikacji: <strong>{new Date().toLocaleDateString("pl-PL")}</strong>.
          </div>
        </div>
      </div>

      {/* LinkedIn CTA */}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.greyMid, marginBottom: 10 }}>
          Jesteś właścicielem tego certyfikatu?
        </div>
        <a
          href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(training.title || "")}&organizationId=76790490&issueYear=${(cert.date || "").split(".")[2] || ""}&issueMonth=${String(parseInt((cert.date || "").split(".")[1] || "1", 10))}&certId=${cert.cert_id}&certUrl=${encodeURIComponent(window.location.href)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0A66C2", color: "#fff", padding: "11px 22px", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8 }}>
          <LinkedInIcon size={16}/>
          Dodaj do profilu LinkedIn
        </a>
      </div>

      {/* Link powrotu */}
      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ fontSize: 12, color: C.greyMid, textDecoration: "none" }}>
          ← ENGEL Expert Academy
        </a>
      </div>

    </div>
  );
}

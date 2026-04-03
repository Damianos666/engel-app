// ─────────────────────────────────────────────────────────────────────────────
// CERT ID — generowanie numeru certyfikatu
//
// Format:  CCYDDDTSSSSS  (12 znaków, bez spacji/separatorów)
//
//   CC    — 2-cyfrowy numer szkolenia (01–25, zero-padded)
//   Y     — rok jako litera z ALPHABET  (A = 2026, B = 2027, …)
//   DDD   — dzień roku (001–366), zero-padded
//   T     — numer trenera (1–5)
//   SSSSS — 5-znakowy podpis HMAC-SHA256 ze znaków ALPHABET
//
// HMAC jest liczony z pełnych danych (m.in. uid) — uid NIE jest widoczny
// w kodzie, ale sprawia że każdy uczestnik ma unikalny podpis.
// ─────────────────────────────────────────────────────────────────────────────

import { TRAININGS } from "../data/trainings";

// Alfabet certyfikatu — 31 znaków (bez 0/O/1/I/L)
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// Sekret do HMAC — może być zastąpiony przez zmienną środowiskową
const CERT_SECRET =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_CERT_SECRET
    ? import.meta.env.VITE_CERT_SECRET
    : "engel-cert-secret-v1";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Rok → 1 litera (A = 2026) */
// 'A' jest na indeksie 8 w ALPHABET ("23456789ABC…")
// Offset 8 sprawia że: 2026→A, 2027→B, 2028→C, …
const YEAR_OFFSET = 8;
function yearCode(year) {
  return ALPHABET[(year - 2026 + YEAR_OFFSET) % ALPHABET.length];
}

/** Data → numer dnia w roku, zero-padded do 3 cyfr */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff  = date.getTime() - start.getTime();
  const day   = Math.floor(diff / (1000 * 60 * 60 * 24));
  return String(day).padStart(3, "0");
}

/** training.id → 2-cyfrowy numer szkolenia (indeks w TRAININGS + 1) */
function courseCode(trainingId) {
  const idx = TRAININGS.findIndex(t => t.id === trainingId);
  const num = idx >= 0 ? idx + 1 : 0;
  return String(num).padStart(2, "0");
}

/** Parsuje datę z formatu DD.MM.YYYY */
function parseDatePL(str) {
  const [dd, mm, yyyy] = str.split(".");
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

/** HMAC-SHA256 → 5 znaków z ALPHABET */
async function hmac5(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig   = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes.slice(0, 5))
    .map(b => ALPHABET[b % ALPHABET.length])
    .join("");
}

// ─── GŁÓWNA FUNKCJA ───────────────────────────────────────────────────────────

/**
 * Generuje 12-znakowy numer certyfikatu.
 *
 * @param {object} params
 * @param {string} params.trainingId   — entry.training.id
 * @param {string} params.date         — entry.date (DD.MM.YYYY)
 * @param {string|number} params.trainer — numer trenera (1–5)
 * @param {string} params.uid          — user.id z Supabase
 * @returns {Promise<string>}  np. "17A0921K9X7M2"  → 12 znaków
 */
export async function generateCertId({ trainingId, date, trainer, uid }) {
  const dateObj  = parseDatePL(date);
  const cc       = courseCode(trainingId);          // 2 cyfry
  const y        = yearCode(dateObj.getFullYear()); // 1 litera
  const ddd      = dayOfYear(dateObj);              // 3 cyfry
  const t        = String(trainer || 1);            // 1 cyfra

  // Podpis liczy się z PEŁNYCH danych (uid ukryty w środku)
  const payload  = `${cc}|${date}|${uid}|${t}`;
  const sig      = await hmac5(CERT_SECRET, payload); // 5 znaków

  return `${cc}${y}${ddd}${t}${sig}`;
}

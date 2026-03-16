/* ─── ENGEL Virtual Expert Academy — System Grywalizacji ─────────────────── */

export const PROG_LEVELS = [
  { level: 1,  pts: 0,    label: "Nowicjusz",         badge: "🌱" },
  { level: 2,  pts: 150,  label: "Uczeń",             badge: "📖" },
  { level: 3,  pts: 350,  label: "Praktykant",        badge: "🔧" },
  { level: 4,  pts: 650,  label: "Operator",          badge: "⚙️" },
  { level: 5,  pts: 1050, label: "Specjalista",       badge: "🎯" },
  { level: 6,  pts: 1600, label: "Technik",           badge: "🔬" },
  { level: 7,  pts: 2300, label: "Ekspert",           badge: "💡" },
  { level: 8,  pts: 3200, label: "Mistrz",            badge: "🏅" },
  { level: 9,  pts: 4300, label: "Wirtualny Ekspert", badge: "⭐" },
  { level: 10, pts: 5600, label: "Lider",             badge: "🚀" },
  { level: 11, pts: 6500, label: "Mentor",            badge: "🎓" },
  { level: 12, pts: 7200, label: "Trener",            badge: "🏆" },
];

export const TIP_POINTS   = 10;
export const QUIZ_DURATION = 180; // 3 minuty w sekundach

/** Punkty za quiz tygodniowy: 10 pkt za każdą poprawną odpowiedź (max 60) */
export function calcQuizPoints(correctCount, totalCount) {
  if (!totalCount) return { pct: 0, points: 0 };
  const pct    = Math.round((correctCount / totalCount) * 100);
  const points = correctCount * 10;
  return { pct, points };
}

/** Zwraca info o aktualnym i następnym poziomie + procent postępu */
export function getLevelInfo(points) {
  let current = PROG_LEVELS[0];
  let nextLvl  = PROG_LEVELS[1] || null;
  for (let i = PROG_LEVELS.length - 1; i >= 0; i--) {
    if (points >= PROG_LEVELS[i].pts) {
      current = PROG_LEVELS[i];
      nextLvl  = PROG_LEVELS[i + 1] || null;
      break;
    }
  }
  const ptsInLevel = points - current.pts;
  const ptsNeeded  = nextLvl ? nextLvl.pts - current.pts : 1;
  const pct        = nextLvl ? Math.min(100, Math.round((ptsInLevel / ptsNeeded) * 100)) : 100;
  return { current, next: nextLvl, ptsInLevel, ptsNeeded, pct };
}

/** Wszystkie odznaki (poziomy) które użytkownik już osiągnął */
export function getEarnedBadges(points) {
  return PROG_LEVELS.filter(l => points >= l.pts);
}

/** Numer tygodnia ISO + rok */
export function getWeekKey() {
  const now = new Date();
  const d   = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week      = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** Daty poniedziałku i niedzieli bieżącego tygodnia jako ISO strings */
export function getWeekDateRange() {
  const now       = new Date();
  const dayOfWeek = now.getDay() || 7; // 1=Pon, 7=Nd
  const monday    = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const toISO = d => d.toISOString().slice(0, 10);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(toISO(d));
  }
  return dates; // [pn, wt, śr, cz, pt, sb, nd]
}

/**
 * Deterministyczny wybór pytania na dany dzień.
 * Ten sam dzień → to samo pytanie dla wszystkich użytkowników.
 * Nie wymaga żadnego backendu ani cron job-a.
 */
export function getDailyTipQuestion(questions, dateStr) {
  if (!questions || !questions.length) return null;
  // Seed = suma kodów ASCII znaków daty (np. "2026-03-16" → stabilna liczba)
  const seed = dateStr.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return questions[seed % questions.length];
}

/**
 * Zwraca tablicę 6 pytań (tipów) dla bieżącego tygodnia.
 * Dni 1–6 tygodnia → 6 tipów. Dzień 7 to quiz z tych pytań.
 */
export function getWeekQuestions(questions) {
  if (!questions || !questions.length) return [];
  const dates   = getWeekDateRange().slice(0, 6); // tylko pierwsze 6 dni
  const result  = [];
  const usedIds = new Set();

  for (const date of dates) {
    const seed  = date.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    let   idx   = seed % questions.length;
    let   tries = 0;
    while (usedIds.has(questions[idx]?.id) && tries < questions.length) {
      idx = (idx + 1) % questions.length;
      tries++;
    }
    const q = questions[idx];
    if (q && !usedIds.has(q.id)) {
      result.push(q);
      usedIds.add(q.id);
    }
  }
  return result;
}

/** Czy dziś jest 7. dzień tygodnia w programie (niedziela ISO = dzień quizu) */
export function isQuizDay(programStartDate) {
  if (!programStartDate) return false;
  const start = new Date(programStartDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysPassed = Math.floor((today - start) / 86400000);
  // 7. dzień = indeks 6 (0-based), potem co 7 dni: 6, 13, 20...
  return daysPassed >= 6 && (daysPassed + 1) % 7 === 0;
}
export function calcNewStreak(currentStreak, lastDate, todayStr) {
  if (!lastDate) return 1;
  const yesterday = new Date(todayStr + "T00:00:00");
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  if (lastDate === yesterdayStr) return (currentStreak || 0) + 1;
  if (lastDate === todayStr)    return currentStreak || 1; // już policzone
  return 1; // seria przerwana
}
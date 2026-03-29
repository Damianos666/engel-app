import { useMemo } from "react";
import { TRAININGS } from "../data/trainings";

/**
 * Zwraca tablicę szkoleń z nadpisanymi wartościami z Supabase.
 * Nie mutuje globalnego modułu TRAININGS — każdy wywołujący dostaje czystą kopię.
 *
 * @param {Object} overrides - mapa { [training_id]: { title, desc, duration, level, ... } }
 */
export function useTrainings(overrides = {}) {
  return useMemo(
    () => TRAININGS.map(t => overrides[t.id] ? { ...t, ...overrides[t.id] } : t),
    [overrides]
  );
}

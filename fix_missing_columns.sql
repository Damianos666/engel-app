-- Naprawa tabeli training_interests — dodanie brakujących kolumn
-- Uruchom w: Supabase → SQL Editor → New query → Run

ALTER TABLE training_interests ADD COLUMN IF NOT EXISTS is_withdrawn  boolean       DEFAULT false;
ALTER TABLE training_interests ADD COLUMN IF NOT EXISTS phone         text;
ALTER TABLE training_interests ADD COLUMN IF NOT EXISTS contacted     boolean       DEFAULT false;
ALTER TABLE training_interests ADD COLUMN IF NOT EXISTS contacted_at  timestamptz;

-- Upewnij się, że unikalny index na (user_id, scheduled_training_id) istnieje
-- (jeśli już istnieje, polecenie zwróci błąd — możesz je pominąć)
ALTER TABLE training_interests ADD CONSTRAINT IF NOT EXISTS training_interests_user_sched_unique
  UNIQUE (user_id, scheduled_training_id);

-- Odśwież schema cache PostgREST (wymagane po dodaniu nowych kolumn!)
NOTIFY pgrst, 'reload schema';

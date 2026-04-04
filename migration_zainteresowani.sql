-- Plik migracji bazy danych dla nowej funkcjonalności "Zgłoszenia na szkolenia" (Zainteresowani).
-- Ten plik powinieneś wkleić i uruchomić w Supabase -> SQL Editor.

-- 1. Dodanie pola phone (telefon) do profilu użytkownika
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- 2. Stworzenie tabeli na zgłoszenia (Zainteresowanych)
CREATE TABLE IF NOT EXISTS training_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_training_id bigint REFERENCES scheduled_trainings(id) ON DELETE CASCADE,
  training_id text NOT NULL,
  name text,
  email text,
  firma text,
  stanowisko text,
  phone text,
  contacted boolean DEFAULT false,
  contacted_at timestamptz,
  is_withdrawn boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, scheduled_training_id)
);

-- 3. Aktywacja RLS (Row Level Security) dla nowej tabeli
ALTER TABLE training_interests ENABLE ROW LEVEL SECURITY;

-- 4. Polityki
CREATE POLICY "user insert own" ON training_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user update own" ON training_interests
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user read own" ON training_interests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admin all" ON training_interests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

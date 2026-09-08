/*
# Create saves table for user-saved regulations

1. Purpose
   Users who sign in can save regulation entry IDs to their account so they
   follow them across devices. The register itself (register.json) is never
   imported into the database — only the entry `id` string is stored. When the
   register updates, the app re-reads the current entry from register.json and
   shows its current status.

2. New Tables
   - `saves`
     - `id` (uuid, primary key)
     - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users ON DELETE CASCADE)
     - `entry_id` (text, not null — the register entry's stable id, e.g. "RS-STANDARD")
     - `created_at` (timestamptz, defaults to now())
   - Unique constraint on (user_id, entry_id) to prevent duplicate saves.

3. Security
   - RLS enabled on `saves`.
   - Four policies (SELECT, INSERT, UPDATE, DELETE), all scoped TO authenticated
     with auth.uid() = user_id ownership checks.
   - user_id defaults to auth.uid() so client inserts that omit user_id succeed.

4. Important Notes
   - Only the entry_id is stored — never the regulation text, value, quote or status.
   - Signed-out users continue to use browser localStorage; this table is only for
     authenticated users.
   - The unique constraint prevents duplicate saves of the same entry by the same user.
*/

CREATE TABLE IF NOT EXISTS saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saves ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS saves_user_entry_unique ON saves (user_id, entry_id);

DROP POLICY IF EXISTS "select_own_saves" ON saves;
CREATE POLICY "select_own_saves" ON saves FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saves" ON saves;
CREATE POLICY "insert_own_saves" ON saves FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_saves" ON saves;
CREATE POLICY "update_own_saves" ON saves FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saves" ON saves;
CREATE POLICY "delete_own_saves" ON saves FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

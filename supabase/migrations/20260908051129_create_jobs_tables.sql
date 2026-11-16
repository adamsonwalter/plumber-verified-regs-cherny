/*
# Create jobs and job_items tables

1. Purpose
   Signed-in users can group saved regulation entry IDs into named jobs — e.g.
   "Bennett St reno". A job is a named collection of entry IDs; the regulation
   text itself is never stored (same rule as saves — entry id only).

2. New Tables
   - `jobs`
     - `id` (uuid, primary key)
     - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users ON DELETE CASCADE)
     - `name` (text, not null)
     - `note` (text, nullable)
     - `created_at` (timestamptz, defaults to now())
   - `job_items`
     - `id` (uuid, primary key)
     - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
     - `entry_id` (text, not null — the register entry's stable id)
     - `created_at` (timestamptz, defaults to now())
   - Unique constraint on (job_id, entry_id) to prevent duplicates within a job.

3. Security
   - RLS enabled on both tables.
   - `jobs`: four policies (SELECT/INSERT/UPDATE/DELETE) scoped TO authenticated
     with auth.uid() = user_id. user_id defaults to auth.uid().
   - `job_items`: four policies (SELECT/INSERT/UPDATE/DELETE) scoped TO authenticated
     with ownership checked through the parent job:
     EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
   - This ensures a user can only reach job_items belonging to their own jobs.

4. Important Notes
   - A reg can sit in more than one job (no cross-job uniqueness, only within-job).
   - Deleting a job cascades to its job_items (ON DELETE CASCADE).
   - Only entry_id is stored — never regulation text, value, quote or status.
*/

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_jobs" ON jobs;
CREATE POLICY "select_own_jobs" ON jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  entry_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_items ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS job_items_job_entry_unique ON job_items (job_id, entry_id);

DROP POLICY IF EXISTS "select_own_job_items" ON job_items;
CREATE POLICY "select_own_job_items" ON job_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_job_items" ON job_items;
CREATE POLICY "insert_own_job_items" ON job_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_job_items" ON job_items;
CREATE POLICY "update_own_job_items" ON job_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_job_items" ON job_items;
CREATE POLICY "delete_own_job_items" ON job_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

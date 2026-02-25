/*
  # Survey Generator Database Schema

  1. New Tables
    - `surveys`
      - `id` (uuid, primary key) - Unique identifier for each survey
      - `title` (text) - Title of the survey
      - `context` (text) - Study context provided by user
      - `logigramme` (jsonb) - Flowchart structure with questions and answers
      - `status` (text) - Current status: draft, completed
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `user_id` (uuid) - Reference to auth.users (for future auth integration)

  2. Security
    - Enable RLS on `surveys` table
    - Add policies for public access (will be restricted when auth is added)
*/

CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text DEFAULT 'Untitled Survey',
  context text NOT NULL,
  logigramme jsonb,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid
);

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to surveys"
  ON surveys
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert access to surveys"
  ON surveys
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update access to surveys"
  ON surveys
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to surveys"
  ON surveys
  FOR DELETE
  TO anon, authenticated
  USING (true);

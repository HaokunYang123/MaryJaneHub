-- Auth Whitelist Table
-- Stores email addresses allowed to access the application
--
-- Only whitelisted emails can sign in via Google OAuth

CREATE TABLE IF NOT EXISTS auth_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  role text DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  is_active boolean DEFAULT true
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS auth_whitelist_email_idx ON auth_whitelist (email);
CREATE INDEX IF NOT EXISTS auth_whitelist_active_idx ON auth_whitelist (is_active) WHERE is_active = true;

-- Function to check if an email is whitelisted
CREATE OR REPLACE FUNCTION is_email_whitelisted(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth_whitelist
    WHERE LOWER(email) = LOWER(check_email)
    AND is_active = true
  );
$$;

-- Function to get user role from whitelist
CREATE OR REPLACE FUNCTION get_whitelist_role(check_email text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM auth_whitelist
  WHERE LOWER(email) = LOWER(check_email)
  AND is_active = true
  LIMIT 1;
$$;

-- RLS policies
ALTER TABLE auth_whitelist ENABLE ROW LEVEL SECURITY;

-- Only admins can view and modify the whitelist
CREATE POLICY "Admins can view whitelist"
  ON auth_whitelist FOR SELECT
  TO authenticated
  USING (
    get_whitelist_role(auth.jwt() ->> 'email') = 'admin'
  );

CREATE POLICY "Admins can insert to whitelist"
  ON auth_whitelist FOR INSERT
  TO authenticated
  WITH CHECK (
    get_whitelist_role(auth.jwt() ->> 'email') = 'admin'
  );

CREATE POLICY "Admins can update whitelist"
  ON auth_whitelist FOR UPDATE
  TO authenticated
  USING (
    get_whitelist_role(auth.jwt() ->> 'email') = 'admin'
  );

CREATE POLICY "Admins can delete from whitelist"
  ON auth_whitelist FOR DELETE
  TO authenticated
  USING (
    get_whitelist_role(auth.jwt() ->> 'email') = 'admin'
  );

-- Add comments
COMMENT ON TABLE auth_whitelist IS 'Email whitelist for authorized users';
COMMENT ON COLUMN auth_whitelist.role IS 'User role: admin, user, or viewer';
COMMENT ON FUNCTION is_email_whitelisted IS 'Check if an email is in the active whitelist';
COMMENT ON FUNCTION get_whitelist_role IS 'Get the role for a whitelisted email';

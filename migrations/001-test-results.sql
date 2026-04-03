-- Migration 001: test_results table for testing companion app
-- Run in Supabase SQL Editor or via run-migration.js

CREATE TABLE IF NOT EXISTS test_results (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  test_case_id  TEXT        NOT NULL,
  user_id       UUID        NOT NULL,
  user_email    TEXT        NOT NULL,
  status        TEXT        NOT NULL CHECK (status IN ('pass', 'fail', 'skip')),
  notes         TEXT,
  tested_at     TIMESTAMPTZ DEFAULT now(),
  submitted_at  TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(tenant_id, test_case_id, user_id)
);

-- RLS
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;

-- Admins can read all results in their tenant
CREATE POLICY "admin_read_test_results"
  ON test_results FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

-- Non-admins can read only their own results
CREATE POLICY "self_read_test_results"
  ON test_results FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin'
    AND user_id = auth.uid()
    AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

-- Users can insert/update their own results
CREATE POLICY "self_write_test_results"
  ON test_results FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

CREATE POLICY "self_update_test_results"
  ON test_results FOR UPDATE
  USING (
    user_id = auth.uid()
    AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

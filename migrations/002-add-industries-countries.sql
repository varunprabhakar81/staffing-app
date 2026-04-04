-- Migration 002: industries + countries tables
-- Run in Supabase SQL Editor before running 002-add-industries-countries.js

-- industries: tenant-scoped
CREATE TABLE IF NOT EXISTS industries (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, tenant_id)
);

-- RLS on industries
ALTER TABLE industries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'industries' AND policyname = 'tenant_read_industries'
  ) THEN
    CREATE POLICY "tenant_read_industries" ON industries FOR SELECT
      USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
  END IF;
END $$;

-- countries: global (no RLS — same list for all tenants)
CREATE TABLE IF NOT EXISTS countries (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INT  DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

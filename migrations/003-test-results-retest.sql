-- Migration 003: add 'retest' lifecycle state to test_results
-- Safe to run multiple times (idempotent).

-- Expand the CHECK constraint to allow 'retest' as an admin-set lifecycle state.
-- Postgres names inline CHECK constraints as {table}_{column}_check by default.
ALTER TABLE test_results DROP CONSTRAINT IF EXISTS test_results_status_check;
ALTER TABLE test_results ADD CONSTRAINT test_results_status_check
  CHECK (status IN ('pass', 'fail', 'skip', 'note', 'retest'));

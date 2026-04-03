/**
 * run-migration.js
 * Creates the test_results table via Supabase Management API.
 *
 * Requires SUPABASE_ACCESS_TOKEN in .env (Supabase personal access token —
 * get it from https://supabase.com/dashboard/account/tokens).
 *
 * Usage: node run-migration.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN not set in .env');
  console.error('Get one at: https://supabase.com/dashboard/account/tokens');
  console.error('Add to .env: SUPABASE_ACCESS_TOKEN=sbp_...');
  process.exit(1);
}

const projectRef = process.env.SUPABASE_URL.match(/https:\/\/([^.]+)/)[1];
const sql = fs.readFileSync(path.join(__dirname, 'migrations', '001-test-results.sql'), 'utf8');

(async () => {
  console.log(`Running migration on project: ${projectRef}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('Migration FAILED:', JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log('Migration SUCCESS:', JSON.stringify(body));
})();

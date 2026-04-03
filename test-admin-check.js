/**
 * test-admin-check.js
 * Verifies test_admin flag behavior for both accounts.
 * Usage: node test-admin-check.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const accounts = [
  { email: 'vaprabhakar@deloitte.com', expectTestAdmin: false },
  { email: 'varun.prabhakar+meridian@gmail.com', expectTestAdmin: true },
  { email: 'varun.prabhakar+acme@gmail.com', expectTestAdmin: true },
  { email: 'varun.prabhakar+bigco@gmail.com', expectTestAdmin: true },
  { email: 'varun.prabhakar+summit@gmail.com', expectTestAdmin: true },
];

(async () => {
  console.log('Checking test_admin flags via Supabase admin API...\n');

  const { data: { users }, error } = await serviceClient.auth.admin.listUsers({ perPage: 200 });
  if (error) { console.error('ERROR listing users:', error.message); process.exit(1); }

  let allPass = true;
  for (const acct of accounts) {
    const user = users.find(u => u.email === acct.email);
    if (!user) {
      console.log(`❌ NOT FOUND: ${acct.email}`);
      allPass = false;
      continue;
    }
    const testAdmin = user.app_metadata?.test_admin === true;
    const role = user.app_metadata?.role || '(none)';
    const ok = testAdmin === acct.expectTestAdmin;
    const icon = ok ? '✓' : '✗';
    console.log(`${icon} ${acct.email}`);
    console.log(`  role=${role}, test_admin=${testAdmin}, expected test_admin=${acct.expectTestAdmin}${ok ? '' : ' ← MISMATCH'}`);
    if (!ok) allPass = false;
  }

  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
})();

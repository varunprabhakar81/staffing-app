const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const RAILWAY_URL = process.env.RAILWAY_URL || 'https://staffing-app-production.up.railway.app';

(async () => {
  // Delete any existing gmail invite users that never set passwords
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const gmailUsers = users.filter(u => u.email?.includes('varun.prabhakar') && u.email?.includes('gmail.com'));
  for (const u of gmailUsers) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    console.log(`Deleted ${u.email}: ${error ? 'FAILED' : 'OK'}`);
  }

  // Get tenant IDs
  const { data: tenants } = await supabase.from('tenants').select('id, name');

  const invites = [
    { email: 'varun.prabhakar+meridian@gmail.com', tenantName: 'Meridian Consulting' },
    { email: 'varun.prabhakar+acme@gmail.com',     tenantName: 'Acme Corp' },
    { email: 'varun.prabhakar+bigco@gmail.com',    tenantName: 'BigCo Inc' },
    { email: 'varun.prabhakar+summit@gmail.com',   tenantName: 'Summit LLC' },
  ];

  for (const inv of invites) {
    const tenant = tenants.find(t => t.name === inv.tenantName);
    if (!tenant) { console.log(`Tenant not found: ${inv.tenantName}`); continue; }
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: inv.email,
      options: {
        data: { role: 'admin', tenant_id: tenant.id, display_name: 'Varun Prabhakar' },
        redirectTo: `${RAILWAY_URL}/set-password.html`
      }
    });
    if (error) {
      console.log(`${inv.email}: FAILED — ${error.message}`);
    } else {
      console.log(`\n${inv.email} (${inv.tenantName}):`);
      console.log(`  ${data.properties.action_link}`);
    }
  }
})();

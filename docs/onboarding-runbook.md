# Staffing Intelligence — New User Onboarding Playbook

## Purpose
This is a CC-executable playbook. When this file is read, CC runs the onboarding flow automatically.

## CC Instructions

When this file is read, do the following:

### Step 0 — Ask for inputs

Ask the user for:
1. Name (e.g. Tim Callesen)
2. Email (e.g. tcallesen@deloitte.com)
3. Role — one of: admin, resource_manager, project_manager, executive, consultant
4. Tenant — one of: Meridian Consulting, Acme Corp, BigCo Inc, Summit LLC

If the user already provided some or all of these when they asked you to read this file, skip asking for those. Only ask for what's missing.

Reference directory (suggest these if user isn't sure):

| Tester | Email | Role | Tenant |
|--------|-------|------|--------|
| Tim Callesen | tcallesen@deloitte.com | admin | Acme Corp |
| Shreyas Sampath | ssampath@deloitte.com | resource_manager | BigCo Inc |
| Nick Kolbow | nkolbow@deloitte.com | resource_manager | Summit LLC |

### Step 1 — Generate invite link

Once you have all 4 inputs, run this Node.js script (do NOT commit):

```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const RAILWAY_URL = process.env.RAILWAY_URL || 'https://staffing-app-production.up.railway.app';

(async () => {
  const { data: tenants } = await supabase.from('tenants').select('id, name');
  const tenant = tenants.find(t => t.name === 'TENANT_NAME');
  if (!tenant) { console.log('ERROR: Tenant not found'); return; }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: 'USER_EMAIL',
    options: {
      data: { role: 'USER_ROLE', tenant_id: tenant.id, display_name: 'USER_NAME', testing_role: 'tester' },
      redirectTo: `${RAILWAY_URL}/set-password.html`
    }
  });

  if (error) { console.log('ERROR:', error.message); return; }
  console.log('INVITE_URL:', data.properties.action_link);
})();
```

Replace TENANT_NAME, USER_EMAIL, USER_ROLE, USER_NAME with the collected inputs.

### Step 2 — Output the Teams message

After generating the link, output this filled-in message in a code block so the user can copy-paste it directly into Teams:

```
Hey [NAME],

I've been building a resource planning tool for our practice and I'd love your help testing it. It's called Staffing Intelligence — it tracks consultant utilization, project staffing, and demand coverage across a rolling 12-week window.

You're set up as [ROLE_DISPLAY] on the [TENANT] sandbox environment with synthetic data (not real).

To get started:
1. Click this link to set your password: [INVITE_URL]
2. Choose a password (8+ characters) and confirm it
3. After setting your password, click "Go to Login"
4. Log in with your email ([EMAIL]) and the password you just chose

A few things to know:
- The invite link expires in 24 hours — let me know if you need a new one
- You'll see a welcome screen on first login with some tips for your role
- The data is all synthetic so feel free to click around and break things
- I'll send you a testing checklist separately once you're in

Takes about 30 seconds to set up. Let me know if you hit any issues!
```

ROLE_DISPLAY mapping:
- admin → "an administrator"
- resource_manager → "a resource manager"
- project_manager → "a project manager"
- executive → "an executive viewer"
- consultant → "a consultant"

### Step 3 — Print summary

Print:
- The invite URL (backup copy)
- The Teams message (ready to copy)
- Reminder: "Link expires in 24 hours. If it expires, just re-read this file to generate a new one."

---

## Troubleshooting

If the script returns an error:

| Error | Fix |
|-------|-----|
| "email_exists" | User already has an account. Ask the user if they want to delete it and re-invite. If yes: `supabase.auth.admin.deleteUser(id)` then re-run Step 1. |
| Link expired | Re-read this file to generate a fresh link. |
| Wrong tenant | Delete the user, re-read this file with correct tenant. |

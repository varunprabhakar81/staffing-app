# Tester Sandbox Setup Guide

Each tester gets their own isolated tenant on the same Supabase project and Railway instance. RLS enforces complete data isolation — testers can never see each other's data. Each tester tenant has its own admin or resource_manager user who can reset their sandbox at any time via Settings → Sandbox.

Synthetic data is **deterministic per tenant**: the same tenant UUID always produces the same names on every reset, but different tenants get different names. So Tim's sandbox always has the same 25 consultants, Shreyas's sandbox has a different set, etc.

---

## Active Tester Accounts

| Tester | Email | Password | Role | Tenant UUID |
|--------|-------|----------|------|-------------|
| Tim Callesen | tcallesen@deloitte.com | TestAdmin_2026! | admin | af54e202-0cf5-4704-99f0-c9d5cbace9fe |
| Shreyas Sampath | ssampath@deloitte.com | TestRM_2026! | resource_manager | 860c55be-94cf-4ae6-9508-2dc2909e7829 |
| Nick Kolbow | nkolbow@deloitte.com | TestRM_2026! | resource_manager | 06b61e91-6a2c-43b0-bb39-2aeb56d8f244 |

> **Security note:** Ask testers to change their password on first login.

---

## Resetting a Sandbox

### Via the app (recommended)

1. Log in as the tester
2. Go to **Settings → Sandbox**
3. Click **Reset sandbox** and confirm
4. Data resets in ~5 seconds; page reloads automatically via SSE

### Via CLI (dev/local)

```bash
node seed-synthetic-data.js --tenant-id <TENANT_UUID>
```

The reset endpoint and seed script:
- Delete all staffing data for the tenant (consultants, projects, assignments, needs)
- Re-insert 25 consultants, 12 projects, 302 assignments, 12 open needs
- Use deterministic RNG seeded by the tenant UUID — same tenant always gets the same names
- **Reject** requests targeting the production tenant UUID (safety guard)

---

## Provisioning a New Tester Sandbox

### Step 1 — Generate a new tenant UUID

```bash
node -e "const { randomUUID } = require('crypto'); console.log(randomUUID());"
```

### Step 2 — Provision shared lookup data

Run in Node.js (or adapt to your environment):

```javascript
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const PROD = process.env.TENANT_ID;
const NEW_TENANT = '<YOUR_NEW_UUID>';
const TENANT_NAME = 'Tester Name Sandbox';

// Insert tenants row
await sb.from('tenants').insert({ id: NEW_TENANT, name: TENANT_NAME });

// Copy levels from prod
const { data: lvls } = await sb.from('levels')
  .select('name, sort_order, default_cost_rate, default_bill_rate, target_billable_pct')
  .eq('tenant_id', PROD);
await sb.from('levels').insert(lvls.map(r => ({ ...r, tenant_id: NEW_TENANT })));

// Copy skill_sets from prod
const { data: skills } = await sb.from('skill_sets').select('name, type').eq('tenant_id', PROD);
await sb.from('skill_sets').insert(skills.map(r => ({ ...r, tenant_id: NEW_TENANT })));
```

### Step 3 — Seed synthetic data

```bash
node seed-synthetic-data.js --tenant-id <YOUR_NEW_UUID>
```

### Step 4 — Create a Supabase auth user

```javascript
await sb.auth.admin.createUser({
  email: 'tester@example.com',
  password: 'TemporaryPassword123!',
  app_metadata: {
    role: 'admin',                // or 'resource_manager'
    tenant_id: '<YOUR_NEW_UUID>',
  },
  user_metadata: {
    display_name: 'Tester Name', // shown in sidebar
  },
  email_confirm: true,
});
```

Key fields:
- `app_metadata.role` — `admin` gives full access including sandbox reset; `resource_manager` gives full data access but no user management
- `app_metadata.tenant_id` — the UUID from Step 1; used by RLS to isolate data
- `user_metadata.display_name` — shown in the sidebar footer and welcome modal

> **Important:** `app_metadata` is set server-side only and is trusted by RLS. Never use `user_metadata` for `role` or `tenant_id` — it is writable by the user.

### Step 5 — Share credentials with the tester

Send:
- App URL
- Email and temporary password
- Note: they can reset their sandbox any time via **Settings → Sandbox**

---

## Multi-Tenant Architecture Notes

- Each tenant's data is fully isolated via `tenant_id` column + RLS policies on every table
- The same Railway instance and Supabase project serve all tenants
- `serviceClient` (service role key) used in the reset endpoint bypasses RLS — safe because we validate `tenant_id` from the session and reject the production tenant
- To add more tenants: repeat Steps 1–4. No infrastructure changes required.
- To remove a tenant: delete the auth user in Supabase, then `DELETE FROM <table> WHERE tenant_id = '<UUID>'` for each table in FK-safe order (same order as the seed script's delete phase)
- Per-tenant name randomization: `hashTenantId(uuid)` → mulberry32 PRNG → unique names drawn from pools in `seed-synthetic-data.js`. Same UUID → same names on every reset.

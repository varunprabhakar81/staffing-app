# Tester Sandbox Setup Guide

Each tester gets their own isolated tenant on the same Supabase project and Railway instance. RLS enforces complete data isolation — testers can never see each other's data. Each tester tenant has its own admin user who can reset their sandbox at any time via `POST /api/admin/reset-sandbox`.

---

## Step 1 — Generate a new tenant UUID

```bash
node -e "const { randomUUID } = require('crypto'); console.log(randomUUID());"
```

Record this UUID — it will be the `tenant_id` for this tester's sandbox.

---

## Step 2 — Provision shared lookup data for the new tenant

Levels and skill_sets must exist for the tenant before seeding. Run the following in the Supabase SQL editor, substituting `<TENANT_UUID>`:

```sql
-- Copy levels from the production tenant
INSERT INTO levels (name, billing_rate, cost_rate, tenant_id)
SELECT name, billing_rate, cost_rate, '<TENANT_UUID>'
FROM levels
WHERE tenant_id = '<PROD_TENANT_UUID>';

-- Copy skill_sets from the production tenant
INSERT INTO skill_sets (name, type, tenant_id)
SELECT name, type, '<TENANT_UUID>'
FROM skill_sets
WHERE tenant_id = '<PROD_TENANT_UUID>';
```

> **Note:** `<PROD_TENANT_UUID>` is the value of `TENANT_ID` in your `.env` file.

---

## Step 3 — Seed synthetic data for the new tenant

```bash
node seed-synthetic-data.js --tenant-id <TENANT_UUID>
```

The script will prompt for confirmation, then insert 25 consultants, 12 projects, 302 assignments, and 12 open needs into that tenant's tables. Safe to run repeatedly — it deletes and re-seeds each time.

---

## Step 4 — Create a Supabase auth user for the tester

In the Supabase dashboard → **Authentication → Users → Invite user**, or via the admin API:

```bash
# Using the Supabase service role key
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
sb.auth.admin.createUser({
  email: 'tester@example.com',
  password: 'TemporaryPassword123!',
  app_metadata: {
    role: 'admin',
    tenant_id: '<TENANT_UUID>'
  },
  email_confirm: true
}).then(({ data, error }) => {
  if (error) console.error(error.message);
  else console.log('Created user:', data.user.id);
});
"
```

Key fields in `app_metadata`:
- `role`: `admin` (gives the tester full access to their sandbox, including reset)
- `tenant_id`: the UUID generated in Step 1 — this is what RLS uses to isolate data

> **Important:** `app_metadata` is set server-side only. Do not use `user_metadata` for these fields — it is writable by the user and not trusted by RLS.

---

## Step 5 — Share credentials with the tester

Send the tester:
- App URL (production Railway URL or localhost:3000 for local testing)
- Email: the address used in Step 4
- Temporary password: ask them to change it on first login
- Note: they can reset their sandbox any time via Settings (once the UI button is built in Stage 2)

---

## Resetting a sandbox

### Via API (admin only)

```bash
# Must be authenticated as the tester's admin user
curl -X POST https://<app-url>/api/admin/reset-sandbox \
  -H "Content-Type: application/json" \
  --cookie "connect.sid=<session-cookie>"
```

The reset endpoint:
- Reads `tenant_id` from the authenticated session (users can only reset their own tenant)
- **Rejects** requests if the tenant matches the production `TENANT_ID` env var (safety guard)
- Runs the full delete-and-reseed sequence, then reloads the in-memory staffing cache

### Via CLI (for local/dev)

```bash
node seed-synthetic-data.js --tenant-id <TENANT_UUID>
```

---

## Multi-tenant architecture notes

This setup doubles as a dry run for the V3 multi-tenant architecture:

- Each tenant's data is fully isolated via `tenant_id` column + RLS policies
- The same Railway instance and Supabase project serve all tenants
- The `serviceClient` (service role key) used in the reset endpoint bypasses RLS — this is safe because we validate `tenant_id` from the session and reject the production tenant
- To add more tenants: repeat Steps 1–4. No infrastructure changes required.
- To remove a tenant: delete the auth user in Supabase, then `DELETE FROM <table> WHERE tenant_id = '<UUID>'` for each table in FK-safe order (same order as the seed script's delete phase)

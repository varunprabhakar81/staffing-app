# Staffing Intelligence — Testing Companion App Spec

## What This Is

A standalone testing portal (`/testing.html`) served from the same Railway instance. Testers open the main app in one browser window and the testing portal side-by-side. The portal presents structured test cases with pass/fail/skip/notes tracking and an admin summary view.

---

## How Testing Works

### Before a testing cycle
1. Varun reviews `public/test-cases.json` — adds, removes, or edits tests as needed
2. Push changes to main → Railway auto-deploys
3. Onboard testers using `docs/onboarding-runbook.md`

### During a testing cycle
1. Tester logs in to the main app at `[RAILWAY_URL]`
2. Tester opens `[RAILWAY_URL]/testing.html` in a second window (same browser, shared session)
3. Testing portal shows test cases filtered to their role
4. Tester works through each test:
   - Read the title, steps, and expected result
   - Perform the test in the main app window
   - Click Pass, Fail, or Skip in the testing portal
   - Add notes if needed (especially on Fail)
5. Progress bar shows completion
6. Results save to Supabase on every button click

### After a testing cycle
1. Varun logs in to testing.html as admin
2. Switches to Summary tab — sees all testers × all tests matrix
3. Filters by status (fail/skip) to find issues
4. Creates GitHub issues for failures
5. Fixes issues, adds regression tests to test-cases.json, runs next cycle

---

## Architecture

### Test cases — `public/test-cases.json`
Static JSON file, fetched on page load. No database, no seed script.

```json
[
  {
    "id": "auth-01",
    "area": "Authentication",
    "title": "Login with valid credentials",
    "roles": ["admin", "resource_manager", "project_manager", "executive", "consultant"],
    "steps": "Go to login.html. Enter valid email + password. Click Log In.",
    "expected": "Redirects to dashboard. Sidebar shows correct tenant name, role badge, and display name."
  }
]
```

Fields:
- `id` — unique string, format: `area-NN` (e.g. `auth-01`, `heatmap-03`)
- `area` — grouping label for collapsible sections
- `title` — short, descriptive
- `roles` — array of roles this test applies to. Test only shows if tester's role is in this array.
- `steps` — what to do (numbered if multi-step, plain text)
- `expected` — what should happen

### Test results — Supabase `test_results` table
Only the dynamic data lives in the database.

```sql
CREATE TABLE test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  test_case_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'skip')),
  notes TEXT,
  tested_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, test_case_id, user_id)
);
```

The UNIQUE constraint means one result per user per test. Upserting overwrites previous result (tester can retest and change their answer).

RLS:
- INSERT/UPDATE: user can write own results (where user_id = auth.uid() and tenant_id matches JWT)
- SELECT: admin can read all results in their tenant; non-admin can read only their own

### API endpoints

```
GET  /api/test-results         — returns current user's results (all test_case_ids + status + notes)
POST /api/test-results         — upsert { test_case_id, status, notes }
GET  /api/test-results/summary — admin only, returns all users' results for the tenant
```

All endpoints use requireAuth. Summary uses requireRole('admin').

---

## Frontend — testing.html

### Layout
- Same dark theme as main app
- Header: "Staffing Intelligence — Testing Portal" + progress bar + tenant name + user name
- Two tabs: "My Tests" and "Summary" (Summary visible to admin only)
- Left sidebar: area filters (click to scroll to section)
- Main area: test cards grouped by area in collapsible sections

### My Tests tab
- Cards grouped under area headings (collapsible)
- Each card shows: title, steps, expected result
- Right side of each card: Pass / Fail / Skip buttons (color-coded: green/red/gray)
- Notes textarea appears on Fail or when Note is clicked
- Clicking a button immediately saves to Supabase (no separate save action)
- Progress bar at top: "X of Y completed" with fill percentage
- Area filter sidebar shows count per area: "Authentication (3/5)"

### Summary tab (admin only)
- Matrix view: rows = test cases (grouped by area), columns = testers
- Each cell: colored dot (green=pass, red=fail, gray=skip, empty=untested)
- Click a cell to see that tester's notes
- Top-level stats: total tests × testers, % complete, % passing
- Filter: show only failures, show only untested

### Auth
- Same Supabase session as main app (shared cookies)
- On page load: fetch /api/auth/me for role, display_name, tenant_name
- If not authenticated: redirect to login.html

---

## Test Coverage Areas

### 1. Authentication (~5 tests)
- Login with valid credentials
- Login with wrong password
- Logout
- Session expiry (idle timeout)
- Forgot password flow

### 2. Dashboard / Overview (~8 tests)
- KPIs load correctly (utilization %, bench count, billable count)
- Bench list shows correct consultants
- Rolloff list accuracy
- Demand cliffs display
- Needs coverage donut chart renders
- Donut chart click filters needs list
- Chart tooltips display data
- Dashboard refreshes on Ctrl+R

### 3. Resource Allocation / Heatmap (~10 tests)
- Heatmap loads correct consultants for tenant
- Color coding: bench (red), partial (yellow), utilized (green), over (orange)
- Expand consultant row shows project breakdown
- Inline cell editing (click cell, type hours, blur to save)
- Save confirmation appears
- Keyboard nav: Tab moves between cells
- Keyboard nav: Enter moves down
- Quick Fill functionality
- Collapse/expand all rows
- Heatmap scroll performance (virtual scrolling)

### 4. Needs Tab (~12 tests)
- Create new need (level, skills, hours, dates)
- Edit existing need
- Close need as "met"
- Close need as "abandoned"
- Candidate matching shows eligible consultants
- Bulk assign consultants to need
- Auto-close when need fully staffed
- Urgency badges (Urgent ≤2wk, Soon 2-4wk, Planned 4+wk)
- Donut chart segments by client
- Donut chart click filters needs list
- Needs list sorted correctly
- Skill matching uses allSkillSets (not primary only)

### 5. Ask Claude (~5 tests)
- Suggested questions load on tab open
- Free-form question returns relevant answer
- Response references correct tenant data (not other tenants)
- Follow-up question works
- Error state (empty question)

### 6. Settings: Consultants (~6 tests)
- Consultant list loads
- Edit consultant profile (name, level, location)
- Add skill to consultant
- Remove skill from consultant
- Deactivate consultant
- Reactivate consultant

### 7. Settings: Users (~5 tests)
- User list loads
- Invite new user (generates link, no password field)
- Change user role
- Deactivate user
- Reactivate user

### 8. RBAC (~15 tests)
Admin:
- Can edit heatmap cells
- Can close/assign needs
- Can access Settings: Consultants
- Can access Settings: Users
- Can see billing rates in consultant profile

Resource Manager:
- Can edit heatmap cells
- Can close/assign needs
- Can access Settings: Consultants
- Cannot access Settings: Users
- Can see billing rates

Project Manager:
- Cannot edit heatmap cells (read-only)
- Can create/edit needs (not close/assign)
- Cannot see billing rates in consultant profile

Executive:
- Read-only dashboard + heatmap
- Can access Ask Claude
- Cannot edit anything
- Cannot access Settings

Consultant:
- Sees only own heatmap row
- Sees own profile (no rates)
- Cannot see other consultants
- Ask Claude returns 403

### 9. Tenant Isolation (~3 tests)
- Dashboard shows only tenant's consultants
- Heatmap shows only tenant's employees
- Ask Claude references only tenant's data

### 10. Sandbox Reset (~2 tests)
- Admin can reset sandbox (non-prod tenant)
- Reset rejects production tenant UUID

---

## Adding New Tests

Edit `public/test-cases.json`:

1. Pick the right area
2. Generate an ID: `[area-prefix]-[next-number]` (e.g. `needs-13`)
3. Specify which roles it applies to
4. Write clear steps and expected result
5. Push to main

Test IDs are stable — don't renumber. If you delete a test, leave a gap.

---

## CC Instructions

To build this feature, CC should:
1. Read this spec file AND CLAUDE.md
2. Create the Supabase table (via migration script)
3. Add API endpoints to server.js
4. Create public/test-cases.json with all test cases from the coverage areas above
5. Create public/testing.html with full UI
6. Test locally before committing

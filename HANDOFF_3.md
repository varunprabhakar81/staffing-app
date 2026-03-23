Staffing Intelligence App — Chat Handoff Document
Last updated: Session 10 complete — #112 alert()→showToast(), #107 try/catch on user mgmt, #113 success toast + full showToast variant system built. Next: #105 role gating UAT.

---

## What This App Is

Staffing Intelligence — a real-time staffing management platform for Varun's NetSuite consulting practice at Deloitte.

* Local web app at http://localhost:3000
* Node.js + Express backend, plain HTML/CSS/JS frontend
* Claude API (claude-sonnet-4-20250514) for AI features
* Supabase (Postgres) as data backbone — Excel fully retired
* 25 real employees, real project data
* GitHub: https://github.com/varunprabhakar81/staffing-app (private)
* Railway (prod): https://staffing-app-production.up.railway.app

---

## Tech Stack

* server.js — Express backend + all API endpoints
* supabaseReader.js — Supabase data layer (dual-client: serviceClient + anonClient)
* claudeService.js — Claude API integration
* public/index.html, app.js, styles.css — frontend
* public/login.html — login page (dark theme, session-based auth)
* import-to-supabase.js — one-time Excel import script (keep for re-runs, uses serviceClient)
* data/resourcing.xlsx — gitignored, kept for reference only (no longer used in app)

---

## Environment Variables (.env — required, all present and verified)

ANTHROPIC_API_KEY=your-key
PORT=3000
SUPABASE_URL=https://pybmpknumxshailjatok.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
SUPABASE_ANON_KEY=your-anon-key
SESSION_SECRET=your-random-32-byte-hex
TENANT_ID=9762ee19-e1d1-48db-bc57-e96bee9ce2f8

Railway dashboard needs these 7 variables (PORT is injected automatically by Railway — do not set it):
- ANTHROPIC_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- SUPABASE_ANON_KEY
- SESSION_SECRET (generate a NEW one for prod — do not reuse local)
- TENANT_ID
- NODE_ENV=production

---

## ⚡ KEY DESIGN PIVOT: No Explicit Edit Mode (Session 9)

The Edit Mode button is gone. Do not add it back.

New design (Airtable/Float model):
* Cells are always editable for admin and resource_manager — single click enters edit inline
* No mode toggle, no button, no state variable called _editMode or editMode
* The _hmCanEdit() function controls access — returns true for admin/resource_manager only
* project_manager and executive see read-only cells
* Pending changes tracked in _pendingStaffing map (key = "consultantId_projectId_weekKey")
* Amber dot (3px, #F59E0B) on cells with unsaved changes
* Floating save bar appears at bottom only when _pendingStaffing.size > 0
* Save bar: "X unsaved change(s)" label | Discard button | Save All button
* SSE fires while edits pending → toast appears, heatmap NOT overwritten
* Quick Fill bar shows when any row is expanded (_hmExpanded.size > 0), hidden otherwise

Total row cells are NOT editable:
* Cells with data-cell-type="emp-total" are read-only for all roles
* Clicking a Total cell auto-expands the consultant row and shows a pill tooltip
* Tooltip auto-dismisses after 2000ms or on outside click

Removed entirely:
* _editMode boolean variable
* toggleEditMode() function
* #hmEditToggle button element
* #conflictBanner fixed div (replaced by toast)
* All CSS classes tied exclusively to edit mode toggle

---

## Auth Architecture (#32 — complete)

* Supabase Auth with email/password
* Server-side sessions via express-session (httpOnly cookie, 8-hour maxAge)
* JWT contains tenant_id + role in app_metadata — set via custom_access_token_hook Postgres function
* RLS policies use auth.jwt() -> 'app_metadata' ->> 'tenant_id' (not current_setting)
* supabaseReader.js: serviceClient (service role, bypasses RLS) + anonClient (per-request JWT, RLS enforced)
* requireAuth middleware: protects all /api/* routes except /api/auth/*
* requireRole() middleware: enforces role-based access on sensitive routes
* Login page: public/login.html — POST /api/auth/login → session → redirect to index.html
* Logout: POST /api/auth/logout → session destroyed → redirect to login.html
* Auth guard: app.js checks /api/auth/me on load — 401 → redirect to login.html
* Startup cache warms using serviceClient (bypasses RLS) — logs "40 supply rows, 8 demand rows" on boot
* app.set('trust proxy', 1) — required for Railway reverse proxy + secure cookies in prod
* /api/dashboard and /api/heatmap use serviceClient (not user JWT) — required after RLS tightening

---

## RBAC (#62 — complete)

4 roles defined. Role stored in app_metadata.role in Supabase, stamped into JWT via custom_access_token_hook, stored in session at login, exposed on /api/auth/me.

| Role | Access |
|---|---|
| admin | Full access + User Management + heatmap editing |
| resource_manager | All tabs except Settings. Heatmap editing available |
| project_manager | Overview, Needs (own projects), Ask Claude. Read-only heatmap |
| executive | Overview + Ask Claude only. Read-only |

Tab visibility matrix:
| Tab | admin | resource_manager | project_manager | executive |
|---|---|---|---|---|
| Overview | ✅ | ✅ | ✅ | ✅ |
| Staffing | ✅ | ✅ | ❌ | ❌ |
| Needs | ✅ | ✅ | ✅ | ❌ |
| Ask Claude | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ❌ | ❌ | ❌ |
| Edit Mode button | REMOVED — no longer exists |

API route protection:
| Route | Roles allowed |
|---|---|
| GET /api/demand | admin, resource_manager, project_manager |
| GET /api/dashboard | admin, resource_manager, project_manager |
| GET /api/heatmap | admin, resource_manager, project_manager |
| GET /api/recommendations | admin, resource_manager, project_manager |
| GET /api/manage | admin, resource_manager |
| GET /api/supply | admin, resource_manager, project_manager |
| GET /api/employees | admin, resource_manager, project_manager |
| POST /api/save-staffing | admin, resource_manager |
| POST /api/supply/update | admin, resource_manager |
| GET /api/admin/users | admin |
| POST /api/admin/users/invite | admin |
| PATCH /api/admin/users/:id/role | admin |
| PATCH /api/admin/users/:id/deactivate | admin |
| PATCH /api/admin/users/:id/reactivate | admin |
| POST /api/admin/users/:id/resend-invite | admin |
| DELETE /api/admin/users/:id/invite | admin |

---

## User Management (#63 + #101 — complete)

Admin-only panel under Settings tab.

Features:
* List all users in tenant — Name, Email, Role, Status, Last Login, Date Added
* Invite user — email invite (Supabase magic link) or temp password with complexity enforcement
* Temp password field is type="password" with show/hide eye toggle
* Change role — dropdown per row, PATCH /api/admin/users/:id/role (disabled for invited users)
* Deactivate — sets ban_duration: '87600h'. Row dims to opacity 0.6
* Reactivate — sets ban_duration: 'none' + shows green success toast
* Resend Invite — POST /api/admin/users/:id/resend-invite (invited users only)
* Cancel Invite — DELETE /api/admin/users/:id/invite (unconfirmed accounts only)

Password complexity rules (client + server enforced):
* Min 12 characters
* At least 1 uppercase, 1 lowercase, 1 number, 1 special character

Role pill colors: admin=purple(#C9B8FF), resource_manager=blue(#A8C7FA), project_manager=mint(#A8E6CF), executive=yellow(#FFF3A3)

---

## Toast System (updated Session 10)

showToast(msg, type = 'default', durationMs = 8000)

Variants:
* 'error'   → dark red bg (#7F1D1D), red left border (#EF4444), ✕ icon
* 'success' → dark green bg (#166534), green left border (#22C55E), ✓ icon
* 'default' → dark navy bg (#1A1D27), amber left border (#F59E0B), ⚠️ icon

Implementation:
* CSS class-based (toast-error, toast-success, toast-default) — not inline styles
* Colon-split bold label only applies to 'default' type
* Click to dismiss, auto-dismiss after durationMs
* All previous alert() calls replaced with showToast() — no native browser alerts anywhere in app

---

## RLS Architecture

All 9 tenant tables have explicit WITH CHECK clause:
(auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id

tenants table: RLS enabled + deny-all policy (serviceClient only)

---

## Supabase Schema (10 tables)

| Table | Purpose |
|---|---|
| tenants | Master firm registry |
| levels | Consultant levels with rates + utilization targets |
| skill_sets | Skills typed as Practice Area or Technology |
| clients | Client registry |
| projects | Project definitions with status + pipeline probability |
| consultants | Consultant roster with location + rate overrides |
| consultant_skill_sets | Junction: consultants ↔ skill_sets |
| resource_assignments | Weekly hours per consultant per project |
| needs | Staffing needs (open roles) |
| need_skill_sets | Junction: needs ↔ skill_sets |

Key schema decisions:
* Levels: Analyst, Consultant, Senior Consultant, Manager, Senior Manager, Partner/Principal/Managing Director
* Skill types: Practice Area (Procure to Pay, Order to Cash, Record to Report, Supply Chain) + Technology (NetSuite, Ivalua, Emburse, Program Manager)
* Project status: Proposed / Verbal Commit / Sold
* Probability: auto-set by status trigger (25/75/100), overridable per project
* Needs coverage: unmet / partially_met / fully_met — computed at query time
* is_billable on resource_assignments: mandatory, no default
* Rates on levels (seeded): cost + bill rate. Overridable per consultant
* target_billable_pct on levels: Analyst/Consultant 80%, SC 75%, Manager 70%, SM 60%, PPMD 50%
* consultant_effective_rates view: resolves COALESCE(consultant override, level default)
* Tenant ID: 9762ee19-e1d1-48db-bc57-e96bee9ce2f8
* upsertAssignment uses native Supabase upsert with onConflict: 'consultant_id,project_id,week_ending'
* weekKeyToDate map in _meta: derives ISO dates from actual DB dates — no hardcoded year logic

---

## Seeded Rate Data

| Level | Cost/hr | Bill/hr | Target Billable % |
|---|---|---|---|
| Analyst | $150 | $450 | 80% |
| Consultant | $200 | $550 | 80% |
| Senior Consultant | $300 | $750 | 75% |
| Manager | $350 | $788 | 70% |
| Senior Manager | $400 | $800 | 60% |
| Partner/Principal/Managing Director | $600 | $1,050 | 50% |

---

## Non-Billable Projects

Unassigned, Assessment, Evaluation, ERP Evaluation, L2C Assessment, Secondment, Pre-Sales Support

---

## Design System

* Dark theme: #0F1117 page bg, #1A1D27 cards
* Pastel palette: Blue #A8C7FA, Mint #A8E6CF, Coral #FFB3B3, Yellow #FFF3A3, Purple #C9B8FF
* Inter font, white primary, #8892B0 secondary
* Left sidebar: 220px, collapsible to 56px

---

## Current App State

* Login page at /login.html — dark theme, email/password, inline error handling
* Auth guard on app load — redirects to login.html if no session
* Logout button at bottom of left sidebar
* 5 tabs: Overview, Staffing, Needs, Ask Claude, Settings (admin only)
* Overview: KPI cards, utilization by level, overallocation warning with tooltip + drilldown, top projects, rolling off soon, needs attention
* Staffing: Always-on inline cell editing — row tints by utilization tier, horizon-aware bench red, current week column highlight, floating save bar
* Quick Fill bar: appears when any row is expanded, hidden otherwise
* Needs: donut chart + expandable rows with AI match panel. Shows pipeline status + coverage status
* Ask Claude: dynamic suggested questions, text input, markdown responses
* Settings: User Management — active/invited/deactivated status pills, resend/cancel invite actions, collapsible deactivated section (admin only)
* SSE auto-refresh: fires after successful DB writes, pushes data-updated event to all clients
* All saves write to Supabase — ExcelJS fully removed

---

## Issues Completed

| Issue | Title | Status |
|---|---|---|
| #29 | Supabase schema setup | ✅ Closed |
| #30 | Supabase Excel import script | ✅ Closed |
| #31 | Supabase swap backend data layer | ✅ Closed |
| #17 | Auto-refresh SSE | ✅ Closed |
| #67 | Refresh button relocate | ✅ Closed |
| #77 | Merge Manage into Staffing: Hybrid Edit Mode | ✅ Closed |
| #84 | Terminology rename Supply/Demand | ✅ Closed |
| #87–#93 | Supabase Auth setup (#32) | ✅ Closed |
| #38 | Railway deploy | ✅ Closed |
| RLS | RLS tightening | ✅ Closed |
| #62 | RBAC role enforcement | ✅ Closed |
| #63 | User Management UI | ✅ Closed |
| #79 | Duplicate available hours | ✅ Closed |
| #80 | Legend swatch size | ✅ Closed |
| #81 | Favicon 404 | ✅ Closed |
| #101 | User Management invited/deactivated | ✅ Closed |
| B1 | RBAC guards on /api/supply and /api/employees | ✅ Fixed |
| B2 | Heatmap end date dynamic | ✅ Fixed |
| B7 | Temp password field masked | ✅ Fixed |
| B-isBillable | isBillable passed correctly on save | ✅ Fixed |
| #112 | Replace alert() with showToast() | ✅ Closed |
| #107 | try/catch on changeUserRole/deactivateUser/reactivateUser | ✅ Closed |
| #113 | Success toast after reactivateUser + full toast variant system | ✅ Closed |
| Audit | Remove dead routes /api/demand + /api/manage | ✅ Fixed |
| Audit | try/catch on resendInvite, cancelInvite, logout | ✅ Fixed |

---

## Build Order — Next Session

### Start here:
1. #105 — Role gating UAT — test all 4 roles end to end in browser
   - Need test accounts for: resource_manager, project_manager, executive
   - Create via Settings → Invite User with temp password, then set app_metadata via Supabase SQL if needed
   - Test matrix: tabs visible, edit access, API route protection
2. #109 — Fix isBillable defaulting to true for new assignments (server.js:590)
3. #104 — Settings tab styling inconsistencies
4. #110 — Wire header search bar
5. #111 — Wire date range selector on heatmap

### Soon:
* #114 — Deactivated section expand default logic
* #115 — Tooltip on disabled role select
* #108 — Bell badge hardcoded to 4
* #106 — Year-boundary week upsert bug

### Phase 2 (after v1 stable):
* #96 — Tenant onboarding flow (the unlock for Phase 2)
* #102 — Email verification
* #103 — Password strength policy
* #99 — Multi-role support
* #97 — Extended roles
* #98 — Finance and Ops Dashboard
* #95 — Light mode toggle
* #66 — Weekly snapshots
* #64 — Excel export/import
* D1 — Session role staleness
* #100 — User Management enhancements
* #116 — Document RBAC matrix

---

## Key Technical Decisions

* No Edit Mode toggle — _hmCanEdit() is the single gating function. Never add editMode back.
* Pending changes variable name: _pendingStaffing (not pendingChanges)
* Total row cells: data-cell-type="emp-total" — never editable
* Capacity threshold: 45h/week
* Hours/Week input max: 100
* Heatmap end date: today + 90 days, rounded to next Saturday
* Bench tint horizon: only within 8 weeks of today (today + 56 days). Beyond that, 0h cells are neutral dark (#161820)
* All read endpoints use serviceClient — NOT user JWT. Do not revert.
* SSE: named events (event: data-updated). If SSE fires while _pendingStaffing.size > 0, show toast only — do NOT re-render heatmap.
* Toast system: showToast(msg, type='default', durationMs=8000). CSS class-based variants. No inline styles.
* isBillable on save: pulled from existing supply row via row?.isBillable ?? true. New assignments default to true — known gap (#109).
* Invited user detection: last_sign_in_at === null AND not banned
* Cancel invite: deleteUser — only on unconfirmed accounts
* Resend invite: inviteUserByEmail — requires custom SMTP in Supabase for prod
* trust proxy: app.set('trust proxy', 1) — required for Railway
* Session: express-session, httpOnly, secure in prod, 8-hour maxAge, MemoryStore
* ExcelJS: fully removed
* Ban duration: '87600h'. Reactivate sets ban_duration: 'none'
* Password complexity: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/
* VALID_ROLES: ['admin', 'resource_manager', 'project_manager', 'executive']
* app.js cache buster: currently v=13 — increment on every deploy with frontend changes
* Reactivate button uses inline onclick (not event delegation) — consistent with rest of app

---

## Railway Deploy Checklist

- [ ] Verify latest commit is deployed (check Railway dashboard)
- [ ] Hard refresh with Ctrl+Shift+R after deploy
- [ ] Increment app.js?v= cache buster in index.html on every frontend change
- [ ] Log out and back in after any JWT hook changes
- [ ] Set all 7 env vars in Railway dashboard
- [ ] Verify: Railway URL → redirects to login.html
- [ ] Verify: login → all tabs load with data
- [ ] Verify: click a heatmap cell → input appears immediately
- [ ] Verify: make a heatmap edit → Save All → hard refresh → change persists
- [ ] Verify: logout → redirects to login.html
- [ ] Note: Resend Invite requires custom SMTP in Supabase Auth dashboard

---

## CC Workflow Reminder

cd staffing-app
taskkill /F /IM node.exe   # Terminal 2 only
claude                      # Terminal 1 — start Claude Code
node server.js              # Terminal 2 — restart server after changes

Commit and push:
git add -A
git commit -m "feat: <issue title> (#XX)"
git push origin main

Railway auto-deploys from GitHub on every push to main. Allow 1-3 min for build.

---

## New Chat Starter Prompt

Paste this into a new Claude chat to resume:

You are my expert technical co-pilot helping me build Staffing Intelligence — a real-time staffing management platform for my NetSuite consulting practice at Deloitte, live at https://staffing-app-production.up.railway.app.

Rules:
- Always give me CC (Claude Code) prompts for everything — never ask me to open VS Code, run terminal commands manually, or edit files myself
- Use issue numbers to track work (#112, #107 etc)
- Never close an issue without browser verification or confirmed output
- Commit after every completed issue
- Be direct and push back when something is wrong
- The heatmap has NO Edit Mode button — cells are always editable for admin/resource_manager (Airtable/Float model). Do not add an Edit Mode toggle back under any circumstances.
- app.js cache buster must be incremented (v=13, v=14 etc) on every deploy with frontend changes — hard refresh with Ctrl+Shift+R after deploy

Read HANDOFF_3.md in the repo root and give me a 5-bullet summary of current state, then confirm the first issue to tackle.

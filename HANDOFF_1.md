Staffing Intelligence App — Chat Handoff Document
Last updated: Session complete — #77 inline editing + heatmap redesign, #79 #80 #81 closed, #101 User Management invited/deactivated, B1/B2/B7 bugs fixed, #106-#116 GitHub issues created

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

```
ANTHROPIC_API_KEY=your-key
PORT=3000
SUPABASE_URL=https://pybmpknumxshailjatok.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
SUPABASE_ANON_KEY=your-anon-key
SESSION_SECRET=your-random-32-byte-hex
TENANT_ID=9762ee19-e1d1-48db-bc57-e96bee9ce2f8
```

Railway dashboard needs these 7 variables (PORT is injected automatically by Railway — do not set it):
- ANTHROPIC_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- SUPABASE_ANON_KEY
- SESSION_SECRET (generate a NEW one for prod — do not reuse local)
- TENANT_ID
- NODE_ENV=production

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
| admin | Full access + User Management |
| resource_manager | All tabs except Settings. Edit Mode available |
| project_manager | Overview, Needs (own projects), Ask Claude. No Edit Mode |
| executive | Overview + Ask Claude only. Read-only |

Tab visibility matrix:
| Tab | admin | resource_manager | project_manager | executive |
|---|---|---|---|---|
| Overview | ✅ | ✅ | ✅ | ✅ |
| Staffing | ✅ | ✅ | ❌ | ❌ |
| Needs | ✅ | ✅ | ✅ | ❌ |
| Ask Claude | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ❌ | ❌ | ❌ |
| Edit Mode button | ✅ | ✅ | ❌ | ❌ |

API route protection:
| Route | Roles allowed |
|---|---|
| GET /api/demand | admin, resource_manager, project_manager |
| GET /api/dashboard | admin, resource_manager, project_manager |
| GET /api/heatmap | admin, resource_manager, project_manager |
| GET /api/recommendations | admin, resource_manager, project_manager |
| GET /api/manage | admin, resource_manager |
| POST /api/save-staffing | admin, resource_manager |
| POST /api/supply/update | admin, resource_manager |
| GET /api/admin/users | admin |
| POST /api/admin/users/invite | admin |
| PATCH /api/admin/users/:id/role | admin |
| PATCH /api/admin/users/:id/deactivate | admin |
| PATCH /api/admin/users/:id/reactivate | admin |

---

## User Management (#63 — complete)

Admin-only panel under Settings tab.

Features:
* List all users in tenant — Name, Email, Role, Status, Last Login, Date Added
* Invite user — email invite (Supabase magic link) or temp password with complexity enforcement
* Change role — dropdown per row, PATCH /api/admin/users/:id/role
* Deactivate — sets ban_duration: '87600h'. Row dims to opacity 0.6
* Reactivate — sets ban_duration: 'none'

Password complexity rules (client + server enforced):
* Min 12 characters
* At least 1 uppercase, 1 lowercase, 1 number, 1 special character

Role pill colors: admin=purple(#C9B8FF), resource_manager=blue(#A8C7FA), project_manager=mint(#A8E6CF), executive=yellow(#FFF3A3)

---

## RLS Architecture (tightened this session)

All 9 tenant tables have explicit WITH CHECK clause:
(auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id

tenants table: RLS enabled + deny-all policy (serviceClient only)

| Table | RLS | Policy |
|---|---|---|
| clients | ✅ | tenant_isolation (USING + WITH CHECK) |
| consultant_skill_sets | ✅ | tenant_isolation (USING + WITH CHECK) |
| consultants | ✅ | tenant_isolation (USING + WITH CHECK) |
| levels | ✅ | tenant_isolation (USING + WITH CHECK) |
| need_skill_sets | ✅ | tenant_isolation (USING + WITH CHECK) |
| needs | ✅ | tenant_isolation (USING + WITH CHECK) |
| projects | ✅ | tenant_isolation (USING + WITH CHECK) |
| resource_assignments | ✅ | tenant_isolation (USING + WITH CHECK) |
| skill_sets | ✅ | tenant_isolation (USING + WITH CHECK) |
| tenants | ✅ | deny-all (server/serviceClient only) |

---

## Supabase Schema (10 tables)

| Table | Purpose |
|---|---|
| tenants | Master firm registry (unrestricted — server-managed) |
| levels | Consultant levels with rates + utilization targets |
| skill_sets | Skills typed as Practice Area or Technology |
| clients | Client registry |
| projects | Project definitions with status + pipeline probability |
| consultants | Consultant roster with location + rate overrides |
| consultant_skill_sets | Junction: consultants ↔ skill_sets (many-to-many) |
| resource_assignments | Weekly hours per consultant per project |
| needs | Staffing needs (open roles) |
| need_skill_sets | Junction: needs ↔ skill_sets (many-to-many) |

Key schema decisions:
* Levels: Analyst, Consultant, Senior Consultant, Manager, Senior Manager, Partner/Principal/Managing Director
* Skill types: Practice Area (Procure to Pay, Order to Cash, Record to Report, Supply Chain) + Technology (NetSuite, Ivalua, Emburse, Program Manager)
* Project status: Proposed / Verbal Commit / Sold
* Probability: auto-set by status trigger (25/75/100), overridable per project
* Needs coverage: unmet / partially_met / fully_met — computed at query time
* is_billable on resource_assignments: mandatory, no default
* Rates on levels (seeded): cost + bill rate. Overridable per consultant (null = use level default)
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

## Non-Billable Projects (flagged at import)

Unassigned, Assessment, Evaluation, ERP Evaluation, L2C Assessment, Secondment, Pre-Sales Support

---

## Data Model (confirmed)

* resource_assignments: one row per consultant per project per week_ending. 40 active rows. Capacity = 45h/week.
* needs: 8 unfilled project staffing needs. level + skill_sets + date range + hours/week. No names.
* Matching: consultant is a candidate if level matches AND has ANY of the need's required skill sets AND total booked hours ≤ (45 - demand hours needed) during the date range.
* Coverage status: Unmet / Partially Met / Fully Met — computed at query time.
* Pipeline status: Proposed / Verbal Commit / Sold — stored on projects table.

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
* Staffing: Always-on inline cell editing (Airtable/Float model) — row tints by utilization tier, horizon-aware bench red, current week column highlight, floating save bar
* Edit Mode: solid blue button top-right (admin + resource_manager only), Quick Fill bar, inline cell editing, Save/Cancel bar, amber conflict banner
* Needs: donut chart + expandable rows with AI match panel. Shows pipeline status + coverage status
* Ask Claude: dynamic suggested questions, text input, markdown responses
* Settings: User Management — active/invited/deactivated status pills, resend/cancel invite actions, collapsible deactivated section (admin only)
* SSE auto-refresh: fires after successful DB writes (broadcastSSE), pushes data-updated event to all clients
* All saves write to Supabase — ExcelJS fully removed from app

---

## Issues Completed

| Issue | Title | Status |
|---|---|---|
| #29 | Supabase: schema setup | ✅ Closed |
| #30 | Supabase: Excel → import script | ✅ Closed |
| #31 | Supabase: swap backend data layer | ✅ Closed |
| #17 | Auto-refresh when data changes (SSE) | ✅ Closed |
| #67 | Refresh button relocate/remove | ✅ Closed |
| #77 | Merge Manage into Staffing: Hybrid Edit Mode | ✅ Closed |
| #84 | Terminology rename Supply/Demand → Resources/Projects | ✅ Closed |
| #87-#93 | Supabase Auth setup (parent #32) | ✅ Closed |
| #38 | Railway deploy | ✅ Closed |
| RLS | RLS tightening — WITH CHECK + tenants lockdown | ✅ Closed |
| #62 | RBAC role enforcement | ✅ Closed |
| #63 | User Management UI | ✅ Closed |
| #79 | Duplicate available hours | ✅ Closed — not reproduced, clean |
| #80 | Legend swatch size | ✅ Closed — replaced with bar swatches |
| #81 | Favicon 404 | ✅ Closed — favicon.svg added |
| #101 | User Management — Pending/Invited status + Deactivated section | ✅ Closed |
| B1 | RBAC guards added to /api/supply and /api/employees | ✅ Fixed |
| B2 | Heatmap end date dynamic (today + 90 days rolling) | ✅ Fixed |
| B7 | Temp password field masked (type=password + eye toggle) | ✅ Fixed |

---

## Build Order — Next Session

### Immediate (next session, in order):
1. #112 — Replace alert() with showToast() — 15 min, zero risk
2. #107 — Add try/catch to changeUserRole/deactivateUser/reactivateUser — 20 min
3. #109 — Fix isBillable defaulting to true for new assignments
4. #105 — Role gating UAT — test all 4 roles end to end
5. #96  — Tenant onboarding flow (new firm self-service signup)

### Soon (next 2-3 sessions):
- #102 — Email verification flow for invited users
- #103 — Password strength policy in Supabase
- #104 — Settings tab styling inconsistencies
- #110 — Wire header search bar
- #111 — Wire date range selector on heatmap
- #114 — Deactivated section expand default logic
- #115 — Tooltip on disabled role select

### Later (backlog):
- #99  — Multi-role support + role toggle UI
- #97  — Extended roles: consultant, finance, recruiter
- #98  — Finance and Ops Dashboard
- #100 — User Management access enhancements
- #66  — Weekly snapshots
- #64  — Excel export/import
- #106 — Year-boundary week upsert bug
- #108 — Bell badge hardcoded to 4
- #116 — Document RBAC matrix for extended roles

---

## Key Technical Decisions

* Capacity threshold = 45h/week
* Hours/Week input max = 100
* All read endpoints use serviceClient — NOT user JWT. Required after RLS tightening. Do not revert. Affected: /api/dashboard, /api/heatmap, /api/ask, /api/suggested-questions, /api/manage, /api/recommendations. Only /api/save-staffing and /api/supply/update intentionally use req.session.token (write operations).
* claudeService.js system prompt: scoped to NetSuite consulting practice — levels, practice areas (P2P, O2C, R2R, Supply Chain), technologies (NetSuite, Ivalua, Emburse), pipeline statuses. Always restart server after editing — prompt loaded at startup.
* Supabase write-back: upsertAssignment() uses native upsert with onConflict: 'consultant_id,project_id,week_ending'
* SSE: named events (event: data-updated) — NOT default 'message' event
* Utilization = full date range calculation, not single week
* Toast duration = 8000ms, click to dismiss
* Conflict banner: amber (#F59E0B)

* Multi-skill matching: any-match
* Primary skill set for display: first Practice Area in consultant's skill set list
* trust proxy: app.set('trust proxy', 1) — required for Railway + secure cookies
* Session: express-session, httpOnly, secure in prod, 8-hour maxAge, MemoryStore (wiped on restart by design)
* ExcelJS: fully removed
* Ban duration for deactivated users: '87600h' (~10 years). Reactivate sets ban_duration: 'none'
* Password complexity regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/
* VALID_ROLES: ['admin', 'resource_manager', 'project_manager', 'executive']
* Invited user detection: last_sign_in_at === null and not banned → status: 'invited'
* Cancel invite: calls deleteUser on unconfirmed accounts only
* Resend invite: calls inviteUserByEmail — requires custom SMTP in Supabase for prod (Resend/SendGrid recommended)
* Heatmap end date: today + 90 days, rounded to next Saturday (dynamic, not hardcoded)
* RBAC: /api/supply and /api/employees now guarded with requireRole(['admin','resource_manager','project_manager'])

---

## Railway Deploy Checklist

- [ ] Verify latest commit is deployed (check Railway dashboard)
- [ ] Log out and back in on Railway after any JWT hook changes — sessions with stale tokens won't have role
- [ ] Set all 7 env vars in Railway dashboard
- [ ] Generate a NEW SESSION_SECRET for prod
- [ ] Verify: Railway URL → redirects to login.html
- [ ] Verify: login → all tabs load with data
- [ ] Verify: make a heatmap edit → save → hard refresh → change persists
- [ ] Verify: logout → redirects to login.html

---

## CC Workflow Reminder

```
cd staffing-app
taskkill /F /IM node.exe   # Terminal 2 only, never in CC terminal
claude                      # Terminal 1 — start Claude Code
node server.js              # Terminal 2 — restart server after changes
```

Commit and push:
```
git add -A
git commit -m "feat: <issue title> (#XX)"
git push origin main
```

Railway auto-deploys from GitHub on every push to main. Allow 1-3 min for build.

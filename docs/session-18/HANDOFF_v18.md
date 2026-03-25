Staffing Intelligence App — Session 18 Handoff
Last updated: Session 18 complete

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
| executive | Overview, Staffing (read-only), Ask Claude. No edit access |

Tab visibility matrix:
| Tab | admin | resource_manager | project_manager | executive |
|---|---|---|---|---|
| Overview | ✅ | ✅ | ✅ | ✅ |
| Staffing | ✅ | ✅ | ❌ | ✅ (read-only) |
| Needs | ✅ | ✅ | ✅ | ❌ |
| Ask Claude | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ❌ | ❌ | ❌ |

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
| Analyst | $45 | $125 | 80% |
| Consultant | $65 | $175 | 80% |
| Senior Consultant | $85 | $225 | 75% |
| Manager | $110 | $275 | 70% |
| Senior Manager | $140 | $325 | 60% |
| PPMD | $175 | $400 | 50% |

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
* Staffing: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling, hybrid edit mode
* Edit Mode: solid blue button top-right (admin + resource_manager only), Quick Fill bar, inline cell editing, Save/Cancel bar, amber conflict banner
* Needs: donut chart (partially_met + unmet only — fully_met removed) + expandable rows with AI match panel. Shows pipeline status + coverage status
* Ask Claude: dynamic suggested questions, text input, markdown responses
* Settings: User Management UI — invite users, change roles, deactivate/reactivate (admin only)
* SSE auto-refresh: fires after successful DB writes (broadcastSSE), pushes data-updated event to all clients
* All saves write to Supabase — ExcelJS fully removed from app

---

## Drilldown Inventory (#61 — complete, Session 15)

All drilldowns audited and fixed. Current state:

| Drilldown | Status | Notes |
|---|---|---|
| Utilization KPI card | ✅ | drillUtilizationKPI() |
| Available Capacity KPI card | ✅ | drillHeadcount() |
| Pipeline Coverage KPI card | ✅ | drillDemandKPI() + nested drillCoverage() |
| On Bench KPI card | ✅ | drillBenchKPI() |
| Utilization by Level — click row | ✅ | drillUtilization(level) |
| Top Projects — click row | ✅ | navigateToProject() — switches to Staffing, expands + scrolls |
| Rolling Off Soon — click employee | ✅ | drillHeatmapEmployee(name) |
| Needs Attention — click item | ✅ | drillCoverage(roleIdx) — added Session 15 |
| Heatmap total cell (non-edit) | ✅ | drillHeatmapCell() |
| Heatmap employee ℹ icon | ✅ | drillHeatmapEmployee() |
| Heatmap week header | ✅ | drillHeatmapWeek() |
| Expanded sub-row ℹ icon | ✅ | drillHeatmapEmployee() — added Session 15 |
| Needs table row | ✅ | toggleNeedExpansion() + AI recommendations |
| Donut segment click | ✅ | drillNeedsByStatus() — added Session 15, fully_met removed |
| Suggested question chips | ✅ | setQuestion() |

Visual enhancement deferred: Top Projects → heatmap navigation could filter to only matching consultants. Logged for holistic UI/UX pass.

---

## Cache Busters

| File | Current version |
|---|---|
| app.js | v=52 |
| styles.css | v=39 |
| index.html | v=50 |

---

## GitHub Milestones

| Milestone | Remaining issues |
|---|---|
| Active Sprint | — (cleared Session 13) |
| Soon | — (cleared Session 18) |
| V1 Stable | #123, #82, #83, #102, #103, #100, #116, #133, #134, #135 |
| Phase 2 | #129, #96, #99, #98, #97, #95, #131, #132, #64, #43, #117, #118, #94 |

---

## Issues Completed

| Issue | Title | Session |
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
| #120 | Wire search input — global typeahead navigator | 14 |
| #121 | Week selector — closed, superseded by #129 | 14 |
| #104 | Settings tab styling inconsistencies | 14 |
| #114 | Deactivated section expand default logic | 14 |
| #115 | Tooltip on disabled role select | 14 |
| #128 | Total row expand + focus first cell | closed prior to Session 15 |
| #61 | Comprehensive drilldown review + all fixes | 15 |
| #124 | Add new project assignment to consultant from heatmap | 16 |
| #119 | Consultant profile editor — skill sets, level, details | 18 |
| #126 | Consultants management panel in Settings tab | 18 |

---

## Build Order — Next Session

V1 Stable (start here):
1. **#123** — Session role staleness — stale JWT after role change (security, high priority)
2. **#82** — UAT completion — write formal test script before real users onboard
3. **#83** — Remove test toast button (chore)
4. **#102** — Email verification flow for invited users (auth)
5. **#103** — Password strength enforcement for temp password (auth)
6. **#100** — User Management access enhancements
7. **#116** — Document tab access matrix in HANDOFF (chore)
8. **#133** — V1 Stable issue
9. **#134** — V1 Stable issue
10. **#135** — V1 Stable issue

---

## Backlog (in priority order)

| Issue | Title | Notes |
|---|---|---|
| #77 follow-up | Edit Mode UX — auto-enter on cell click | Standalone |
| #96 | Tenant signup/onboarding flow | Depends on #62/#63 |
| #105 | Role gating validation — all non-admin roles | Needs test users |
| #101 | User Management — Pending status + deactivated section | Pending = invited not yet logged in |
| #102 | Email verification flow for invited users | Enforce magic link confirm |
| #103 | Password strength — Supabase policy | Enable in Auth dashboard |
| #99 | Multi-role support + role toggle UI | Depends on #63 stable |
| #97 | Extended Roles — consultant, finance, recruiter | Depends on #62/#63 |
| #98 | Finance and Ops Dashboard | Depends on #97 |
| #100 | User Management — access enhancements | Invited by, 2FA columns |
| #66 | Weekly snapshots | Standalone |
| #64 | Excel export/import | Tenant onboarding |
| #79 | Remove duplicate available hours | Minor |
| #80 | Increase legend swatch size | Minor |
| #81 | Fix favicon 404 | Minor |
| #95 | Light mode toggle | Low priority |

---

## Key Technical Decisions

* Capacity threshold = 45h/week
* Hours/Week input max = 100
* /api/dashboard and /api/heatmap use serviceClient — NOT user JWT. Required after RLS tightening. Do not revert.
* Supabase write-back: upsertAssignment() uses native upsert with onConflict: 'consultant_id,project_id,week_ending'
* SSE: named events (event: data-updated) — NOT default 'message' event
* Utilization = full date range calculation, not single week
* Toast duration = 8000ms, click to dismiss
* Conflict banner: amber (#F59E0B)
* claudeService.js system prompt: always restart server after editing — prompt is loaded at startup
* Multi-skill matching: any-match
* Primary skill set for display: first Practice Area in consultant's skill set list
* trust proxy: app.set('trust proxy', 1) — required for Railway + secure cookies
* Session: express-session, httpOnly, secure in prod, 8-hour maxAge, MemoryStore (wiped on restart by design)
* ExcelJS: fully removed
* Ban duration for deactivated users: '87600h' (~10 years). Reactivate sets ban_duration: 'none'
* Password complexity regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/
* VALID_ROLES: ['admin', 'resource_manager', 'project_manager', 'executive']
* Global search: typeahead navigator pattern (not heatmap filter) — consistent with Float/Runn. Selects employee → Staffing tab, scrolls+highlights row. Selects project → expands all consultants on that project, scrolls to first. / and Ctrl+K focus the input from anywhere.
* Week selector removed Session 14 — code commented out in app.js. To be rebuilt as historical snapshots feature (#129, Phase 2).
* Row flash on search: amber border-left + box-shadow on name cell. Subtle against dark theme — polish deferred to holistic UI/UX pass.
* Needs donut: shows partially_met + unmet only. fully_met segment removed — not actionable in Needs Attention context.
* drillNeedsByStatus(): filters rawData.coverageRoles by status, opens modal with project/level/skill/dates/badge. Each row clickable → drillCoverage(). statusMap: ['partially_met', 'unmet'].
* Needs Attention items: onclick fires drillCoverage(roleIdx) — roleIdx looked up from rawData.coverageRoles by matching project+level+skillSet.
* Sub-row ℹ icon: appears on hover, fires drillHeatmapEmployee(empName), stopPropagation prevents row expand/edit.
* Top Projects rows: onclick fires navigateToProject(projName) — switches to Staffing tab, expands matching consultants, scrolls to first, amber flash. Project filter heatmap view deferred to holistic UI/UX pass.

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

## UAT Testing Pattern

All browser testing in this project uses an **interactive UAT widget** rendered inline in the Claude chat. This is the standard pattern for every feature verification — do not use plain bullet point checklists.

### How it works
- Claude renders a clickable test checklist as an interactive widget in chat
- Each test row has three buttons: **pass**, **fail**, **note**
- Clicking a button highlights the entire row and the selected button in the corresponding color (green/red/amber)
- Selecting **fail** or **note** reveals a text field for additional detail
- A summary bar tracks pass/fail/note/pending counts in real time
- A **"send results to Claude"** button packages all results and notes and sends them as a single message for Claude to triage

### How to trigger it
When you want to run UAT, say:
> "give me tests to verify X" or "can you give me a UAT checklist for X"

Claude will render the interactive widget automatically. No bullet points, no manual typing of results.

### Widget structure per test row
- Test description (what to check in the browser)
- pass / fail / note buttons
- Optional notes textarea (appears on fail or note)
- Row + button highlights on selection

### Notes
- The widget is session-only — it does not persist between chats
- Always run UAT before committing and closing an issue
- If a test fails, fix in CC before closing — do not close issues with open failures
- "note" is for observations that are not blockers (minor polish, future improvements) — log these as GitHub issues if worth tracking

---

## CC Workflow Reminder

```
cd staffing-app
taskkill /F /IM node.exe   # Terminal 2 only, never in CC terminal (Windows/Git Bash workaround — pkill node does not work in Git Bash)
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

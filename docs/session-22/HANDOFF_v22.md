# Staffing Intelligence App — Session 22 Handoff
Last updated: Session 22 complete

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
* Auth guard: apiFetch() wrapper in app.js — any 401 response redirects immediately to /login.html
* Background session poll: setInterval every 30s calls /api/auth/me — auto-redirects if session invalidated
* Tab switch guard: every tab switch calls /api/auth/me before rendering — catches invalidated sessions
* Startup cache warms using serviceClient (bypasses RLS) — logs "40 supply rows, 8 demand rows" on boot
* app.set('trust proxy', 1) — required for Railway reverse proxy + secure cookies in prod
* /api/dashboard and /api/heatmap use serviceClient (not user JWT) — required after RLS tightening

### Session Invalidation (#123 — complete)

* userSessionMap: Map() at module scope in server.js — tracks userId → Set of sessionIds
* Login: registers userId → sessionId in map (supports multiple concurrent sessions per user)
* Logout: removes sessionId from map, cleans up empty entries
* PATCH /api/admin/users/:id/role — after Supabase update, destroys all target user sessions via map. Skips if targetId === admin's own ID.
* PATCH /api/admin/users/:id/deactivate — same session destruction loop
* Frontend: apiFetch() wrapper replaces all fetch() calls in app.js. On 401 → window.location.href = '/login.html', returns never-resolving promise so no local error handler fires.
* Result: role change or deactivation takes effect within 30 seconds without any action by the affected user.

---

## RBAC (#62 — complete, updated Session 19)

4 active roles. Role stored in app_metadata.role in Supabase, stamped into JWT via custom_access_token_hook, stored in session at login, exposed on /api/auth/me.

| Role | Access |
|---|---|
| admin | Full access + User Management + Consultants panel |
| resource_manager | All tabs including Settings (Consultants panel only). Edit Mode available |
| project_manager | Overview, Open Needs (own projects), Ask Claude. No Edit Mode |
| executive | Overview, Resource Allocation (read-only), Ask Claude. No edit access |

Tab visibility matrix:
| Tab | admin | resource_manager | project_manager | executive |
|---|---|---|---|---|
| Overview | ✅ | ✅ | ✅ | ✅ |
| Resource Allocation | ✅ | ✅ | ❌ | ✅ (read-only) |
| Open Needs | ✅ | ✅ | ✅ | ❌ |
| Ask Claude | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ (Consultants only) | ❌ | ❌ |

Note: resource_manager sees the Settings tab but only the Consultants panel — User Management is hidden.

API route protection:
| Route | Roles allowed |
|---|---|
| GET /api/supply | admin, resource_manager, project_manager |
| GET /api/dashboard | admin, resource_manager, project_manager, executive |
| GET /api/heatmap | admin, resource_manager, project_manager, executive |
| GET /api/recommendations | admin, resource_manager, project_manager |
| GET /api/employees | admin, resource_manager |
| POST /api/save-staffing | admin, resource_manager |
| POST /api/supply/update | admin, resource_manager |
| GET /api/projects | admin, resource_manager |
| GET /api/consultants | admin, resource_manager |
| GET /api/consultants/:id | admin, resource_manager, project_manager, executive |
| PATCH /api/consultants/:id | admin, resource_manager |
| PUT /api/consultants/:id/skills | admin, resource_manager |
| PATCH /api/consultants/:id/deactivate | admin, resource_manager |
| PATCH /api/consultants/:id/reactivate | admin, resource_manager |
| GET /api/admin/users | admin |
| POST /api/admin/users/invite | admin |
| PATCH /api/admin/users/:id/role | admin |
| PATCH /api/admin/users/:id/deactivate | admin |
| PATCH /api/admin/users/:id/reactivate | admin |
| POST /api/admin/users/:id/resend-invite | admin |
| DELETE /api/admin/users/:id/invite | admin |

VALID_ROLES: ['admin', 'resource_manager', 'project_manager', 'executive', 'consultant', 'finance', 'recruiter']
Note: consultant, finance, recruiter are placeholders for #97 (V3) — no active permissions yet.

---

## User Management (#63 — complete, updated Session 19)

Admin-only panel under Settings tab.

Features:
* List all users in tenant — Name, Email, Role, Status, Last Login, Date Added
* Invite user — temp password only (magic link removed Session 19). SSO/SAML placeholder comment in server.js for V3.
* Change role — dropdown per row, PATCH /api/admin/users/:id/role. Invalidates target's active sessions immediately.
* Deactivate — sets ban_duration: '87600h'. Row dims to opacity 0.6. Invalidates target's active sessions immediately.
* Reactivate — sets ban_duration: 'none'

Status pill logic:
* Pending (amber) — email_confirmed_at is null (unverified invite)
* Active (green) — email_confirmed_at is set, not banned
* Inactive (gray) — banned/deactivated

Password complexity rules (client + server enforced):
* Min 12 characters
* At least 1 uppercase, 1 lowercase, 1 number, 1 special character
* Live checklist in invite modal — rules show ✓ green / ✕ red as admin types
* Create User button disabled until all 5 rules pass
* Server returns specific failing rules on 400 (not generic message)

Invite flow:
* Temp password only — email_confirm: true bypasses Supabase verification
* Magic link path removed — SSO placeholder left in server.js for V3
* Login gate: email_confirmed_at null check at /api/auth/login — returns 401 with clear message

Role pill colors: admin=purple(#C9B8FF), resource_manager=blue(#A8C7FA), project_manager=mint(#A8E6CF), executive=yellow(#FFF3A3)

---

## RLS Architecture

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
* Amber CSS variable: #F59E0B (added Session 20)
* Inter font, white primary, #8892B0 secondary
* Left sidebar: 220px, collapsible to 56px

---

## Current App State

* Login page at /login.html — dark theme, email/password, inline error handling
* Auth guard on app load — redirects to login.html if no session. apiFetch() wrapper handles mid-session 401s.
* Background session poll every 30s — auto-redirects on session invalidation
* Logout button at bottom of left sidebar
* 5 tabs: Overview, Resource Allocation, Open Needs, Ask Claude, Settings (admin + resource_manager)
* Overview: KPI cards (reordered — Available Capacity % is primary), utilization chart renamed to "Upcoming Availability" (inverted metric — shows unbooked hours), Overallocated Resources panel with heatmap navigation drilldown, top projects, rolling off soon
* KPI calculations: Utilization = all booked hours / total available hours (hours-based). Available Capacity % = unbooked hours / total available hours.
* KPI drilldown modals: all consultant lists grouped by level with expandable sections
* Rolling Off Soon: clicking a consultant opens drillRollingOff modal (focused view with Change Assignment CTA, hm-row-flash-amber on navigate)
* Overallocated Resources: clicking an item calls _overallocatedNavigate(name) → navigateToEmployee(name) pattern (same as _rollingOffNavigate)
* Resource Allocation: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling, hybrid edit mode. 4-tier color scheme: Red 0–10h / Yellow 11–44h / Green 45h / Orange 46h+.
* Edit Mode: solid blue button top-right (admin + resource_manager only), Quick Fill bar, inline cell editing, Save/Cancel bar, amber conflict banner
* Open Needs: donut chart (partially_met + unmet only) + expandable rows with AI match panel
* Ask Claude: dynamic suggested questions, text input, markdown responses
* Settings — admin: User Management + Consultants panel
* Settings — resource_manager: Consultants panel only (User Management hidden)
* SSE auto-refresh: fires after successful DB writes
* All saves write to Supabase — ExcelJS fully removed
* AI match acceptance: acceptMatch() is async — writes to Supabase via saveAllAssignments() before updating UI status

---

## Consultant Profile Editor (#119 — complete)

* Edit modal: name, level, location (custom typeahead — see below), bill rate override, cost rate override, skill sets
* Location field: custom JS typeahead with CP_CITIES array (top 50 US cities). Arrow key navigation, Enter/click to select, free text fallback for non-US. No external library.
* Skill set pills: toggleable, colored by type (Practice Area vs Technology)
* After save: panel reloads, edited row scrolls into view and flashes amber (#134)
* Deactivate/reactivate from modal — same scroll+flash after reload

## Consultants Management Panel (#126 — complete)

* Settings tab → Consultants section
* Table: Name, Level, Skill Set, Location, Status, Actions (Edit, Deactivate/Reactivate)
* Active and inactive sections
* Admin + resource_manager access

---

## Drilldown Inventory (#61 — complete, updated Session 22)

All drilldowns audited and fixed. Current state:

| Drilldown | Status | Notes |
|---|---|---|
| Utilization KPI card | ✅ | drillUtilizationKPI() — hours-based |
| Available Capacity KPI card | ✅ | drillHeadcount() — hours-based % |
| Pipeline Coverage KPI card | ✅ | drillDemandKPI() + nested drillCoverage() |
| On Bench KPI card | ✅ | drillBenchKPI() |
| Upcoming Availability chart — click row | ✅ | drillUtilization(level) — inverted metric |
| Top Projects — click row | ✅ | navigateToProject() |
| Rolling Off Soon — click employee | ✅ | drillRollingOff() — focused modal with Change Assignment CTA |
| Overallocated Resources — click item | ✅ | _overallocatedNavigate(name) → navigateToEmployee(name) |
| Heatmap total cell (non-edit) | ✅ | drillHeatmapCell() |
| Heatmap employee ℹ icon | ✅ | drillHeatmapEmployee() |
| Heatmap week header | ✅ | drillHeatmapWeek() |
| Expanded sub-row ℹ icon | ✅ | drillHeatmapEmployee() |
| Needs table row | ✅ | toggleNeedExpansion() + AI recommendations |
| Donut segment click | ✅ | drillNeedsByStatus() |
| Suggested question chips | ✅ | setQuestion() |

---

## Cache Busters

| File | Current version |
|---|---|
| app.js | v=75 |
| styles.css | v=39 |

Note: bump these when making frontend changes to bust browser cache.

---

## GitHub Milestones

| Milestone | Status | Remaining issues |
|---|---|---|
| Active Sprint | ✅ Cleared (Session 13) | — |
| Soon | ✅ Cleared (Session 18) | — |
| V1 Stable | ✅ Cleared (Session 19), tagged v1-stable (Session 20) | — |
| Phase 2 | In progress | 21 open — core quality + UX |
| V3 | Backlog | 13 open — tenant onboarding, Finance dashboard, integrations, extended roles |

Phase 2 issues (21): #161, #160, #155, #157, #159, #158, #146, #147, #148, #152, #153, #156, #154, #129, #144, #145, #137, #138, #139, #140, #141 (and other carry-overs)

V3 issues (13): #96, #98, #99, #97, #133, #117, #118, #43, #94, #95, #64, #131, #136

---

## Issues Completed This Session (Session 22)

| Issue | Title | Notes |
|---|---|---|
| #142 | Rename "Needs Attention" → "Overallocated Resources" + drilldown | _overallocatedNavigate uses navigateToEmployee(name) pattern. Heatmap navigation with hm-row-flash-amber. |
| #150 | AI suggestion acceptance persists to DB | acceptMatch() is async — saveAllAssignments() called before UI status update. Three RLS root causes fixed: resolveConsultantId, resolveProjectId, upsertAssignment, deleteAssignments all moved to serviceClient. |
| #151 | Apostrophe in consultant name breaks Settings panel edit button | data-cid pattern applied to Settings consultants panel edit buttons. |

---

## New Issues Logged This Session (Session 22)

| Issue | Title | Label |
|---|---|---|
| #155 | Rolling Off Soon panel — cap at 4 rows + View all (N) link | enhancement |
| #156 | Open Needs — filter/hide Fully Met rows by default, with toggle | enhancement |
| #157 | AI acceptance 0h overwrite bug | bug |
| #158 | Recommendations engine misses valid consultant matches | bug |
| #159 | Consultant skill sets not consistently resolved at load time in supabaseReader.js | bug |
| #160 | KPI drilldown modals — Available Capacity, Utilization %, On Bench should open expanded | enhancement |
| #161 | Rolling Off Soon KPI — apostrophe in consultant name breaks modal click | bug |
| #132 | Holistic UI/UX design pass | closed — superseded by #154 |

---

## Key Technical Decisions

* Capacity threshold = 45h/week
* Hours/Week input max = 100
* /api/dashboard and /api/heatmap use serviceClient — NOT user JWT. Required after RLS tightening. Do not revert.
* Supabase write-back: upsertAssignment() uses native upsert with onConflict: 'consultant_id,project_id,week_ending'
* **resolveConsultantId, resolveProjectId, upsertAssignment, deleteAssignments all use serviceClient — not user JWT. RLS blocks user JWT on all write-path functions. Never revert.**
* SSE: named events (event: data-updated) — NOT default 'message' event
* Toast duration = 8000ms, click to dismiss
* Conflict banner: amber (#F59E0B)
* claudeService.js system prompt: always restart server after editing — prompt is loaded at startup
* Multi-skill matching: any-match
* Primary skill set for display: first Practice Area in consultant's skill set list
* trust proxy: app.set('trust proxy', 1) — required for Railway + secure cookies
* Session: express-session, httpOnly, secure in prod, 8-hour maxAge, MemoryStore (wiped on restart by design)
* userSessionMap lifetime = process lifetime (same as MemoryStore — consistent by design)
* apiFetch() wrapper: replaces all fetch() in app.js. On 401 → redirect to /login.html, returns never-resolving promise
* Background session poll: setInterval 30000ms, calls /api/auth/me, .catch(() => {}) silences network errors
* ExcelJS: fully removed
* Ban duration for deactivated users: '87600h' (~10 years). Reactivate sets ban_duration: 'none'
* Password complexity regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/
* VALID_ROLES: ['admin', 'resource_manager', 'project_manager', 'executive', 'consultant', 'finance', 'recruiter']
* Global search: typeahead navigator pattern — / and Ctrl+K focus input. Selects employee → Resource Allocation tab. Selects project → expands all consultants on that project.
* Week selector removed Session 14 — to be rebuilt as historical snapshots (#129, Phase 2)
* Location typeahead: custom JS (no library), CP_CITIES array in app.js, mousedown + 150ms blur delay pattern
* Invite flow: temp password only. Magic link removed Session 19. SSO placeholder comment in server.js.
* email_confirmed_at login gate: null check at /api/auth/login — returns 401 before session created
* Status logic: pending = !email_confirmed_at, active = email_confirmed_at set + not banned, inactive = banned
* Heatmap color scheme: 4-tier availability-first — 0–10h Red, 11–44h Yellow, 45h Green, 46h+ Orange. Classes: hm-bench, hm-partial, hm-utilized, hm-over.
* claudeService.js formatContext: inWindow() filter — only resource_assignments where week_ending falls in current rolling 90-day window. Current week hours used for availability, not rolling average.
* data-cid pattern: all consultant name references in DOM selectors replaced with data-cid attributes. **Applies to ALL panels: heatmap cell handlers, Settings panel edit buttons, Rolling Off Soon click handlers, and all drilldown modals. Never pass consultant names as inline JS string literals.**
* v1-stable tag: created and pushed after Session 20 UAT. Permanent revert point for V1.
* Utilization KPI (#154): hours-based — sum of all booked hours across all consultants / sum of total available hours (45h × weeks × consultants). Overall Average in drilldown uses same formula.
* Rolling Off Soon drilldown (#141): drillRollingOff() opens focused modal per consultant. _rollingOffNavigate() navigates to heatmap row with hm-row-flash-amber CSS animation. Modal includes Change Assignment CTA.
* **_overallocatedNavigate uses navigateToEmployee(name) pattern — same as _rollingOffNavigate. Do not use navigateTo('staffing') + manual virtual scroll positioning.**
* **parseDateStr normalizes 2-digit years: if yr < 100 → yr += 2000. Prevents date parsing failures on short year strings.**
* **acceptMatch() is async — writes to Supabase via saveAllAssignments() before updating UI status. Status should only update on confirmed DB write.**
* **Drilldown modals should open with groups expanded by default + Expand/Collapse All button above table rows, left-aligned. See #160 for remaining modals (Available Capacity, Utilization %, On Bench).**

---

## UAT Widget Guidance

The UAT widget is rendered inline in the Claude chat. Always follow these rules when building or modifying it:

* Always use CSS variables: `--pass: #1D9E75`, `--fail: #E24B4A`, `--note: #BA7517`, `--pass-bg: #E1F5EE`, `--fail-bg: #FCEBEB`, `--note-bg: #FAEEDA`
* Light background rows with `row-pass` / `row-fail` / `row-note` class toggling
* `saveNotes()` must be called before every `render()` call to persist textarea values
* No hardcoded dark backgrounds — widget must work in light and dark mode
* Send results button uses `sendPrompt()` to post results back to Claude

### How to trigger it
> "give me UAT tests for X" or "can you give me a UAT checklist for X"

### Widget structure per test row
- Test description
- pass / fail / note buttons with color highlighting
- Optional notes textarea (appears on fail or note)
- Summary bar: pass / fail / note / pending counts
- "Send results to Claude" button packages all results and sends as a single message

### Notes
- Always run UAT before committing and closing an issue
- If a test fails, fix in CC before closing
- "note" is for non-blocker observations — log as GitHub issues if worth tracking

---

## Pending Technical Debt

* **SB-3 — Console.log audit**: Scan server.js and app.js for leftover debug logs from closed issues. Not yet done.

---

## Decision Tracking Protocol (added Session 19)

When a decision is confirmed during a session, Claude will do one of two things — no silent confirmations:
1. **Act immediately** — provide the CC prompt or make the change right then
2. **Explicitly defer** — state "noted, I'll include this in the session handoff update" so nothing is lost

This applies to: issue milestone moves, roadmap updates, architectural decisions, any confirmed change that isn't immediately acted on.

Confirmed decisions this session:
* resolveConsultantId, resolveProjectId, upsertAssignment, deleteAssignments must all use serviceClient — user JWT blocked by RLS on all write paths
* acceptMatch() must be async and confirm DB write before updating UI state
* _overallocatedNavigate uses navigateToEmployee(name) — not navigateTo('staffing') + scroll
* data-cid pattern extends to Rolling Off Soon and all drilldown panels (not just heatmap + Settings)
* #132 closed, superseded by #154 (Holistic UI/UX design pass)
* Phase 2 / V3 milestone restructure: 13 scale/integration issues moved to V3

---

## Railway Deploy Checklist

- [ ] Verify latest commit is deployed (check Railway dashboard)
- [ ] Log out and back in on Railway after any JWT hook changes
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
taskkill /F /IM node.exe   # Terminal 2 only
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

---

## Build Order — Next Session

P1 bugs first, then enhancements:
1. #161 — Rolling Off Soon apostrophe bug (data-cid pattern)
2. #160 — KPI drilldown modals expand/collapse (Available Capacity, Utilization %, On Bench)
3. #155 — Rolling Off Soon panel cap at 4 rows + View all (N) link
4. #157 — AI acceptance 0h overwrite bug
5. #159 — Consultant skill set schema consistency (supabaseReader.js audit)
6. #158 — Recommendations engine missing matches (Benjamin Liu)
7. #146 — Enter key behavior in heatmap edit
8. #147 — Search bar visual enhancement
9. #148 — Consultant name → profile modal
10. #152 — Skill set pill → consultants modal
11. #153 — Group panels by level/role
12. #156 — Open Needs filter for Fully Met rows
13. #154 — Holistic UI/UX design pass (Phase 2 scoped)
14. #129 — Historical snapshots

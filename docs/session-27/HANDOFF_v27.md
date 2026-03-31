# Staffing Intelligence App — Session 27 Handoff
Last updated: Session 27 complete

---

## What This App Is

Staffing Intelligence — a real-time staffing management platform for Varun's NetSuite consulting practice at Deloitte.

* Local web app at http://localhost:3000
* Node.js + Express backend, plain HTML/CSS/JS frontend
* Claude API (claude-sonnet-4-6) for AI features
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
* seed-synthetic-data.js — synthetic test data seed script (run once per fresh Supabase tenant)
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
| POST /api/projects | admin, resource_manager |
| GET /api/consultants | admin, resource_manager |
| GET /api/consultants/:id | admin, resource_manager, project_manager, executive |
| PATCH /api/consultants/:id | admin, resource_manager |
| PUT /api/consultants/:id/skills | admin, resource_manager |
| PATCH /api/consultants/:id/deactivate | admin, resource_manager |
| PATCH /api/consultants/:id/reactivate | admin, resource_manager |
| POST /api/needs | admin, resource_manager |
| PATCH /api/needs/:id | admin, resource_manager |
| POST /api/needs/:id/close | admin, resource_manager |
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

## User Management (#63 — complete, updated Sessions 19, 24)

Admin-only panel under Settings tab.

Features:
* List all users in tenant — Name, Email, Role, Status, Last Login, Date Added
* **Users grouped by role: admin → resource_manager → project_manager → executive (Session 24)**
* **Click user name to open inline edit modal (role change). Edit button removed. (Session 24)**
* Invite user — temp password only (magic link removed Session 19). SSO/SAML placeholder comment in server.js for V3.
* Change role — via openUserEditModal(uid). PATCH /api/admin/users/:id/role. Invalidates target's active sessions immediately.
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
| needs | Staffing needs (open roles) — closed_at TIMESTAMPTZ + closed_reason TEXT added Session 25 |
| need_skill_sets | Junction: needs ↔ skill_sets (many-to-many) |

Key schema decisions:
* Levels: Analyst, Consultant, Senior Consultant, Manager, Senior Manager, Partner/Principal/Managing Director
* Skill types: Practice Area (Procure to Pay, Order to Cash, Record to Report, Supply Chain) + Technology (NetSuite, Program Manager)
* Project status: Proposed / Verbal Commit / Sold
* Probability: auto-set by status trigger (25/75/100), overridable per project. DB column: `probability_pct`.
* Needs coverage: unmet / partially_met / fully_met — computed at query time
* Needs lifecycle: closed_at TIMESTAMPTZ (NULL = open), closed_reason TEXT ('met' | 'abandoned'). readStaffingData() filters .is('closed_at', null) — closed needs never appear in pipeline.
* is_billable on resource_assignments: mandatory, no default
* is_billable on projects: defaults to true in createProject()
* Rates on levels (seeded): cost + bill rate. Overridable per consultant (null = use level default)
* target_billable_pct on levels: Analyst/Consultant 80%, SC 75%, Manager 70%, SM 60%, PPMD 50%
* consultant_effective_rates view: resolves COALESCE(consultant override, level default)
* Tenant ID: 9762ee19-e1d1-48db-bc57-e96bee9ce2f8
* upsertAssignment uses native Supabase upsert with onConflict: 'consultant_id,project_id,week_ending'
* weekKeyToDate map in _meta: derives ISO dates from actual DB dates — no hardcoded year logic
* consultants table capacity column: `capacity_hours_per_week` (not `capacity`)

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

* resource_assignments: one row per consultant per project per week_ending. Capacity = 45h/week.
* needs: open role requirements (level, skills, date range, hours/week). Closed needs have closed_at set and are filtered from all queries. closed_reason: 'met' (auto-close) or 'abandoned' (manual).
* Matching: consultant is a candidate if level matches AND has ANY of the need's required skill sets (allSkillSets.includes()) AND has ≥ hoursNeeded capacity available in at least one week of the demand range.
* Coverage status: Unmet / Partially Met / Fully Met — computed at query time (fully_met only reaches this state transiently before auto-close fires).
* Pipeline status: Proposed / Verbal Commit / Sold — stored on projects table.

### Synthetic Test Data State (after Session 27 — seed-synthetic-data.js)

25 consultants (Abby Adams through Yara York + Xavier Xu), 10 projects + 2 non-billable internal, 8 open needs.

Skill set: Ivalua and Emburse removed from seed data. Synthetic skills: Procure to Pay, Order to Cash, Record to Report, Supply Chain (Practice Area) + NetSuite, Program Manager (Technology).

Need design rationale:
* **4 Truly Unmet**: no consultant has the required skill combination at that level
  - Delta SC: SM + [Supply Chain, Program Manager] — Sam/Tara have SC; Uma has PM — no overlap
  - Harbor: Manager + [Record to Report, Program Manager] — Olivia/Rosa have R2R; Quinn has PM
  - Falcon: Senior Consultant + [Program Manager] — no SC has PM
  - Acme Phase 2: Senior Manager + [Order to Cash, Program Manager] — no SM overlap
* **4 Partially Met**: matching consultant exists but capacity gap prevents full coverage
  - Echo O2C Analyst (45h): Abby Adams (40h available)
  - Cascade Finance Consultant (30h): Grace Garcia (10h available weeks 7-12 only)
  - Globe Inventory Consultant (45h): Henry Hall (20h available weeks 3+)
  - Bright P2P Analyst (45h): Brad Baker (40h available weeks 7+)

Assignment structure:
* Fully utilized: most senior staff 40-45h/wk on billable projects
* Partial utilization: Emma Evans 30h, Frank Fisher 20h, Leo Lopez 40h, Chad Chen 40h, Yara York 30h
* Bench: Brad Baker 5h/wk (pre-sales, weeks 7-12), Abby Adams 5h/wk (training, weeks 7-12), Xavier Xu 5h/wk (training all 12 weeks)
* Rolling off: Mia Martin (Globe Inventory, weeks 1-2 only), Noah Nguyen (Delta SC, weeks 1-2 only)
* Ramping up: Dana Davis (Harbor, weeks 5+), Ivy Ibrahim (Echo, weeks 7+)
* Multi-project split: Quinn Quinn (Globe 20h + Harbor 20h), Rosa Reed (Cascade 15h + Bright P2P Rollout 25h)

---

## Design System

* Dark theme: #0F1117 page bg, #1A1D27 cards
* Pastel palette: Blue #A8C7FA, Mint #A8E6CF, Coral #FFB3B3, Yellow #FFF3A3, Purple #C9B8FF
* Amber CSS variable: #F59E0B (added Session 20)
* Orange (overallocation): #F97316
* Inter font, white primary, #8892B0 secondary
* Left sidebar: 220px, collapsible to 56px

---

## Current App State

* Login page at /login.html — dark theme, email/password, inline error handling
* Auth guard on app load — redirects to login.html if no session. apiFetch() wrapper handles mid-session 401s.
* Background session poll every 30s — auto-redirects on session invalidation
* Logout button at bottom of left sidebar
* 5 tabs: Overview, Resource Allocation, Open Needs, Ask Claude, Settings (admin + resource_manager)
* Overview: KPI cards (reordered — Available Capacity % is primary), utilization chart renamed to "Upcoming Availability" (inverted metric — shows unbooked hours), Overallocated Resources panel with heatmap navigation drilldown, top projects, rolling off soon (capped at 4 + View all link)
* KPI calculations: Utilization = all booked hours / total available hours (hours-based). Available Capacity % = unbooked hours / total available hours.
* KPI drilldown modals: all consultant lists grouped by level with expandable sections, open expanded by default + Expand/Collapse All button
* Rolling Off Soon: capped at 4 rows, "View all (N)" link triggers drillAllRollingOff(). Clicking a consultant opens drillRollingOff modal (focused view with Change Assignment CTA, hm-row-flash-amber on navigate)
* Overallocated Resources: clicking an item calls _overallocatedNavigate(name) → navigateToEmployee(name) pattern
* Resource Allocation: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling, hybrid edit mode. 4-tier color scheme: Red 0–10h / Yellow 11–44h / Green 45h / Orange 46h+. Consultant name click opens profile modal; chevron toggles row expand/collapse.
* Edit Mode: solid blue button top-right (admin + resource_manager only), Quick Fill bar, inline cell editing, Save/Cancel bar, amber conflict banner. Enter key navigates down (skips empty rows), Escape restores pending value.
* Search bar: elevated border, focus ring, expands rightward on focus
* Open Needs: 2-segment donut chart (Partially Met + Unmet only) + expandable rows with AI match panel. AI recommendations use any-skill matching (allSkillSets.includes()). Create New Need button (admin + resource_manager): 2-step modal with inline project creation. Edit button on need rows (admin + resource_manager): opens pre-populated edit modal. Abandon button on each row closes need with reason='abandoned'. Needs auto-close when fully met via checkAndAutoCloseNeeds().
* Ask Claude: dynamic suggested questions, text input, markdown responses
* Settings — admin: left sub-nav with Consultants (default) + Users panels. Users grouped by role; click name to open edit modal.
* Settings — resource_manager: left sub-nav with Consultants panel only (Users hidden). Consultants grouped by level; click name to open profile editor.
* SSE auto-refresh: fires after successful DB writes
* All saves write to Supabase — ExcelJS fully removed
* AI match acceptance: acceptMatch() is async — writes to Supabase via saveAllAssignments() before updating UI status. Date range guard: no 0h rows written outside engagement date range.

---

## Settings Tab (#165 — complete, Session 26)

* Settings tab uses a left sub-nav: Consultants (first, default) + Users (second, admin only)
* `_settingsActivePanel` global tracks active panel, persists across tab switches
* `switchSettingsPanel(panel)` handles nav highlight + panel show/hide + data load
* Consultants panel: admin + resource_manager. Users panel: admin only.
* Nav item order: Consultants on top, Users below

---

## Open Needs — Create New Need (#164 — complete, Session 25)

Full need creation workflow:

**Step 1 — Project Selection**
* Dropdown lists active (non-Proposed) projects + "Create new project" option
* Inline project creation sub-form: name, client, status, start/end dates. auto-probability by status (25/75/100). is_billable defaults to true.
* Newly created project pushed into _cnProjects array (not just DOM) — prevents date pre-fill bug on immediate selection.
* GET /api/projects?status= filter: excludes Proposed by default for need association; includes all for project management.

**Step 2 — Need Details**
* Level dropdown (all levels), skill set multi-select pills (Practice Area + Technology, colored by type)
* Hours/week input, start/end dates (pre-filled from project range), date-range validation
* At least one skill required to submit

**Lifecycle**
* Auto-close: acceptMatch() calls checkAndAutoCloseNeeds() after every supply write. If all weeks in need's date range are covered at required hours, sets closed_at = now(), closed_reason = 'met' via serviceClient.
* Manual abandon: Abandon button on need row → POST /api/needs/:id/close with { reason: 'abandoned' }.
* Both paths set closed_at — readStaffingData() .is('closed_at', null) filter excludes them permanently from pipeline.

**Table layout**
* 9 columns: Client, Project, Level, Skills, Hours/Wk, Start, End, Coverage, Actions

---

## Open Needs — Edit Need (#173 — complete, Session 26)

* Edit button on each need row (admin + resource_manager only, gated by `_hmCanEdit()`)
* Opens modal with read-only project/client header + editable level, skills, hours, dates
* `_enPopulateSkills(selectedNames)` builds pill grid with pre-selection
* Same validation as Create: level required, ≥1 skill, hours 1-100, valid date range
* PATCH /api/needs/:id → updateNeed() + replaceNeedSkillSets() via serviceClient
* SSE broadcast + dashboard refresh after save

---

## Consultant Profile Editor (#119 — complete, updated Session 24)

* Edit modal: name, level, location (custom typeahead — see below), bill rate override, cost rate override, skill sets
* Location field: custom JS typeahead with CP_CITIES array (top 50 US cities). Arrow key navigation, Enter/click to select, free text fallback for non-US. No external library.
* Skill set pills: toggleable, colored by type (Practice Area vs Technology)
* After save: panel reloads, edited row scrolls into view and flashes amber (#134)
* Deactivate/reactivate from modal — same scroll+flash after reload
* Profile modal also accessible by clicking consultant name in heatmap row (data-cid pattern)
* **Smart Discard (Session 24): dirty state tracked via _cpIsDirty, _cpSnapshot. Closing with unsaved changes shows amber strip instead of closing immediately. "Keep editing" hides strip; "Discard" closes modal.**
* **AbortController pattern: _cpAbortController tracks all dirty-tracking listeners. Each modal open creates a new controller, aborts the previous one to prevent listener accumulation.**
* **Abort-after-hide ordering: closeConsultantProfileEditor() hides modal and resets all state BEFORE calling abort(). Strip buttons wired via .onclick (not addEventListener) outside AbortController scope.**

## Consultants Management Panel (#126 — complete, updated Session 24)

* Settings tab → Consultants section
* Table: Name, Level, Skill Set, Location, Status, Actions (Deactivate/Reactivate)
* **Active consultants grouped by level in LEVEL_ORDER (Session 24)**
* **Click consultant name to open profile editor — Edit button removed (Session 24)**
* _renderSettingsGroupHeader() helper: uppercase label + count, no collapse toggle (always expanded)
* Admin + resource_manager access

---

## Skill Set Modal — Source Routing (Session 24)

* openSkillSetModal(skillName, needContext, source) — `source` param added
* source values: 'needs' (default), 'settings', 'profile'
* Each consultant's drill-link span has data-name and data-cid attributes
* source === 'settings' → clicking consultant name calls openConsultantProfileEditor(data-cid)
* Other sources → navigateToEmployee(data-name) (heatmap nav)

---

## Drilldown Inventory (#61 — complete, updated Session 24)

All drilldowns audited and fixed. Current state:

| Drilldown | Status | Notes |
|---|---|---|
| Utilization KPI card | ✅ | drillUtilizationKPI() — hours-based, opens expanded |
| Available Capacity KPI card | ✅ | drillHeadcount() — hours-based %, opens expanded |
| Pipeline Coverage KPI card | ✅ | drillDemandKPI() + nested drillCoverage() |
| On Bench KPI card | ✅ | drillBenchKPI() — opens expanded |
| Upcoming Availability chart — click row | ✅ | drillUtilization(level) — inverted metric |
| Top Projects — click row | ✅ | navigateToProject() |
| Rolling Off Soon — click employee | ✅ | drillRollingOff() — focused modal with Change Assignment CTA |
| Rolling Off Soon — View all (N) | ✅ | drillAllRollingOff() — full list modal |
| Overallocated Resources — click item | ✅ | _overallocatedNavigate(name) → navigateToEmployee(name) |
| Heatmap total cell (non-edit) | ✅ | drillHeatmapCell() |
| Heatmap employee ℹ icon | ✅ | drillHeatmapEmployee() |
| Heatmap consultant name click | ✅ | openConsultantProfileEditor(data-cid) |
| Heatmap week header | ✅ | drillHeatmapWeek() |
| Expanded sub-row ℹ icon | ✅ | drillHeatmapEmployee() |
| Needs table row | ✅ | toggleNeedExpansion() + AI recommendations |
| Donut segment click | ✅ | drillNeedsByStatus() |
| Suggested question chips | ✅ | setQuestion() |
| Settings consultant name click | ✅ | openConsultantProfileEditor(data-cid) |
| Settings user name click | ✅ | openUserEditModal(uid) |
| Skill set modal — consultant name (settings context) | ✅ | openConsultantProfileEditor(data-cid) via source param |

---

## Cache Busters

| File | Current version |
|---|---|
| app.js | v=92 |
| styles.css | v=49 |

Note: bump these on every deploy with frontend changes to bust browser cache.

---

## GitHub State (after Session 27)

| Milestone | Status | Remaining issues |
|---|---|---|
| Active Sprint | ✅ Cleared (Session 13) | — |
| Soon | ✅ Cleared (Session 18) | — |
| V1 Stable | ✅ Cleared (Session 19), tagged v1-stable (Session 20) | — |
| V2 | In progress | 2 open — #168, #154, #129 |
| V3a — Data Foundation + Roles | Backlog | 5 open — #172, #169, #118, #99, #97 |
| V3b — Feature Expansion | Backlog | 5 open — #174, #167, #133, #98, #96 |
| V3c — Polish + Integrations | Backlog | 9 open — #171, #166, #145, #136, #131, #95, #94, #64, #43 |

GitHub Project: "Staffing Intelligence Build Board" (Project #4) — all open issues tracked.

Label taxonomy (6 dimensions — established Session 24):
* `type:bug / feature / enhancement / polish / epic / chore / security / integration`
* `priority:p0 / p1 / p2 / p3`
* `effort:xs / s / m / l / xl`
* `area:overview / heatmap / open-needs / settings / auth / ai / infra`
* Phase via Milestone
* Status via Project board field

All open issues have labels applied.

---

## Issues Completed This Session (Session 27)

| Issue | Title | Notes |
|---|---|---|
| #170 | Synthetic test data seed script | seed-synthetic-data.js: 25 consultants, 12 projects, 8 open needs (4 unmet + 4 partially met). Removed Ivalua/Emburse — synthetic skills use core P2P/O2C/R2R/SC + NetSuite/PM only. FK validation + dedup guard added. Fixed field names: probability_pct, capacity_hours_per_week. |
| #179 | Recommendations engine qualification fix | server.js: qualify consultants on ≥1 week of available capacity instead of requiring capacity in every week of the demand range. Surfaces partially-available candidates correctly. |

---

## New Issues Created This Session (Session 27)

None.

---

## Key Technical Decisions (Session 27)

* **Ivalua and Emburse removed from synthetic data** — these are real Deloitte tool names; synthetic test data uses only core practice skills (P2P, O2C, R2R, SC) + NetSuite + Program Manager. Prevents confusion between test and prod data.
* **Recommendations: ≥1 qualifying week instead of all weeks** — previous logic required capacity available in every demand week; this incorrectly excluded partially-available consultants who are the correct answer for Partially Met needs. New logic: if at least one week has (45 - booked) ≥ hoursNeeded, consultant qualifies.
* **Seed FK validation before insert** — NEED_DEFS now validated upfront: unknown project name or level name throws immediately instead of silently inserting NULL FKs. Dedup guard on consultant_skill_sets prevents duplicate rows if CONSULTANT_DEFS accidentally lists a skill twice.
* **Need design: 4 unmet / 4 partially met** — engineered by ensuring no consultant has the exact skill combination for unmet needs, and deliberately constraining assignment hours to create capacity gaps for partially met needs.

---

## Pending Technical Debt

* No open SB items.

---

## Key Technical Decisions (cumulative — do not revert)

* Capacity threshold = 45h/week
* Hours/Week input max = 100
* /api/dashboard and /api/heatmap use serviceClient — NOT user JWT. Required after RLS tightening. Do not revert.
* Supabase write-back: upsertAssignment() uses native upsert with onConflict: 'consultant_id,project_id,week_ending'
* **resolveConsultantId, resolveProjectId, upsertAssignment, deleteAssignments, createProject(), createNeed(), closeNeed(), updateNeed(), replaceNeedSkillSets() all use serviceClient — not user JWT. RLS blocks user JWT on all write-path functions. Never revert.**
* SSE: named events (event: data-updated) — NOT default 'message' event
* Toast duration = 8000ms, click to dismiss
* Conflict banner: amber (#F59E0B)
* claudeService.js system prompt: always restart server after editing — prompt is loaded at startup
* **Recommendations engine: allSkillSets.includes(need.skillSet) for any-match. empWeekMap stores allSkillSets array. Never use primary skillSet only for matching.**
* **Recommendations engine: qualify on ≥1 week of available capacity (not all weeks). qualifyingWeeks > 0 is the gate. Do not revert to all-weeks requirement.**
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
* Week selector removed Session 14 — to be rebuilt as historical snapshots (#129, V2)
* Location typeahead: custom JS (no library), CP_CITIES array in app.js, mousedown + 150ms blur delay pattern
* Invite flow: temp password only. Magic link removed Session 19. SSO placeholder comment in server.js.
* email_confirmed_at login gate: null check at /api/auth/login — returns 401 before session created
* Status logic: pending = !email_confirmed_at, active = email_confirmed_at set + not banned, inactive = banned
* Heatmap color scheme: 4-tier availability-first — 0–10h Red, 11–44h Yellow, 45h Green, 46h+ Orange. Classes: hm-bench, hm-partial, hm-utilized, hm-over.
* claudeService.js formatContext: inWindow() filter — only resource_assignments where week_ending falls in current rolling 90-day window. Current week hours used for availability, not rolling average.
* **data-cid pattern: all consultant name references in DOM selectors replaced with data-cid attributes. Applies to ALL panels: heatmap cell handlers, Settings panel click handlers, Rolling Off Soon click handlers, and all drilldown modals. Never pass consultant names as inline JS string literals.**
* v1-stable tag: created and pushed after Session 20 UAT. Permanent revert point for V1.
* Utilization KPI: hours-based — sum of all booked hours across all consultants / sum of total available hours (45h × weeks × consultants). Overall Average in drilldown uses same formula.
* Rolling Off Soon drilldown: drillRollingOff() opens focused modal per consultant. _rollingOffNavigate() navigates to heatmap row with hm-row-flash-amber CSS animation. Modal includes Change Assignment CTA. Panel capped at 4 rows; drillAllRollingOff() shows full list.
* **_overallocatedNavigate uses navigateToEmployee(name) pattern — same as _rollingOffNavigate. Do not use navigateTo('staffing') + manual virtual scroll positioning.**
* **parseDateStr normalizes 2-digit years: if yr < 100 → yr += 2000. Prevents date parsing failures on short year strings.**
* **acceptMatch() is async — writes to Supabase via saveAllAssignments() before updating UI status. Date range guard: weeks outside engagement start/end are not written (no 0h rows). Status should only update on confirmed DB write.**
* **Drilldown modals open with groups expanded by default + Expand/Collapse All button above table rows, left-aligned.**
* **Enter key navigation in heatmap: while loop skips consultants with no project sub-rows. Polling pattern (setInterval 50ms, 20 attempts) for post-render DOM queries after virtual scroll render.**
* **Consultant name click in heatmap: data-cid on td element. Name text span → openConsultantProfileEditor(data-cid). Chevron span → toggleHmExpand(data-emp). Never inline JS string for names — handles apostrophe names correctly.**
* **Smart Discard: _cpIsDirty tracks whether form has changed from _cpSnapshot. AbortController (_cpAbortController) manages all change listeners — aborted and recreated on each modal open. Abort-after-hide: closeConsultantProfileEditor() hides modal and resets state before calling abort(). Strip buttons use .onclick property assignment (not addEventListener), exempt from abort.**
* **Settings panels use _renderSettingsGroupHeader() for always-expanded group rows. LEVEL_ORDER for consultants; ROLE_ORDER (['admin','resource_manager','project_manager','executive']) for users.**
* **openSkillSetModal source param: 'needs' | 'settings' | 'profile'. source==='settings' routes consultant name clicks to openConsultantProfileEditor(data-cid) instead of heatmap navigation.**
* **Need lifecycle: closed_at TIMESTAMPTZ + closed_reason TEXT. readStaffingData() filters .is('closed_at', null). Auto-close via checkAndAutoCloseNeeds() after acceptMatch(). Manual close via POST /api/needs/:id/close. All writes use serviceClient.**
* **Needs donut chart: 2 segments only (Partially Met + Unmet). Fully Met permanently removed — closed_at IS NULL guarantees it can never appear. statusMap and statuses arrays are 2-element everywhere.**
* **Settings nav defaults to Consultants panel (_settingsActivePanel). switchSettingsPanel() handles nav highlight + panel swap. Admin sees both panels; resource_manager sees Consultants only.**
* **Edit Need: PATCH /api/needs/:id → updateNeed() + replaceNeedSkillSets() via serviceClient. Modal reuses Step 2 layout. Project/client read-only in edit mode.**
* **seed-synthetic-data.js column names: probability_pct (not probability), capacity_hours_per_week (not capacity). Match actual Supabase schema.**

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

## Decision Tracking Protocol (added Session 19)

When a decision is confirmed during a session, Claude will do one of two things — no silent confirmations:
1. **Act immediately** — provide the CC prompt or make the change right then
2. **Explicitly defer** — state "noted, I'll include this in the session handoff update" so nothing is lost

This applies to: issue milestone moves, roadmap updates, architectural decisions, any confirmed change that isn't immediately acted on.

Confirmed decisions this session:
* Ivalua/Emburse removed from synthetic skill data — core skills only
* Recommendations qualify on ≥1 week (not all weeks)
* NEED_DEFS: 4 truly unmet + 4 partially met, engineered deterministically
* FK validation + dedup guard added to seed script

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

### Session Docs

At the end of each session, create `docs/session-XX/` and copy two files into it:
- `HANDOFF_vXX.md` — session handoff document (new, written that session)
- `CLAUDE.md` — snapshot of the root `CLAUDE.md` as of that session end

Also update the root `CLAUDE.md` in place (it is the live version Claude Code reads on every session start). The `docs/session-XX/` copy is a point-in-time archive for reference and rollback.

```
mkdir docs/session-XX
cp HANDOFF_vXX.md docs/session-XX/
cp CLAUDE.md docs/session-XX/
```

---

## Build Order — Next Session

V2 remaining (priority order):
1. **#176 — Simplify coverage status model** — remove Partially Met/Fully Met distinction ← START HERE
2. **#175 — Group needs by Client → Project hierarchy** — builds on simpler status model
3. **#177 — AI recommendations partial availability** — fits after status rethink
4. **#178 — Forward-looking time horizon control** — independent, pairs with #129
5. **#129 — Historical staffing snapshots** — biggest feature, stable base needed
6. **#154 — UI/UX design pass** — covers ALL new surfaces including #129
7. **#168 — Multi-user UAT suite** — final gate

# Staffing Intelligence App — CLAUDE.md

## What This App Does

Resource planning dashboard for a ~25-person NetSuite consulting practice. Tracks consultant utilization, project staffing, demand coverage, and bench capacity across a 12-week rolling window. Includes Claude AI for natural language Q&A over staffing data.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express 5.x |
| Frontend | Vanilla JavaScript (no framework), Chart.js, marked.js |
| Database | Supabase (PostgreSQL) with RLS |
| Auth | Supabase Auth + server-side express-session |
| AI | Claude API (`claude-sonnet-4-6`) |
| Hosting | Railway (production), localhost:3000 (dev) |

---

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express server, all API routes, dashboard/heatmap aggregation logic (~1,300 lines) |
| `public/app.js` | All frontend logic: tab routing, heatmap rendering, chart drawing, inline editing (~4,600 lines) |
| `public/index.html` | App shell: sidebar nav, tab panels (Overview / Staffing / Needs / Ask Claude / Settings) |
| `public/styles.css` | Dark theme, pastel palette, responsive layout |
| `public/login.html` | Standalone login page |
| `supabaseReader.js` | Data layer: all Supabase reads/writes, joins, maps to app shape |
| `claudeService.js` | Claude API calls: `askClaude()`, `getSuggestedQuestions()`, `getMatchReasonings()` |

---

## Database Tables (Supabase)

```
tenants              — Tenant registry (id UUID, name TEXT — e.g. "Meridian Consulting")
levels               — Consultant hierarchy (Analyst → Partner/MD), billing rates
skill_sets           — Practice areas + technologies (P2P, O2C, NetSuite, etc.)
consultants          — Employee master (name, level, location, capacity, rates, industry TEXT, country TEXT,
                        user_id UUID nullable — links auth user to consultant row for RBAC)
consultant_skill_sets — Many-to-many: consultant → skills
clients              — Client names
projects             — Engagements (name, status, probability, dates, client)
resource_assignments — Supply: one row per consultant + project + week_ending + hours
needs                — Demand: open role requirements (level, hours/week, date range)
                        closed_at TIMESTAMPTZ + closed_reason TEXT ('met'|'abandoned') — NULL = open
need_skill_sets      — Many-to-many: need → required skills
industries           — Tenant-scoped industry list (id, name, tenant_id)
countries            — Global country list (id, name, sort_order)
```

All tables have RLS filtering by `tenant_id` (from JWT `app_metadata`).

**Two Supabase clients**:
- `serviceClient` — service role key, bypasses RLS, server-side only
- `getClient(userToken)` — per-request JWT, RLS enforced

---

## API Endpoints (Summary)

```
GET  /api/auth/me                     — current user (role, canViewRates)
POST /api/auth/login                  — login
POST /api/auth/logout                 — logout

GET  /api/dashboard                   — KPIs, bench, rolloffs, cliffs, needs coverage
GET  /api/heatmap                     — employee rows + weekly hours (12 weeks)
POST /api/save-staffing               — inline heatmap cell edits (admin/resource_manager)
POST /api/supply/update               — bulk add/update/delete assignments

GET  /api/consultants                 — list consultants
GET  /api/consultants/:id             — profile + skills
PATCH /api/consultants/:id            — update consultant
PUT  /api/consultants/:id/skills      — replace skill sets
PATCH /api/consultants/:id/deactivate
PATCH /api/consultants/:id/reactivate

GET  /api/projects                    — active projects (?status= filter supported)
POST /api/projects                    — create new project
GET  /api/skill-sets/:name/consultants — consultants with skill + current hours

POST /api/needs                       — create new staffing need
PATCH /api/needs/:id                  — edit existing need (level, skills, hours, dates)
POST /api/needs/:id/close             — close need with { reason: 'met' | 'abandoned' }
GET  /api/needs/:id/candidates        — list consultants eligible for a need (level + skill match)
POST /api/needs/:id/bulk-assign       — bulk assign one or more consultants to a need; auto-closes need if met

POST /api/suggested-questions         — Claude-generated Q prompts
GET  /api/ask?question=...            — Claude NL query over staffing context
GET  /api/recommendations             — AI-matched consultants for open needs

GET  /api/industries                  — industries for current tenant
GET  /api/countries                   — all countries sorted by sort_order

GET  /api/admin/users                 — list users (admin only)
POST /api/admin/users/invite          — invite user
PATCH /api/admin/users/:id/role
PATCH /api/admin/users/:id/deactivate
PATCH /api/admin/users/:id/reactivate

GET  /api/events                      — SSE stream (real-time updates)
```

---

## Role-Based Access

| Role | Capabilities |
|------|-------------|
| `admin` | Full access including user management and sandbox reset |
| `resource_manager` | Full data access, edit staffing/consultants, no user management |
| `project_manager` | Resource Allocation tab read-only; can create/edit needs (not close/assign); can view consultant profiles (no rates) |
| `executive` | Read-only dashboard + heatmap + Ask Claude |
| `consultant` | Sees only own heatmap row + own profile (no rates) |

Enforced via `requireRole()` middleware on sensitive routes.

---

## Frontend Architecture

**No framework — vanilla JS.** All state is module-level globals in `app.js`:
- `currentUserRole` — from `/api/auth/me`
- `rawData` — cached dashboard/heatmap response
- `_hmExpanded` — Set of expanded employee names in heatmap
- `_pendingStaffing` — Map of unsaved inline edits (`${empName}||${weekLabel}||${project}`)
- `_editActiveCell` — currently focused heatmap cell
- `_needsStatusFilter` — active donut chart filter
- `_settingsActivePanel` — active Settings sub-nav panel ('consultants' | 'users')

**Settings tab** uses a left sub-nav (Consultants first, Users second). Consultants visible to admin + resource_manager; Users visible to admin only. `switchSettingsPanel()` handles nav highlight + panel swap.

**Heatmap** uses virtual scrolling (renders only visible rows) to handle 40+ employees. Cells support keyboard nav (Tab/Enter/Arrow keys).

**Charts**: Chart.js instances stored in `charts` object, reused across re-renders.

**Command palette**: `Ctrl+K` or `/` opens a global search overlay. Searches across consultants, projects, open needs, and navigation items. Match reasons shown per result. Quick actions mode via `>` prefix (7 actions, role-gated). Ghost search bar in header triggers palette on click. Sidebar `?` button opens shortcut help for discoverability. Searches `allSkillSets` array — no primary-skill-only concept.

**StaffingDatePicker**: Reusable week-snapping date picker class (no native `<input type="date">`). Features: quick-pick buttons, mini calendar with full week-row highlight, month navigation, keyboard support (arrows, Enter, Esc). All dates snap to Saturday (week-ending). Used in Add Need bulk modal and Edit Need modal. Start quick-picks relative to today; end quick-picks relative to selected start date.

---

## Heatmap Color Coding

| Hours | Class | Color | Meaning |
|-------|-------|-------|---------|
| 0–10h | hm-bench | Red | Bench / urgent |
| 11–44h | hm-partial | Yellow | Partial utilization |
| 45h | hm-utilized | Green | Perfect utilization |
| 46h+ | hm-over | Orange | Overallocated |

---

## Data Shape from `readStaffingData()`

This is the central data structure passed to all aggregation logic:

```javascript
{
  supply: [{ employeeName, level, skillSet, allSkillSets, projectAssigned,
             projectStatus, isBillable, weeklyHours: { "Week ending 3/7": 40 },
             _consultantId, _projectId }],
  demand: [{ projectName, clientName, projectStatus, probability, resourceLevel,
             skillSet, allSkillSets, startDate, endDate, hoursPerWeek, _needId, _projectId }],
  employees: [{ employeeName, level, isBillable }],
  skills: [{ skillSet, type }],
  resourceLevels: [{ level }],
  projects: [{ projectId, projectName, status, probability, clientName }],
  _meta: { weekKeys, weekKeyToDate, levelById, skillSetById,
           consultantById, consultantByName, projectById, projectByName }
}
```

Week keys format: `"Week ending M/D"` (e.g. `"Week ending 3/7"`). Stored in DB as `YYYY-MM-DD`.

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=...       # server-only, bypasses RLS
SUPABASE_ANON_KEY=eyJ...
SESSION_SECRET=...             # 32-byte random hex
TENANT_ID=...                  # UUID, fixed per deployment
RAILWAY_URL=https://staffing-app-production.up.railway.app  # used as redirectTo base in invite generateLink
```

Railway auto-sets `PORT=8080`; do not override it in Railway config.

---

## Running Locally

```bash
npm install
# create .env with variables above
node server.js
# open http://localhost:3000
```

---

## Conventions & Patterns

- **Server writes**: Always go through `supabaseReader.js` functions, not inline SQL in routes
- **Auth on every route**: Use `requireAuth` middleware; add `requireRole(...)` for writes
- **Week date math**: Use `_meta.weekKeyToDate` to convert display labels to ISO dates
- **Inline edits**: Saved immediately on cell blur/Enter; `_pendingStaffing` tracks unsaved changes
- **SSE broadcast**: Call `broadcast({ type: 'consultant-updated', ... })` after any consultant mutation
- **GitHub project board**: Every new issue must be added to the project board immediately after creation. `gh project item-add` CLI silently fails — use GraphQL instead: get the issue node_id via `gh api repos/varunprabhakar81/staffing-app/issues/NNN --jq '.node_id'`, then call `addProjectV2ItemById` mutation with project ID `PVT_kwHOAiRn_s4BTGRI`. Never create an issue without adding it to the board.
- **SQL migrations** — Run migrations via Supabase SQL Editor (paste raw SQL). The `sb_secret_*` service key format is an opaque API token that only works with PostgREST — it cannot connect to Postgres directly. Do not attempt `node -e` or `psql` migrations with the service key.
- **Claude context**: Built in `claudeService.js`; includes 12-week window, employee skills/levels, demand roles
- **Sessions**: In-memory (MemoryStore) — lost on server restart in dev; acceptable for Railway single-instance
- **Session docs**: At the end of each session, create `docs/session-XX/` containing `HANDOFF_vXX.md` (new handoff) and a snapshot copy of `CLAUDE.md`. The root `CLAUDE.md` is the live version read at session start; `docs/session-XX/CLAUDE.md` is the point-in-time archive.

---

## Critical Rules — Never Revert

These decisions were made deliberately to fix hard-to-debug bugs. Do not revert them.

- **serviceClient on all write paths** — `resolveConsultantId`, `resolveProjectId`, `upsertAssignment`, `deleteAssignments`, `acceptMatch()`, `updateNeed()`, `replaceNeedSkillSets()` all use `serviceClient`. RLS blocks user JWT on write paths. Never switch to user JWT.
- **data-cid pattern** — all consultant name references in DOM use `data-cid` attributes. Never pass consultant names as inline JS string literals. Handles apostrophe names (e.g. Delaney O'Neil) correctly.
- **allSkillSets.includes() for matching** — recommendations engine matches against full `allSkillSets` array, not primary skill only. `empWeekMap` stores `allSkillSets` array. Never revert to primary-only matching.
- **Recommendations engine: candidates must match level + any skill (`allSkillSets.includes`)** — Availability calculated as average available hours within the need's start-to-end date window only (not full 12-week rolling window). Included if avgAvailable > 0. Capped at `hoursNeeded` in response. Sorted by `availableHours` desc. Badge: green ≥100%, yellow 50-99%, coral <50%. Do not reintroduce a hard per-week qualifying gate or minimum availability threshold.
- **parseDateStr 2-digit year fix** — `if yr < 100 → yr += 2000`. Prevents date parsing failures.
- **acceptMatch() is async** — writes to Supabase before updating UI. Date range guard: never write 0h rows outside engagement start/end dates.
- **Cache busters must be incremented on every deploy with frontend changes** — `app.js` and `styles.css` both carry `?v=N` query strings in `index.html`. Current: `app.js?v=146`, `styles.css?v=65`.
- **/api/dashboard and /api/heatmap use serviceClient** — not user JWT. Required after RLS tightening. Do not revert.
- **Drilldown modals open expanded by default** — all consultant group sections open on load + Expand/Collapse All button above rows, left-aligned.
- **Enter key navigation in heatmap** — while loop skips consultants with no project sub-rows. Polling pattern (setInterval 50ms, 20 attempts) for post-render DOM queries.
- **Need lifecycle uses closed_at IS NULL** — `readStaffingData()` filters `.is('closed_at', null)`. Auto-close (reason='met') fires in `checkAndAutoCloseNeeds()` after every `acceptMatch()` write. Manual close (reason='abandoned') via `POST /api/needs/:id/close`. All close writes use `serviceClient`.
- **Needs donut chart segments by client** — each segment = one client, sized by open need count. Urgency badges on rows (Urgent ≤2wk, Soon 2-4wk, Planned 4+wk) computed client-side from `startDate`. No coverage status computation on server or client. `_needsClientFilter` (not `_needsStatusFilter`) drives donut click filtering. Do not reintroduce partially_met/unmet/fully_met.
- **Settings nav defaults to Consultants** — both admin and resource_manager see Consultants panel first. `_settingsActivePanel` persists across tab switches.
- **Quick Fill always uses API path (POST /api/save-staffing)** — DOM fast path was removed. Never reintroduce DOM cell matching for Quick Fill.
- **No global staffingData — every route fetches fresh via tId(req)** — `readStaffingData(null, serviceClient, tId(req))` is called per-request. Never cache staffing data in a module-level variable. The only cache is `recoCacheMap` (per-tenant Map keyed by `tenantId`, 60s TTL). If you see `let staffingData` at module level, delete it — it was removed in Session 31 and must not return.
- **tId(req) for all tenant-scoped calls** — `const tId = req => req.session?.tenant_id || process.env.TENANT_ID`. All Supabase reads and writes must use `tId(req)`, never `process.env.TENANT_ID` directly inside a route handler.
- **testing_role gates testing portal access** — testing_role in app_metadata: test_admin (full access), tester (own results), null (no access). Sidebar link and /testing.html both check this. Do not use business roles (admin/RM/PM) for testing access control.
- **generateLink for invites, not inviteUserByEmail** — Pilot uses generateLink to produce invite URLs. Admin copies link and shares via Teams. No SMTP dependency. inviteUserByEmail deferred to V3 (#203).
- **set-password.html handles both invite and recovery** — Token type invite triggers Set Your Password plus metadata promotion. Token type recovery triggers Reset Your Password plus password update only. Do not break either path.
- **test_results uses UNIQUE(tenant_id, test_case_id, user_id)** — Upsert pattern. One result per user per test. submitted_at column for lock/unlock flow. general-feedback is a special test_case_id for free-form feedback.
- **StaffingDatePicker end date quick-picks are relative to start date** — not relative to today. Start date quick-picks are relative to today. Do not make both relative to today.
- **StaffingDatePicker start date default** — `max(project start date, today)`, snapped to the next Saturday. No static default.
- **Command palette searches allSkillSets** — not primary skill. Industry and country data requires a lazy preload from `/api/consultants` (not available at page load). Do not assume it's synchronously available.

---

## UI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+1–5` | Switch tabs (5 = Settings) |
| `Ctrl+R` | Refresh dashboard |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+K` or `/` | Command palette |
| `>` (in palette) | Quick actions mode |
| `?` | Show shortcut help |
| `Esc` | Close modal |

---

## Known Limitations

- Sessions not persisted across server restarts (MemoryStore)
- No drag-and-drop staffing reassignment
- No email notifications
- TENANT_ID is hard-coded per deployment (not parameterized for multi-tenant SaaS)
- Excel import script (`import-to-supabase.js`) is one-time only

---

## Build Order

### Pilot — Internal adoption ← active
Gate: do NOT start V3 until 2-4 weeks of pilot feedback collected.
- #210 — Command palette (Phase 1+2 shipped; Phases 3–5 remain)
- #204 — Main app header redesign
- #208 — Skill set categories rethink
- #183 — Contextual tooltips
- #184 — Admin getting-started checklist
- #182 — In-app onboarding tour

Completed in Pilot:
- #195 — Per-tenant sandboxes + personalization ✓
- #196 — Rename Staffing → Resource Allocation ✓
- #199 — Button terminology audit ✓
- #192 — Week alignment ✓
- #201 — Invite flow — set-password + generateLink ✓
- #202 — Testing companion app ✓
- #197 — Open needs modal — group by project, collapsed ✓
- #198 — Needs tab — expand/collapse all ✓
- #205 — Needs donut chart hover tooltip ✓
- #206 — Bulk need creation — multi-line modal ✓
- #207 — Comprehensive test case regeneration ✓
- #188 — Consultant master data: Industry and Country fields ✓
- #209 — Overview mini donut — removed ✓
- #211 — Date picker redesign — week-snapping custom picker ✓

### V3 — First external customer (after Pilot)
Gate: at least 3 unsolicited feature requests from pilot users.
- #96 — Tenant onboarding
- #97 — Extended roles
- #118 — Audit log
- #172 — Client hierarchy

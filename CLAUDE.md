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
levels               — Consultant hierarchy (Analyst → Partner/MD), billing rates
skill_sets           — Practice areas + technologies (P2P, O2C, NetSuite, etc.)
consultants          — Employee master (name, level, location, capacity, rates)
consultant_skill_sets — Many-to-many: consultant → skills
clients              — Client names
projects             — Engagements (name, status, probability, dates, client)
resource_assignments — Supply: one row per consultant + project + week_ending + hours
needs                — Demand: open role requirements (level, hours/week, date range)
need_skill_sets      — Many-to-many: need → required skills
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

GET  /api/projects                    — active projects
GET  /api/skill-sets/:name/consultants — consultants with skill + current hours

POST /api/suggested-questions         — Claude-generated Q prompts
GET  /api/ask?question=...            — Claude NL query over staffing context
GET  /api/recommendations             — AI-matched consultants for open needs

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
| `admin` | Full access including user management |
| `resource_manager` | Full data access, edit staffing/consultants, no user management |
| `project_manager` | Read-only on staffing; can view consultant profiles |
| `executive` | Read-only dashboard + heatmap |
| `consultant` | Sees only own heatmap row |

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

**Heatmap** uses virtual scrolling (renders only visible rows) to handle 40+ employees. Cells support keyboard nav (Tab/Enter/Arrow keys).

**Charts**: Chart.js instances stored in `charts` object, reused across re-renders.

---

## Heatmap Color Coding

| Hours | Color | Meaning |
|-------|-------|---------|
| 0 | Dark blue | Bench |
| 1–34 | Purple | Available capacity |
| 35–45 | Green | Fully utilized |
| >45 | Orange/red | Overbooked |

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
- **Claude context**: Built in `claudeService.js`; includes 12-week window, employee skills/levels, demand roles
- **Sessions**: In-memory (MemoryStore) — lost on server restart in dev; acceptable for Railway single-instance

---

## UI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+1–5` | Switch tabs |
| `Ctrl+R` | Refresh dashboard |
| `Ctrl+B` | Toggle sidebar |
| `?` | Show shortcut help |
| `Esc` | Close modal |

---

## Known Limitations

- Sessions not persisted across server restarts (MemoryStore)
- No drag-and-drop staffing reassignment
- No email notifications
- TENANT_ID is hard-coded per deployment (not parameterized for multi-tenant SaaS)
- Excel import script (`import-to-supabase.js`) is one-time only

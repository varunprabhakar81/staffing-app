Staffing Intelligence App — Chat Handoff Document
Last updated: #38 Railway deploy complete — RLS tightening next

---

## What This App Is

Staffing Intelligence — a real-time staffing management platform for Varun's NetSuite consulting practice at Deloitte.

* Local web app at http://localhost:3000
* Node.js + Express backend, plain HTML/CSS/JS frontend
* Claude API (claude-sonnet-4-20250514) for AI features
* Supabase (Postgres) as data backbone — Excel fully retired
* 25 real employees, real project data
* GitHub: https://github.com/varunprabhakar81/staffing-app (private)

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
* JWT contains tenant_id in app_metadata — set via custom_access_token_hook Postgres function
* RLS policies use auth.jwt() -> 'app_metadata' ->> 'tenant_id' (not current_setting)
* supabaseReader.js: serviceClient (service role, bypasses RLS) + anonClient (per-request JWT, RLS enforced)
* requireAuth middleware: protects all /api/* routes except /api/auth/*
* Login page: public/login.html — POST /api/auth/login → session → redirect to index.html
* Logout: POST /api/auth/logout → session destroyed → redirect to login.html
* Auth guard: app.js checks /api/auth/me on load — 401 → redirect to login.html
* Startup cache warms using serviceClient (bypasses RLS) — logs "40 supply rows, 8 demand rows" on boot
* app.set('trust proxy', 1) — required for Railway reverse proxy + secure cookies in prod

---

## Supabase Schema (10 tables)

All tables except tenants have tenant_id + RLS policy: (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id

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
* upsertAssignment uses native Supabase upsert with onConflict: 'consultant_id,project_id,week_ending' — atomic, no race condition
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
* 4 tabs: Overview, Staffing, Needs, Ask Claude
* Overview: KPI cards, utilization by level, overallocation warning with tooltip + drilldown, top projects, rolling off soon, needs attention
* Staffing: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling, hybrid edit mode
* Edit Mode: solid blue button top-right, Quick Fill bar, inline cell editing, Save/Cancel bar, amber conflict banner
* Needs: donut chart + expandable rows with AI match panel. Shows pipeline status + coverage status
* Ask Claude: dynamic suggested questions, text input, markdown responses
* SSE auto-refresh: fires after successful DB writes (broadcastSSE), pushes data-updated event to all clients
* All saves write to Supabase — ExcelJS fully removed from app (92 packages removed)

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
| #87 (#32a) | Supabase Auth hook + RLS policy update | ✅ Closed |
| #88 (#32b) | .env + import script hygiene | ✅ Closed |
| #89 (#32c) | supabaseReader.js dual-client refactor | ✅ Closed |
| #90 (#32d) | server.js auth middleware + endpoints | ✅ Closed |
| #91 (#32e) | public/login.html | ✅ Closed |
| #92 (#32f) | app.js + index.html auth guard + logout | ✅ Closed |
| #93 (#32g) | End-to-end auth test | ✅ Closed |
| #32 | Supabase Auth setup (parent) | ✅ Closed |
| #38 | Railway deploy | ✅ Closed |

---

## Build Order — Next Session

1. **New issue — Tighten RLS policies** ← NEXT
2. **#62 — RBAC role enforcement**
3. #63 — User Management UI
4. #96 — Tenant signup/onboarding flow

---

## Backlog (post-Railway, in priority order)

* #62 — RBAC / role enforcement (admin, resource_manager, executive)
* #63 — User Management UI (admin panel — depends on #62)
* #96 — Tenant signup/onboarding flow (new firm self-service — depends on #62/#63)
* #66 — Weekly snapshots
* #64 — Excel export/import (tenant onboarding)
* #77 follow-up — Edit Mode UX: evaluate auto-entering edit mode on cell click vs requiring explicit Edit button top-right. Current button feels unintuitive. Decide and implement.
* #79 — Remove duplicate available hours (footer vs header badge)
* #80 — Increase legend swatch size
* #81 — Fix favicon 404
* #82 — UAT skipped test cases from #17/#77 checklist
* #83 — Remove test toast button if still present
* #95 — Light mode toggle (low priority)
* #18-#28 — Full UAT after core features stable
* #53 — Header improvements (notifications, search, date range)
* #60 — Sidebar, Overview and keyboard navigation polish
* #65 — Refresh button visibility in sidebar footer
* #94 — UAT web UI in Supabase (distant roadmap — idea label)

---

## Key Technical Decisions

* Capacity threshold = 45h/week
* Hours/Week input max = 100
* Supabase write-back: upsertAssignment() uses native upsert with onConflict: 'consultant_id,project_id,week_ending'
* SSE: named events (event: data-updated) — NOT default 'message' event. Fires on broadcastSSE() after DB writes
* Utilization = full date range calculation, not single week
* Toast duration = 8000ms, click to dismiss
* Conflict banner: amber (#F59E0B), appears above save bar when pending edits + data updated externally
* claudeService.js system prompt: always restart server after editing — prompt is loaded at startup
* Multi-skill matching: any-match (consultant needs ANY of the need's skill sets, not all)
* Primary skill set for display: first Practice Area in consultant's skill set list
* Bug logging: batch create gh issues at end of testing
* trust proxy: app.set('trust proxy', 1) — required for Railway + secure cookies
* Session: express-session, httpOnly, secure in prod, 8-hour maxAge, MemoryStore (wiped on restart by design)
* ExcelJS: fully removed — app has zero Excel dependencies
* Dead code removed: claudeService.js test block that referenced deleted excelReader.js

---

## Railway Deploy Checklist

- [ ] Create Railway project → connect GitHub repo (varunprabhakar81/staffing-app)
- [ ] Set all 7 env vars in Railway dashboard (see Environment Variables section above)
- [ ] Generate a NEW SESSION_SECRET for prod (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
- [ ] Deploy — Railway auto-detects Node.js, runs npm start
- [ ] Verify: Railway URL → redirects to login.html
- [ ] Verify: login with real credentials → all 4 tabs load with data
- [ ] Verify: make a heatmap edit → save → hard refresh → change persists
- [ ] Verify: logout → redirects to login.html
- [ ] Close #38

---

## CC Workflow Reminder

```
cd staffing-app
taskkill /F /IM node.exe   # Terminal 2 only, never in CC terminal
claude                      # Terminal 1 — start Claude Code
node server.js              # Terminal 2 — restart server after changes
```

Staffing Intelligence App — Chat Handoff Document
Last updated: #32 auth complete (login page, session auth, requireAuth middleware) — #38 Railway deploy next

What This App Is
Staffing Intelligence — a real-time staffing management platform for Varun's NetSuite consulting practice at Deloitte.

* Local web app at http://localhost:3000
* Node.js + Express backend, plain HTML/CSS/JS frontend
* Claude API (claude-sonnet-4-20250514) for AI features
* Supabase (Postgres) as data backbone — Excel fully retired
* 25 real employees, real project data
* GitHub: https://github.com/varunprabhakar81/staffing-app (private)

Tech Stack

* server.js — Express backend + all API endpoints
* supabaseReader.js — Supabase data layer (replaces excelReader.js)
* claudeService.js — Claude API integration
* public/index.html, app.js, styles.css — frontend
* public/login.html — login page (dark theme, email/password form)
* import-to-supabase.js — one-time Excel import script (keep for re-runs)
* data/resourcing.xlsx — gitignored, kept for reference only (no longer used)
* express-session + cookie-parser: server-side sessions (httpOnly cookie, 8-hour maxAge)
* Supabase dual-client: serviceClient (service role key, import only) + anonClient (per-request JWT for RLS)
* SESSION\_SECRET in .env, SUPABASE\_ANON\_KEY in .env

Environment Variables (.env — required, all present and verified)
ANTHROPIC\_API\_KEY=your-key (rotated this session)
PORT=3000
SUPABASE\_URL=https://pybmpknumxshailjatok.supabase.co
SUPABASE\_SERVICE\_KEY=sb\_secret\_... (service role — server-side only, import + admin)
SUPABASE\_ANON\_KEY=sb\_anon\_... (anon/public key — used per-request with JWT for RLS)
TENANT\_ID=9762ee19-e1d1-48db-bc57-e96bee9ce2f8
SESSION\_SECRET=long-random-string (express-session signing secret)

Design System

* Dark theme: #0F1117 page bg, #1A1D27 cards
* Pastel palette: Blue #A8C7FA, Mint #A8E6CF, Coral #FFB3B3, Yellow #FFF3A3, Purple #C9B8FF
* Inter font, white primary, #8892B0 secondary
* Left sidebar: 220px, collapsible to 56px

Supabase Schema (10 tables)
All tables except tenants have tenant\_id + RLS policy: tenant\_id = current\_setting('app.current\_tenant\_id')::uuid

|Table|Purpose|
|-|-|
|tenants|Master firm registry (unrestricted — server-managed)|
|levels|Consultant levels with rates + utilization targets|
|skill\_sets|Skills typed as Practice Area or Technology|
|clients|Client registry|
|projects|Project definitions with status + pipeline probability|
|consultants|Consultant roster with location + rate overrides|
|consultant\_skill\_sets|Junction: consultants ↔ skill\_sets (many-to-many)|
|resource\_assignments|Weekly hours per consultant per project|
|needs|Staffing needs (open roles)|
|need\_skill\_sets|Junction: needs ↔ skill\_sets (many-to-many)|

Key schema decisions:

* Levels: Analyst, Consultant, Senior Consultant, Manager, Senior Manager, Partner/Principal/Managing Director
* Skill types: Practice Area (Procure to Pay, Order to Cash, Record to Report, Supply Chain) + Technology (NetSuite, Ivalua, Emburse, Program Manager)
* Project status: Proposed / Verbal Commit / Sold
* Probability: auto-set by status trigger (25/75/100), overridable per project
* Needs coverage: unmet / partially\_met / fully\_met — computed at query time, separate from pipeline status
* is\_billable on resource\_assignments: mandatory, no default
* Rates on levels (seeded): cost + bill rate. Overridable per consultant (null = use level default)
* target\_billable\_pct on levels: Analyst/Consultant 80%, SC 75%, Manager 70%, SM 60%, PPMD 50%
* consultant\_effective\_rates view: resolves COALESCE(consultant override, level default)
* Tenant ID: 9762ee19-e1d1-48db-bc57-e96bee9ce2f8

Seeded Rate Data

|Level|Cost/hr|Bill/hr|Target Billable %|
|-|-|-|-|
|Analyst|$150|$450|80%|
|Consultant|$200|$550|80%|
|Senior Consultant|$300|$750|75%|
|Manager|$350|$788|70%|
|Senior Manager|$400|$800|60%|
|Partner/Principal/Managing Director|$600|$1,050|50%|

Non-Billable Projects (flagged at import)
Unassigned, Assessment, Evaluation, ERP Evaluation, L2C Assessment, Secondment, Pre-Sales Support

Data Model (confirmed)

* resource\_assignments: one row per consultant per project per week\_ending. 40 active rows (4 all-zero rows from Excel correctly excluded on import). Capacity = 45h/week.
* needs: 8 unfilled project staffing needs. level + skill\_sets + date range + hours/week. No names.
* Matching: consultant is a candidate if level matches AND consultant has ANY of the need's required skill sets AND total booked hours ≤ (45 - demand hours needed) during the date range.
* Coverage status: Unmet / Partially Met / Fully Met — computed at query time.
* Pipeline status: Proposed / Verbal Commit / Sold — stored on projects table.

Business Direction

* Target market: small professional services firms (10-100 people)
* Monetization: white-label SaaS, $200-500/month per firm
* Architecture: multi-tenant Supabase (Postgres) with Row Level Security
* Each firm isolated via tenant\_id on every table + RLS policies
* Onboarding: firm signs up → uploads Excel → data imported into their tenant

Current App State

* 4 tabs: Overview, Staffing, Needs, Ask Claude
* Overview: KPI cards, utilization by level, overallocation warning with tooltip + drilldown, top projects, rolling off soon, needs attention
* Staffing: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling, hybrid edit mode
* Edit Mode: solid blue button top-right, Quick Fill bar, inline cell editing, Save/Cancel bar, amber conflict banner
* Needs: donut chart + expandable rows with AI match panel. Shows pipeline status (Proposed/Verbal Commit/Sold) + coverage status (Unmet/Partial/Fully Met)
* Ask Claude: dynamic suggested questions, text input, markdown responses
* SSE auto-refresh: fires after successful DB writes (broadcastSSE), pushes data-updated event to all clients
* chokidar removed — no longer watching Excel file
* Login page at /login.html — dark theme, email/password form, session-based auth
* Auth guard on app load — app.js redirects to /login.html if no active session
* Logout button in sidebar — calls /api/logout, clears session, redirects to login
* requireAuth middleware on all /api/\* routes — 401 if no session
* Server-side sessions via express-session: httpOnly cookie, 8-hour maxAge, SESSION\_SECRET from .env

Hygiene Status (completed this session)
✅ Anthropic API key rotated
✅ TENANT\_ID added to .env
✅ Dead files deleted: excelReader.js, create-sample-data.js, importRealData.js, scripts/dedup-supply.js, CONVERSATION-SUMMARY.md, 5 x server\_\*.log
✅ chokidar uninstalled from package.json
✅ .gitignore updated: added .claude/, CONVERSATION-SUMMARY.md
✅ TASKS.md rewritten: Phase 10 → Supabase, #29-#31/#40/#41 marked complete with correct descriptions
✅ 40 supply rows confirmed correct (4 all-zero Excel rows correctly excluded at import)
✅ Server confirmed clean startup: 40 supply rows, 8 demand rows

Issues Completed

|Issue|Title|Status|
|-|-|-|
|#29|Supabase: schema setup|✅ Closed|
|#30|Supabase: Excel → import script|✅ Closed|
|#31|Supabase: swap backend data layer|✅ Closed|
|#17|Auto-refresh when data changes (SSE)|✅ Closed|
|#67|Refresh button relocate/remove|✅ Closed|
|#77|Merge Manage into Staffing: Hybrid Edit Mode|✅ Closed|
|#84|Terminology rename Supply/Demand → Resources/Projects|✅ Closed|
|#32|Supabase Auth — full session auth implementation|✅ Closed|
|#32a|Login page (dark theme, email/password)|✅ Closed|
|#32b|/api/login endpoint — Supabase signInWithPassword|✅ Closed|
|#32c|express-session setup (httpOnly cookie, 8h maxAge)|✅ Closed|
|#32d|requireAuth middleware on all /api/\* routes|✅ Closed|
|#32e|Auth guard in app.js — redirect to /login.html if no session|✅ Closed|
|#32f|Logout button in sidebar + /api/logout endpoint|✅ Closed|
|#32g|Supabase dual-client: serviceClient + anonClient with per-request JWT|✅ Closed|

Build Order — Next Session

1. \#38 — Railway deploy ← NEXT

   * Deploy to Railway (Node.js service)
   * Set all .env vars in Railway dashboard
   * Verify login + auth flow in production
   * Point custom domain if needed
2. New issue — Tighten RLS policies (after deploy confirmed working)

Backlog (do after Supabase auth)

* Partner/MD → Partner/Principal/Managing Director: audit public/ files for any remaining old label
* \#79 — Remove duplicate available hours (footer vs header badge)
* \#80 — Increase legend swatch size
* \#81 — Fix favicon 404
* \#82 — UAT skipped test cases from #17/#77 checklist
* \#83 — Remove test toast button if still present
* \#18-#28 — Full UAT after core features stable
* \#62/#63 — RBAC/User Management (after Supabase auth)
* \#66 — Weekly snapshots (after Supabase)
* \#64 — Excel export/import
* \#53 — Header improvements (notifications, search, date range)
* \#60 — Sidebar, Overview and keyboard navigation polish
* \#65 — Refresh button visibility in sidebar footer

Key Technical Decisions

* Capacity threshold = 45h/week
* Hours/Week input max = 100
* Supabase write-back: upsertAssignment() in supabaseReader.js handles insert-or-update per week row
* SSE: named events (event: data-updated) — NOT default 'message' event. Fires on broadcastSSE() after DB writes
* Utilization = full date range calculation, not single week
* Toast duration = 8000ms, click to dismiss
* Conflict banner: amber (#F59E0B), appears above save bar when pending edits + data updated externally
* claudeService.js system prompt: always restart server after editing — prompt is loaded at startup
* Multi-skill matching: any-match (consultant needs ANY of the need's skill sets, not all)
* Primary skill set for display: first Practice Area in consultant's skill set list
* Bug logging: batch create gh issues at end of testing

CC Workflow Reminder
cd staffing-app
taskkill /F /IM node.exe   # Terminal 2 only, never in CC terminal
claude                      # Terminal 1 — start Claude Code
node server.js              # Terminal 2 — restart server after changes


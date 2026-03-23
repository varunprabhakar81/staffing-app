Staffing Intelligence App — Chat Handoff Document
Last updated: Session 9 complete — inline editing pivot (#77), Float/Linear redesign, #101 User Management, B1/B2/B7 bugs fixed, #106–116 GitHub issues created. Next: #112 → #107 → #109 → #105 → #96

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

## ⚡ KEY DESIGN PIVOT: No Explicit Edit Mode (Session 9)

**The Edit Mode button is gone. Do not add it back.**

Previous design: users had to click a "Edit Mode" button to enable cell editing on the heatmap. This felt unintuitive — research into Float, Airtable, and Linear showed that the best resource management SaaS tools use always-on inline editing.

**New design (Airtable/Float model):**
* Cells are always editable for admin and resource_manager — single click enters edit inline
* No mode toggle, no button, no state variable called `_editMode` or `editMode`
* The `_hmCanEdit()` function controls access — returns true for admin/resource_manager only
* project_manager and executive see read-only cells — no hover effect, no input on click
* Pending changes tracked in `_pendingStaffing` map (key = "consultantId_projectId_weekKey")
* Amber dot (3px, #F59E0B) on cells with unsaved changes
* Floating save bar appears at bottom only when `_pendingStaffing.size > 0`
* Save bar: "X unsaved change(s)" label | Discard button | Save All button
* SSE fires while edits pending → toast appears, heatmap NOT overwritten
* Quick Fill bar shows when any row is expanded (`_hmExpanded.size > 0`), hidden otherwise

**Total row cells are NOT editable:**
* Cells with `data-cell-type="emp-total"` are read-only for all roles
* Clicking a Total cell auto-expands the consultant row and shows a pill tooltip: "Total is calculated — edit the rows below"
* Tooltip auto-dismisses after 2000ms or on outside click
* Cursor: default on Total cells, no hover effect

**Removed entirely:**
* `_editMode` boolean variable
* `toggleEditMode()` function
* `#hmEditToggle` button element
* `#conflictBanner` fixed div (replaced by toast)
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
| Edit Mode button | ~~✅~~ | ~~✅~~ | — | — | ← REMOVED — no longer exists |

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
* Reactivate — sets ban_duration: 'none'
* Resend Invite — POST /api/admin/users/:id/resend-invite (invited users only)
* Cancel Invite — DELETE /api/admin/users/:id/invite — calls deleteUser on unconfirmed accounts only

Status detection:
* last_sign_in_at === null AND not banned → status: 'invited'
* banned_until is set → status: 'deactivated'
* Otherwise → status: 'active'

Status pill colors:
* active: green (#10B981, bg #052E16)
* invited: amber (#F59E0B, bg #451A03)
* deactivated: gray (#6B6F76, bg #1A1D27)

Deactivated section:
* Separate collapsible section below active users, collapsed by default
* Divider label: "DEACTIVATED USERS" in muted uppercase
* Deactivated rows: opacity 0.45, only Reactivate action visible

Password complexity rules (client + server enforced):
* Min 12 characters
* At least 1 uppercase, 1 lowercase, 1 number, 1 special character
* Regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/

Role pill colors: admin=purple(#C9B8FF), resource_manager=blue(#A8C7FA), project_manager=mint(#A8E6CF), executive=yellow(#FFF3A3)

Note: Resend Invite requires custom SMTP in Supabase for production (Resend or SendGrid recommended — free tier hits rate limits quickly).

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

## Design System (updated Session 9 — Float/Linear)

**Philosophy: Float/Linear-inspired. Color as accent, not flood fill. Interactions precise and lightweight.**

* Page bg: #0F1117
* Card bg: #1A1D27
* Cell bg (uniform): #161820
* Sub-row bg: #13151C
* Total row bg: #0F1117
* Editing cell bg: #1E2130

**Utilization — left border accent system (3px):**
* Bench (0h, within horizon): border #EF4444, text rgba(239,68,68,0.6)
* Bench (0h, beyond 8-week horizon): border neutral #3A3D4A, text #3A3D4A
* Under (1-39h): row tint rgba(99,102,241,0.08) + border #6366F1 (indigo)
* Nominal (40-44h): row tint rgba(16,185,129,0.07) + border #10B981 (green)
* Full (45h): border #F59E0B (amber)
* Over (46-50h): border #EF4444 (red)
* Over+ (51h+): border #DC2626 (deep red)

**Current week column:** class `hm-col-current` — background rgba(59,130,246,0.06), header color #93C5FD

**Typography:**
* Consultant names: #E2E8F0, font-weight 500, 13px
* Section headers (MANAGER, SENIOR CONSULTANT): #4A4D5A, 10px, uppercase, letter-spacing 0.1em
* Column headers: #6B6F76, 11px, uppercase, letter-spacing 0.05em
* Sub-row project names: #6B6F76, 12px (not italic)
* Total row label: #4A4D5A, 11px, uppercase

**Hover:** rgba(255,255,255,0.04) — barely perceptible. No dramatic color change.
**Edit focus ring:** 1.5px solid #3B82F6
**Pending dot:** 3px amber dot top-right corner of cell
**Pending cell:** 1.5px solid #F59E0B outline (no flood fill, row tint shows through)

**Tooltip (#hmTooltip):** white card — background #FFFFFF, color #111827, border rgba(0,0,0,0.08), shadow 0 4px 16px rgba(0,0,0,0.3), z-index 200. Positioned above hovered cell using fixed positioning + getBoundingClientRect().

**Save bar:** #13151C bg, border-top rgba(255,255,255,0.08), border-left 3px solid #F59E0B, no shadow.
**Primary button:** #3B82F6 bg, white text.
**Ghost button:** border rgba(255,255,255,0.12), text #9CA3AF.
**Legend:** 3px × 14px vertical bar swatches (`.hm-swatch-bar`), text #6B6F76, 11px.

---

## Current App State

* Login page at /login.html — dark theme, email/password, inline error handling
* Auth guard on app load — redirects to login.html if no session
* Logout button at bottom of left sidebar
* Favicon: public/favicon.svg — "S" lettermark, #3B82F6 on #0F1117
* 5 tabs: Overview, Staffing, Needs, Ask Claude, Settings (admin only)
* Overview: KPI cards, utilization by level, overallocation warning with tooltip + drilldown, top projects, rolling off soon, needs attention
* Staffing: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling
  * Always-on inline editing (Airtable/Float model) — NO Edit Mode button
  * Row tints by utilization tier, left border accent system
  * Horizon-aware bench red (only within 8 weeks of today)
  * Current week column highlighted in blue
  * Quick Fill bar visible when any row expanded
  * Floating save bar with amber left accent when pending changes exist
  * Total row cells: click → expand row + pill tooltip "Total is calculated — edit the rows below"
* Needs: donut chart + expandable rows with AI match panel. Shows pipeline status + coverage status
* Ask Claude: dynamic suggested questions, text input, markdown responses
* Settings: User Management UI — active/invited/deactivated status pills, resend/cancel invite, collapsible deactivated section (admin only)
* SSE auto-refresh: fires after successful DB writes (broadcastSSE), pushes data-updated event to all clients. If pending edits exist when SSE fires → toast appears, heatmap NOT overwritten
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
| #77 | Inline editing pivot — always-on, no Edit Mode button | ✅ Closed |
| #79 | Duplicate available hours | ✅ Closed — not reproduced, clean |
| #80 | Legend swatch size | ✅ Closed — replaced with bar swatches |
| #81 | Favicon 404 | ✅ Closed — favicon.svg added |
| #84 | Terminology rename Supply/Demand → Resources/Projects | ✅ Closed |
| #87–#93 | Supabase Auth setup (parent #32) | ✅ Closed |
| #38 | Railway deploy | ✅ Closed |
| RLS | RLS tightening — WITH CHECK + tenants lockdown | ✅ Closed |
| #62 | RBAC role enforcement | ✅ Closed |
| #63 | User Management UI | ✅ Closed |
| #101 | User Management — Invited status + Deactivated section | ✅ Closed |
| B1 | RBAC guards added to /api/supply and /api/employees | ✅ Fixed |
| B2 | Heatmap end date now dynamic (today + 90 days rolling) | ✅ Fixed |
| B7 | Temp password field masked (type=password + eye toggle) | ✅ Fixed |
| B-isBillable | isBillable now passed correctly on save — non-billable projects no longer flipped | ✅ Fixed |

---

## Build Order — Next Session

### Immediate (start here):
1. **#112** — Replace alert() with showToast() in saveAllAssignments and applyQuickFill — 15 min
2. **#107** — Add try/catch to changeUserRole, deactivateUser, reactivateUser — 20 min
3. **#109** — Fix isBillable defaulting to true for new assignments at server.js:590
4. **#113** — Add success toast after reactivateUser (silent reload is inconsistent)
5. **#105** — Role gating UAT — test all 4 roles end to end in browser

### Soon (next 2–3 sessions):
* **#96** — Tenant onboarding flow (new firm self-service signup) — depends on #62/#63 ✅
* **#102** — Email verification flow for invited users
* **#103** — Password strength policy in Supabase Auth dashboard
* **#104** — Settings tab styling inconsistencies
* **#110** — Wire header search bar (currently non-functional)
* **#111** — Wire date range selector on heatmap (fires events nobody listens to)
* **#114** — Deactivated section expand default logic
* **#115** — Tooltip on disabled role select for invited users

### Later (backlog):
* **#99** — Multi-role support + role toggle UI
* **#97** — Extended roles: consultant, finance, recruiter
* **#98** — Finance and Ops Dashboard
* **#100** — User Management access enhancements
* **#66** — Weekly snapshots
* **#64** — Excel export/import
* **#106** — Year-boundary week upsert bug (getFullYear vs weekKeyToDate)
* **#108** — Bell badge hardcoded to 4
* **#116** — Document RBAC matrix for extended roles in HANDOFF
* **D1** — Session role staleness (user keeps old role mid-session until re-login)

---

## Backlog (full GitHub issue list)

| Issue | Title | Priority | Effort |
|---|---|---|---|
| #96 | Tenant signup/onboarding flow | High | Medium |
| #105 | Role gating UAT — all non-admin roles | High | Small |
| #107 | Missing try/catch in user role functions | Medium | Small |
| #109 | isBillable defaults true for new assignments | Medium | Small |
| #112 | Replace alert() with showToast() | Low | Small |
| #113 | Success toast after reactivateUser | Low | Small |
| #102 | Email verification flow for invited users | Medium | Medium |
| #103 | Password strength — Supabase policy | Medium | Small |
| #104 | Settings tab styling inconsistent | Low | Small |
| #110 | Wire header search bar | Medium | Medium |
| #111 | Wire date range selector | Medium | Medium |
| #114 | Deactivated section expand default | Low | Small |
| #115 | Tooltip on disabled role select | Low | Small |
| #99 | Multi-role support + role toggle UI | Low | Large |
| #97 | Extended Roles — consultant, finance, recruiter | Low | Large |
| #98 | Finance and Ops Dashboard | Low | Large |
| #100 | User Management — access enhancements | Low | Small |
| #66 | Weekly snapshots | Low | Medium |
| #64 | Excel export/import | Low | Medium |
| #106 | Year-boundary week upsert bug | Medium | Small |
| #108 | Bell badge hardcoded to 4 | Low | Small |
| #116 | Document RBAC matrix for extended roles | Low | Small |
| #95 | Light mode toggle | Low | Medium |

---

## Key Technical Decisions

* **No Edit Mode toggle** — heatmap cells always editable for admin/resource_manager. `_hmCanEdit()` is the single gating function. Never add an editMode boolean back.
* **Pending changes variable name:** `_pendingStaffing` (not `pendingChanges`) — check this if searching for pending edit logic
* **Total row cells:** `data-cell-type="emp-total"` attribute. Guards at top of `hmCellClick` and `hmSubCellClick` return early for these cells. Never make them editable.
* **Capacity threshold:** 45h/week
* **Hours/Week input max:** 100
* **Heatmap end date:** today + 90 days, rounded to next Saturday — dynamic, never hardcoded
* **Bench tint horizon:** only within 8 weeks of today (today + 56 days cutoff). Beyond that, 0h cells are neutral dark (#161820), not red.
* **All read endpoints use serviceClient** — NOT user JWT. Required after RLS tightening. Do not revert. Affected: /api/dashboard, /api/heatmap, /api/ask, /api/suggested-questions, /api/manage, /api/recommendations, /api/supply, /api/employees. Only /api/save-staffing and /api/supply/update intentionally use req.session.token (write operations).
* **claudeService.js system prompt:** scoped to NetSuite consulting practice — levels, practice areas (P2P, O2C, R2R, Supply Chain), technologies (NetSuite, Ivalua, Emburse), pipeline statuses. Always restart server after editing — prompt loaded at startup.
* **Supabase write-back:** upsertAssignment() uses native upsert with onConflict: 'consultant_id,project_id,week_ending'
* **SSE:** named events (event: data-updated) — NOT default 'message' event. If SSE fires while _pendingStaffing.size > 0, show toast only — do NOT re-render heatmap.
* **Utilization:** full date range calculation, not single week
* **Toast duration:** 8000ms, click to dismiss
* **isBillable on save:** pulled from existing supply row via `row?.isBillable ?? true`. New assignments default to true — known gap (#109).
* **Invited user detection:** last_sign_in_at === null AND not banned → status: 'invited'
* **Cancel invite:** calls deleteUser — only on unconfirmed accounts (last_sign_in_at null). Returns 400 if already logged in.
* **Resend invite:** calls inviteUserByEmail — requires custom SMTP in Supabase for prod (Resend/SendGrid)
* **Multi-skill matching:** any-match
* **Primary skill set for display:** first Practice Area in consultant's skill set list
* **trust proxy:** app.set('trust proxy', 1) — required for Railway + secure cookies
* **Session:** express-session, httpOnly, secure in prod, 8-hour maxAge, MemoryStore (wiped on restart by design)
* **ExcelJS:** fully removed
* **Ban duration for deactivated users:** '87600h' (~10 years). Reactivate sets ban_duration: 'none'
* **Password complexity regex:** /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/
* **VALID_ROLES:** ['admin', 'resource_manager', 'project_manager', 'executive']

---

## Railway Deploy Checklist

- [ ] Verify latest commit is deployed (check Railway dashboard)
- [ ] Log out and back in on Railway after any JWT hook changes — sessions with stale tokens won't have role
- [ ] Set all 7 env vars in Railway dashboard
- [ ] Generate a NEW SESSION_SECRET for prod
- [ ] Verify: Railway URL → redirects to login.html
- [ ] Verify: login → all tabs load with data
- [ ] Verify: click a heatmap cell → input appears immediately (no Edit Mode button needed)
- [ ] Verify: make a heatmap edit → Save All → hard refresh → change persists
- [ ] Verify: logout → redirects to login.html
- [ ] Note: Resend Invite requires custom SMTP configured in Supabase Auth dashboard

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

---

## New Chat Starter Prompt

Paste this into a new Claude chat to resume:

```
You are my expert technical co-pilot helping me build Staffing Intelligence — a real-time staffing management platform for my NetSuite consulting practice at Deloitte, live at https://staffing-app-production.up.railway.app.

Rules:
- Always give me CC (Claude Code) prompts for everything — never ask me to open VS Code, run terminal commands manually, or edit files myself
- Use issue numbers to track work (#112, #107 etc)
- Never close an issue without browser verification or confirmed output
- Commit after every completed issue
- Be direct and push back when something is wrong
- The heatmap has NO Edit Mode button — cells are always editable for admin/resource_manager (Airtable/Float model). Do not add an Edit Mode toggle back under any circumstances.

Read HANDOFF_2.md in the repo root and give me a 5-bullet summary of current state, then confirm the first issue to tackle.
```

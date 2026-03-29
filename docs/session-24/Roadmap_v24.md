# Staffing Intelligence — Product Roadmap

Last updated: Session 24 · March 28 2026
Live app: https://staffing-app-production.up.railway.app
GitHub milestones: V1 Stable (#19 — cleared, tagged v1-stable) · Phase 2 (#20) · V3 (#22)

---

## Summary

| Phase | Issues | Est. effort |
|---|---|---|
| Active Sprint | — | ✅ Cleared (Session 13) |
| Soon | — | ✅ Cleared (Session 18) |
| V1 Stable | — | ✅ Cleared (Session 19), tagged v1-stable (Session 20) |
| Phase 2 | 7 open | ~35–50h |
| V3 | 14 open | ~85–110h |
| **Total** | **21 open** | **~120–160h** |

105 issues closed · V1 Stable complete · UAT 48/48 passed · Phase 2 in progress

---

## Active Sprint — ✅ Cleared (Session 13)

All Active Sprint issues closed and browser-verified.

---

## Soon — ✅ Cleared (Session 18)

All Soon issues closed and browser-verified.

---

## V1 Stable — ✅ Cleared (Session 19) · Tagged v1-stable (Session 20)

| # | Title | Type | Session | Notes |
|---|---|---|---|---|
| #123 | Session role staleness — stale JWT after role change | security | 19 | userSessionMap + apiFetch + 30s poll |
| #83 | Remove test toast button | chore | 19 | Never existed — closed n/a |
| #102 | Email verification flow for invited users | auth | 19 | Temp password only, SSO placeholder |
| #103 | Password strength enforcement for temp password | auth | 19 | Live checklist + server validation |
| #100 | User Management access enhancements | feat | 19 | Date Added already implemented |
| #116 | Document tab access matrix in HANDOFF | chore | 19 | RBAC matrix fully corrected |
| #133 | Projects tab | feat | 19 | Moved to V3 — major feature |
| #134 | Consultant panel row flash after save | polish | 19 | Scroll + amber flash |
| #135 | Location typeahead in profile editor | polish | 19 | Custom JS typeahead, no library |

---

## Session 20 — Completed

| # | Title | Type | Notes |
|---|---|---|---|
| #82 | Comprehensive UAT | qa | 48/48 passed — full app verified before real users |
| #137 (was #138) | Donut segment click filter | bug | Chart.js onClick fixed, canvas + legend both work |
| #138 (was #139) | Ask Claude data accuracy | bug | inWindow() rolling window fix — historical rows excluded |
| #139 (was #141) | Delaney O'Neil modal | bug | data-cid pattern — apostrophe names fixed |
| #136 | Polish — focus, flash, button visibility | polish | Search focus on underutilized cell, add project flash, ℹ button visible |
| #141b | Delaney cell editing | bug | data-cid extended to cell edit handlers |
| #139b | Ask Claude current week hours | bug | formatContext fixed to use current week not average |
| #142 | 4-tier availability-first color scheme | feat | Red 0–10h / Yellow 11–44h / Green 45h / Orange 46h+ |
| #143 | Rename Staffing → Resource Allocation | polish | Tab label, page title, internal refs |
| #144 | Consultant popup repositioned | bug | No longer covers consultant name |
| #145 | On Bench modal count mismatch | bug | Threshold mismatch fixed between KPI and modal |
| #149 | Rename Needs → Open Needs | polish | Tab label and page title updated |
| #150 | AI suggestion acceptance → persists to DB | bug | Accepted matches now upsert to resource_assignments |
| #151 | Delaney Settings panel edit fixed | bug | data-cid pattern applied to Settings consultants panel |

---

## Session 21 — Completed

| # | Title | Type | Notes |
|---|---|---|---|
| #154 | Hours-based utilization KPI + drilldown Overall Average fix | bug | Utilization = all booked hours / total available hours. Overall Average fixed in drilldown. |
| #138 | KPI card rework — Available Capacity % primary, reorder cards | enhancement | Available Capacity % = unbooked / total available. Cards reordered. |
| #139 | KPI drilldown modals — group consultants by level | enhancement | Consultant lists grouped by level with expandable sections in all drilldown modals |
| #140 | Rename "Utilization by Level" → "Upcoming Availability", invert metric | enhancement | Chart renamed + metric inverted to show unbooked hours |
| #141 | Rolling Off Soon drilldown — focused consultant modal | enhancement | drillRollingOff modal with Change Assignment CTA, hm-row-flash-amber |

---

## Session 22 — Completed

| # | Title | Type | Notes |
|---|---|---|---|
| #142 | Rename "Needs Attention" → "Overallocated Resources" + drilldown | enhancement | _overallocatedNavigate → navigateToEmployee(name). Heatmap navigation with hm-row-flash-amber. |
| #150 | AI suggestion acceptance persists to DB (RLS root causes fixed) | bug | acceptMatch() async. resolveConsultantId, resolveProjectId, upsertAssignment, deleteAssignments all use serviceClient. |
| #151 | Apostrophe in consultant name breaks Settings panel edit button | bug | data-cid pattern applied to Settings consultants panel. |
| #132 | Holistic UI/UX design pass | closed | Superseded by #154. |

---

## Session 23 — Completed

| # | Title | Type | Notes |
|---|---|---|---|
| #161 | Rolling Off Soon KPI — apostrophe in consultant name breaks modal click | bug | data-name pattern applied to Rolling Off Soon click handlers. |
| #160 | KPI drilldown modals — Available Capacity, Utilization %, On Bench open expanded + Expand/Collapse All | enhancement | All three modals open expanded by default. Expand/Collapse All button left-aligned above rows. |
| #155 | Rolling Off Soon panel — cap at 4 rows + View all (N) link | enhancement | Panel capped at 4 rows. "View all (N)" triggers drillAllRollingOff() full list modal. |
| #157 | AI acceptance 0h overwrite bug | bug | Date range guard: weeks outside engagement start/end not written. No 0h rows in Supabase. |
| #158 | Recommendations engine misses valid consultant matches | bug | allSkillSets.includes(need.skillSet) any-match. empWeekMap stores allSkillSets array. Benjamin Liu correctly surfaced for R2R Consolidation. |
| #159 | Consultant skill sets not consistently resolved at load time | bug | Closed as part of #158. allSkillSets consistently resolved in supabaseReader.js. |
| #146 | Enter key navigation in heatmap cells | polish | While loop skips consultants with no project sub-rows. Escape restores pending value. Polling pattern (setInterval 50ms, 20 attempts). |
| #147 | Search bar visual enhancement | polish | Elevated border, focus ring, rightward expansion on focus. |
| #148 | Clicking consultant name → profile modal (not expand) | enhancement | data-cid on td. Name span → openConsultantProfileEditor(). Chevron span → toggleHmExpand(). |

---

## Session 24 — Completed

| # | Title | Type | Notes |
|---|---|---|---|
| #152 | Settings UX — skill modal source routing, clickable names, Smart Discard | enhancement | 3 parts: openSkillSetModal source param; consultant/user names clickable in Settings panels; dirty-state tracking with amber strip + abort-after-hide pattern for one-click discard |
| #153 | Group consultants panel by level, user management panel by role | enhancement | LEVEL_ORDER grouping for consultants; ROLE_ORDER grouping for users; _renderSettingsGroupHeader() helper |
| — | Tab labels verified: Resource Allocation + Open Needs | polish | Nav labels confirmed and fixed in index.html |
| — | GitHub issues audit — 27 stale/completed issues closed | chore | 15 completed-but-not-closed + 11 pre-Supabase stale; #145 re-milestoned to V3 |
| — | GitHub Project board #4 — Staffing Intelligence Build Board | chore | All 18 open issues added, board view created |
| #162 | Epic: Create and manage staffing demand — projects + open needs CRUD | epic | Parent issue with links to #163 and #164 |
| #163 | Create and edit projects — new project form with status, client, date range | feature | Child of #162 |
| #164 | Create, edit, and close staffing needs — full Open Needs CRUD | feature | Child of #162 |
| #165 | Settings tab — sectioned nav menu (Users, Consultants, future admin panels) | enhancement | |
| — | Full GitHub label taxonomy overhaul — 25 labels across 4 dimensions | chore | type:*, priority:p0–p3, effort:xs–xl, area:* — applied to all 21 open issues |

---

## Phase 2 — Core Quality & UX (7 remaining)

### Priority order

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #156 | Open Needs — filter/hide Fully Met rows by default, with toggle | enhancement | 1–2h | effort:s |
| #165 | Settings tab — sectioned nav menu (Users, Consultants, future admin panels) | enhancement | 1–2h | effort:s |
| #163 | Create and edit projects — new project form | feature | 3–6h | effort:m, child of #162 |
| #164 | Create, edit, and close staffing needs — full Open Needs CRUD | feature | 6–12h | effort:l, child of #162 |
| #162 | Epic: Create and manage staffing demand | epic | 12h+ | effort:xl, gate for #163 + #164 |
| #154 | Holistic UI/UX design pass (Phase 2 scoped) | polish | — | effort:l, absorbs SB-2, SB-4, SB-7 |
| #129 | Historical staffing snapshots + time-travel view | feat | 8–12h | effort:xl, supersedes #121 |

---

## V3 — Scale, Multi-tenancy, Integrations & Monetization

14 issues. None ship until tenant onboarding (#96) is complete — that is the V3 gate.

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #96 | Tenant onboarding + signup flow — new firm self-service registration | epic | 12–16h | V3 gate |
| #97 | Extended Roles — consultant, finance, recruiter | feat | 4h | Depends on #96 |
| #98 | Finance and Ops Dashboard — rates, margin, billing | feat | 8–12h | Depends on #97 |
| #99 | Multi-role support + role toggle UI | feat | 6–8h | Depends on #96 |
| #117 | Role switching — users with multiple roles can switch active role per session | feat | — | |
| #118 | Audit log — track all write actions by user and active role | feat | — | |
| #133 | Projects tab — project-centric staffing view with consultant assignments | feat | 6–8h | |
| #131 | Heatmap inline filter — filter by project when navigating from Overview | feat | — | |
| #136 | Consultant panel — in-place row update after save (no full reload) | polish | 2–3h | |
| #145 | On Bench modal count mismatch (re-milestoned to V3) | bug | — | Minor, low priority |
| #95 | Light mode toggle — theme switcher for user preference | feat | 3–4h | |
| #64 | Export and Import Excel for Supply and Needs data | feat | 4–6h | |
| #43 | Toggl Track Integration — Automatic Time Tracking | integration | — | |
| #94 | UAT Web UI — Migrate UAT tracker to Supabase + build testing mode UI | qa | — | |

---

## Completed issues

| Issue | Title | Session |
|---|---|---|
| #29 | Supabase schema setup | 2 |
| #30 | Supabase Excel import script | 2 |
| #31 | Supabase swap backend data layer | 3 |
| #17 | Auto-refresh SSE | 4 |
| #67 | Refresh button relocate | 4 |
| #77 | Merge Manage into Staffing: Hybrid Edit Mode | 5 |
| #84 | Terminology rename Supply/Demand | 6 |
| #87–#93 | Supabase Auth setup (#32) | 7 |
| #38 | Railway deploy | 8 |
| RLS | RLS tightening | 8 |
| #62 | RBAC role enforcement | 9 |
| #77 | Edit Mode removed (Airtable model) | 9 |
| #63 | User Management UI | 10 |
| B1 | RBAC guards on /api/supply and /api/employees | 10 |
| B2 | Heatmap end date dynamic | 10 |
| #101 | User Management invited/deactivated | 11 |
| B7 | Temp password field masked | 11 |
| B-isBillable | isBillable passed correctly on save | 11 |
| #112 | Replace alert() with showToast() | 12 |
| #107 | try/catch on role/deactivate/reactivate | 12 |
| #113 | Success toast after reactivateUser | 12 |
| #105 | Role gating UAT — all 4 roles verified | 12 |
| B-save | serviceClient fix for write routes | 12 |
| #109 | Fix isBillable defaulting to true for new assignments | 13 |
| #122 | Executive overview — Projects with Most Utilization | 13 |
| #108 | Bell notification badge hardcoded to 4 | 13 |
| #106 | Year-boundary week upsert | 13 |
| #127 | Success toast after heatmap Save All | 13 |
| #120 | Wire search input — global typeahead navigator | 14 |
| #121 | Week selector — closed, superseded by #129 | 14 |
| #104 | Settings tab styling inconsistencies | 14 |
| #114 | Deactivated section expand default logic | 14 |
| #115 | Tooltip on disabled role select | 14 |
| #128 | Total row expand + focus first cell | pre-15 |
| #61 | Comprehensive drilldown review + all 4 fixes | 15 |
| #124 | Add new project assignment to consultant from heatmap | 16 |
| #119 | Consultant profile editor — skill sets, level, details | 18 |
| #126 | Consultants management panel in Settings tab | 18 |
| #123 | Session role staleness | 19 |
| #83 | Remove test toast button (n/a) | 19 |
| #102 | Email verification flow for invited users | 19 |
| #103 | Password strength enforcement | 19 |
| #100 | User Management access enhancements (already done) | 19 |
| #116 | Document tab access matrix in HANDOFF | 19 |
| #134 | Consultant panel row flash after save | 19 |
| #135 | Location typeahead in profile editor | 19 |
| #82 | Comprehensive UAT — 48/48 passed | 20 |
| #137 | Donut segment click filter | 20 |
| #138 | Ask Claude data accuracy (inWindow fix) | 20 |
| #139 | Delaney O'Neil modal (data-cid) | 20 |
| #136 | Polish — focus, flash, button visibility | 20 |
| #141b | Delaney cell editing (data-cid extended) | 20 |
| #139b | Ask Claude current week hours fix | 20 |
| #142 | 4-tier heatmap color scheme | 20 |
| #143 | Rename Staffing → Resource Allocation | 20 |
| #144 | Consultant popup repositioned | 20 |
| #145 | On Bench modal count mismatch (re-milestoned to V3 in session 24) | 20 |
| #149 | Rename Needs → Open Needs | 20 |
| #150 | AI suggestion acceptance → DB | 20 |
| #151 | Delaney Settings panel edit fixed | 20 |
| #154 | Hours-based utilization KPI + drilldown Overall Average fix | 21 |
| #138 | KPI card rework — Available Capacity % primary, reorder cards | 21 |
| #139 | KPI drilldown modals — group consultants by level | 21 |
| #140 | Rename "Utilization by Level" → "Upcoming Availability", invert metric | 21 |
| #141 | Rolling Off Soon drilldown — focused consultant modal | 21 |
| #142 | Rename "Needs Attention" → "Overallocated Resources" + drilldown | 22 |
| #150 | AI suggestion acceptance — RLS root causes fixed (serviceClient) | 22 |
| #151 | Apostrophe in Settings panel edit button — data-cid fix | 22 |
| #132 | Holistic UI/UX design pass — closed, superseded by #154 | 22 |
| #161 | Rolling Off Soon apostrophe fix — data-name pattern | 23 |
| #160 | KPI drilldowns open expanded + Expand/Collapse All | 23 |
| #155 | Rolling Off Soon panel cap at 4 + View all (N) + drillAllRollingOff() | 23 |
| #157 | AI acceptance date range guard — no 0h rows outside engagement range | 23 |
| #158 | Recommendations any-skill matching — allSkillSets.includes() | 23 |
| #159 | Skill set schema consistency — closed as part of #158 | 23 |
| #146 | Enter key navigation in heatmap — down nav, skip empty rows, Escape restore | 23 |
| #147 | Search bar visual enhancement — elevated border, focus ring, rightward expansion | 23 |
| #148 | Consultant name → profile modal — chevron toggles row, name opens profile | 23 |
| #152 | Settings UX — skill modal routing, clickable names, Smart Discard | 24 |
| #153 | Group consultants panel by level, users panel by role | 24 |

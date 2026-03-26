# Staffing Intelligence — Product Roadmap

Last updated: Session 20 · March 26 2026
Live app: https://staffing-app-production.up.railway.app
GitHub milestones: V1 Stable (#19 — cleared, tagged v1-stable) · Phase 2 (#20)

---

## Summary

| Phase | Issues | Est. effort |
|---|---|---|
| Active Sprint | — | ✅ Cleared (Session 13) |
| Soon | — | ✅ Cleared (Session 18) |
| V1 Stable | — | ✅ Cleared (Session 19), tagged v1-stable (Session 20) |
| Phase 2 | ~27 open | ~150–180h |
| **Total** | **~27 open** | **~150–180h** |

59 issues closed · V1 Stable complete · UAT 48/48 passed

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
| #133 | Projects tab | feat | 19 | Moved to Phase 2 — major feature |
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

## Phase 2 — Scale & features

#96 is the gate — nothing else in Phase 2 ships without tenant onboarding.

### Priority order

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #96 | Tenant onboarding + signup flow | epic | 12–16h | Phase 2 gate |
| #138 | KPI card rework — Available Capacity % primary, reorder cards | enhancement | 2–3h | |
| #139 | KPI drilldown modals — group consultants by level | enhancement | 2–3h | |
| #140 | Rename "Utilization by Level" → "Upcoming Availability", invert metric | enhancement | 1–2h | |
| #141 | Rolling Off Soon drilldown — show only clicked consultant's row | enhancement | 2h | |
| #142 | Rename "Needs Attention" → "Overallocated Resources" + revisit drilldown | enhancement | 2–3h | |
| #146 | Enter key behavior when editing heatmap cells | polish | 1–2h | |
| #147 | Global search bar visual enhancement — separate from sidebar | polish | 1–2h | |
| #148 | Clicking consultant name → profile modal (not expand) | enhancement | 2–3h | |
| #145 | Week header modal — jump to consultant row or inline edit | enhancement | 2–3h | |
| #152 | Skill set pill click → modal showing all consultants with that skill | enhancement | 3–4h | |
| #153 | Group consultants panel by level, user management panel by role | enhancement | 2–3h | |
| #99 | Multi-role support + role toggle UI | feat | 6–8h | Depends on #96 |
| #98 | Finance and Ops Dashboard — rates, margin, billing | feat | 8–12h | Depends on #97 |
| #97 | Extended roles — consultant, finance, recruiter | feat | 4h | Depends on #96 |
| #133 | Projects tab — project-centric staffing view | feat | 6–8h | Moved from V1 Stable |
| #136 | Consultant panel in-place row update (no reload) | polish | 2–3h | |
| #132 | Holistic UI/UX design pass | polish | — | |
| #129 | Historical staffing snapshots + time-travel view | feat | 8–12h | Supersedes #121 |
| #131 | Heatmap inline filter — filter by project from Overview | feat | — | |
| #95 | Light mode toggle | feat | 3–4h | |
| #64 | Export and import Excel for supply and needs | feat | 4–6h | |
| #43 | Toggl integration | integration | — | |
| #117 | Role switching UI | feat | — | |
| #118 | Audit log | feat | — | |
| #94 | UAT testing mode | qa | — | |

### New Phase 2 issues logged Session 20 (GitHub #137–#153)

| GitHub # | Title | Label |
|---|---|---|
| #137 | On Bench modal count mismatch | bug |
| #138 | KPI card rework — Available Capacity as % primary, reorder cards | enhancement |
| #139 | KPI drilldown modals — group consultants by level with expandable sections | enhancement |
| #140 | Rename "Utilization by Level" → "Upcoming Availability" and invert metric | enhancement |
| #141 | Rolling Off Soon drilldown — show only clicked consultant's heatmap row | enhancement |
| #142 | Rename "Needs Attention" → "Overallocated Resources" and revisit drilldown | enhancement |
| #143 | Rename "Staffing" tab → "Resource Allocation" | polish |
| #144 | Consultant name popup covers the name on click | bug |
| #145 | Week header modal — add jump to consultant row or inline edit | enhancement |
| #146 | Enter key behavior when editing heatmap cells | polish |
| #147 | Global search bar visual enhancement — separate from sidebar | polish |
| #148 | Clicking consultant name in edit mode should open profile modal | enhancement |
| #149 | Rename "Needs" tab → "Open Needs" | polish |
| #150 | AI suggestion acceptance does not persist to database | bug |
| #151 | Delaney O'Neil edit button broken in Settings consultants panel | bug |
| #152 | Skill set pill click → modal showing all consultants with that skill | enhancement |
| #153 | Group consultants panel by level, user management panel by role | enhancement |

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
| #145 | On Bench modal count mismatch | 20 |
| #149 | Rename Needs → Open Needs | 20 |
| #150 | AI suggestion acceptance → DB | 20 |
| #151 | Delaney Settings panel edit fixed | 20 |

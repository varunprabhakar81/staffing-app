# Staffing Intelligence — Product Roadmap

Last updated: Session 19 · March 25 2026
Live app: https://staffing-app-production.up.railway.app
GitHub milestones: V1 Stable (#19 — cleared) · Phase 2 (#20)

---

## Summary

| Phase | Issues | Est. effort |
|---|---|---|
| Active Sprint | — | ✅ Cleared (Session 13) |
| Soon | — | ✅ Cleared (Session 18) |
| V1 Stable | — | ✅ Cleared (Session 19) |
| Phase 2 | 15 | ~88–105h |
| **Total** | **~15 open** | **~88–105h** |

44 issues closed · V1 Stable complete

---

## Active Sprint — ✅ Cleared (Session 13)

All Active Sprint issues closed and browser-verified.

---

## Soon — ✅ Cleared (Session 18)

All Soon issues closed and browser-verified.

---

## V1 Stable — ✅ Cleared (Session 19)

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

## Phase 2 — Scale & features

#82 first — comprehensive UAT before real users. #96 is the gate — nothing else in Phase 2 ships without tenant onboarding.

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #82 | Comprehensive UAT | qa | 3–4h | Do first — full interactive UAT widget pass |
| #96 | Tenant onboarding + signup flow | epic | 12–16h | Phase 2 gate |
| #99 | Multi-role support + role toggle UI | feat | 6–8h | Depends on #96 |
| #98 | Finance and Ops Dashboard — rates, margin, billing | feat | 8–12h | Depends on #97 |
| #97 | Extended roles — consultant, finance, recruiter | feat | 4h | Depends on #96 |
| #133 | Projects tab — project-centric staffing view | feat | 6–8h | Moved from V1 Stable |
| #136 | Consultant panel in-place row update (no reload) | polish | 2–3h | Logged Session 19 |
| #132 | Holistic UI/UX design pass | polish | — | |
| #129 | Historical staffing snapshots + time-travel view | feat | 8–12h | Supersedes #121 |
| #131 | Heatmap inline filter — filter by project from Overview | feat | — | |
| #95 | Light mode toggle | feat | 3–4h | |
| #64 | Export and import Excel for supply and needs | feat | 4–6h | |
| #43 | Toggl integration | integration | — | |
| #117 | Role switching UI | feat | — | |
| #118 | Audit log | feat | — | |
| #94 | UAT testing mode | qa | — | |

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

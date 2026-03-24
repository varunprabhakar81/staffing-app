# Staffing Intelligence — Product Roadmap v2

Last updated: Session 13 · March 24 2026
Live app: https://staffing-app-production.up.railway.app
GitHub milestones: Active Sprint (#17) · Soon (#18) · V1 Stable (#19) · Phase 2 (#20)
Progress: 30 issues closed · 72% of v1 complete

---

## Summary

| Phase | Issues | Est. effort | Status |
|---|---|---|---|
| Active Sprint | 0 | — | ✅ Cleared Session 13 |
| Soon | 11 | ~35–40h | Next up |
| V1 Stable | 7 | ~10h | Backlog |
| Phase 2 | 11 | ~72–85h | Future |
| Unmilesoned | 0 | — | Triage complete Session 13 |
| **Total open** | **29** | **~117–135h** | |

---

## Active Sprint — ✅ Cleared (Session 13)

All 5 issues closed and browser-verified in Session 13:

| Issue | Title | Commit |
|---|---|---|
| #109 | isBillable reads consultant default for new assignments | e2e112b |
| #122 | Executive overview projects missing — /api/heatmap now includes executive | b97ed4d |
| #108 | Bell badge hardcoded to 4 — changed to 0 | 7216fe3 |
| #106 | Year-boundary week upsert — weekKeyToDate from meta replaces getFullYear() | 4273b6f |
| #127 | Success toast after heatmap Save All | a1e879c |

---

## Soon — Polish & wiring (11 issues, ~35–40h)

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #120 | Wire employee/project search input | wiring | 2h | #110 confirmed closed as duplicate ✅ |
| #121 | Wire week selector dropdown on heatmap | wiring | 2h | #111 confirmed closed as duplicate ✅ |
| #104 | Settings tab styling inconsistencies | polish | 2h | |
| #114 | Deactivated section expanded by default | polish | 1h | |
| #115 | Tooltip on disabled role select for invited rows | polish | 1h | |
| #128 | Clicking consultant total row expands + focuses first cell | UX | 1–2h | Logged Session 13 |
| #61 | Comprehensive drilldown review across all tabs | polish | 3–4h | |
| #124 | Add new project assignment to consultant from heatmap | feat | 3–4h | Logged Session 13 |
| #119 | Consultant profile editor — skill sets, level, details | feat | 4–6h | Review vs #125 first |
| #125 | Consultant profile editor — is_billable, capacity, rate overrides | feat | 4–6h | Logged Session 13 — may be same as #119 |
| #126 | Consultants management panel in Settings tab | feat | 6–8h | Logged Session 13 |

---

## V1 Stable — Production hardening (7 issues, ~10h)

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #123 | Session role staleness — stale JWT after role change | security | 2h | Was D1. High priority — close before onboarding real users |
| #82 | UAT — complete skipped test cases | testing | 2h | |
| #83 | Remove test toast button from index.html | chore | 0.5h | |
| #102 | Email verification flow for invited users | auth | 2h | |
| #103 | Password strength enforcement for temp password | auth | 1h | |
| #100 | User Management access enhancements | feat | 2h | |
| #116 | Document tab access matrix in HANDOFF | chore | 0.5h | |

---

## Phase 2 — Scale & multi-tenancy (11 issues, ~72–85h)

#96 is the gate — nothing else in Phase 2 ships without tenant onboarding.

| # | Title | Type | Est. |
|---|---|---|---|
| #96 | Tenant onboarding + signup flow | epic | 12–16h |
| #99 | Multi-role support + role toggle UI | feat | 6–8h |
| #98 | Finance and Ops Dashboard — rates, margin, billing | feat | 8–12h |
| #97 | Extended roles — consultant, finance, recruiter | feat | 4h |
| #95 | Light mode toggle | feat | 3–4h |
| #66 | Store weekly staffing snapshots | feat | 6–8h |
| #64 | Export and import Excel for supply and needs | feat | 4–6h |
| #43 | Toggl Track integration — automatic time tracking | integration | 8–12h |
| #117 | Role switching — users with multiple roles can switch per session | feat | 4–6h |
| #118 | Audit log — track all write actions by user and role | feat | 6–8h |
| #94 | UAT testing mode UI | enhancement | 4–6h |

---

## Hygiene — Session 13 complete

| Task | Status |
|---|---|
| Confirm #110 duplicate of #120 | ✅ Closed #110 |
| Confirm #111 duplicate of #121 | ✅ Closed #111 |
| Batch triage 29 unmilesoned issues | ✅ Complete — 10 closed as done, 8 milestoned, 2 duplicates closed |

---

## Prioritization notes (Session 13)

- Active Sprint cleared — all 5 issues closed and browser-verified same session
- #122 elevated from low priority to Active Sprint — executive seeing broken data is a stakeholder credibility issue
- #108 elevated — hardcoded badge count visible to every user on every page load
- #123 (was D1) elevated from Phase 2 to V1 Stable — security gap before real user onboarding
- #124, #125, #126, #128 logged as net-new issues discovered during Session 13
- #119 in Soon pending duplicate review vs #125 — confirm before starting either
- 18 unmilesoned issues triaged, 10 stale/completed issues closed

---

## Completed issues (30 total, Sessions 1–13)

| Issue | Title | Session |
|---|---|---|
| #29 | Supabase schema setup | 2 |
| #30 | Supabase Excel import script | 2 |
| #31 | Supabase swap backend data layer | 3 |
| #17 | Auto-refresh SSE | 4 |
| #67 | Refresh button relocate | 4 |
| #77 | Merge Manage into Staffing: Hybrid Edit Mode | 5 |
| #84 | Terminology rename Supply/Demand | 6 |
| #87–#93 | Supabase Auth setup | 7 |
| #38 | Railway deploy | 8 |
| RLS | RLS tightening | 8 |
| #62 | RBAC role enforcement | 9 |
| #63 | User Management UI | 10 |
| #79 | Duplicate available hours | 10 |
| #80 | Legend swatch size | 10 |
| #81 | Favicon 404 | 10 |
| #101 | User Management invited/deactivated | 11 |
| B1 | RBAC guards on /api/supply and /api/employees | 11 |
| B2 | Heatmap end date dynamic | 11 |
| B7 | Temp password field masked | 11 |
| #112 | Replace alert() with showToast() | 12 |
| #107 | try/catch on role/deactivate/reactivate | 12 |
| #113 | Success toast after reactivateUser | 12 |
| #105 | Role gating UAT — all 4 roles verified | 12 |
| B-save | serviceClient fix — saves now persist | 12 |
| #109 | isBillable reads consultant default | 13 |
| #122 | Executive overview projects fixed | 13 |
| #108 | Bell badge hardcoded to 4 fixed | 13 |
| #106 | Year-boundary week upsert fixed | 13 |
| #127 | Save success toast added | 13 |
| #110 | Closed as duplicate of #120 | 13 |
| #111 | Closed as duplicate of #121 | 13 |

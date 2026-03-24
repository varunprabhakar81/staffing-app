# Staffing Intelligence — Product Roadmap

Last updated: Session 13 · March 24 2026
Live app: https://staffing-app-production.up.railway.app
GitHub milestones: Active Sprint (#17) · Soon (#18) · V1 Stable (#19) · Phase 2 (#20)

---

## Summary

| Phase | Issues | Est. effort |
|---|---|---|
| Active Sprint | 4 | ~6h |
| Soon | 8 | ~21–24h |
| V1 Stable | 5 | ~7.5h |
| Phase 2 | 7 | ~55–65h |
| Unmilesoned (needs triage) | 29 | — |
| **Total** | **50 open** | **~85h** |

---

## Active Sprint — Bug fixes & data integrity

Priority order. All must be browser-verified before closing.

| # | Title | Type | Est. |
|---|---|---|---|
| #109 | Fix isBillable defaulting to true for new assignments | data bug | 1h |
| #122 | Executive overview — Projects with Most Utilization shows no data | stakeholder bug | 1–2h |
| #108 | Bell notification badge hardcoded to 4 | visible defect | 1h |
| #106 | Year-boundary week upsert — getFullYear() not weekKeyToDate | data bug | 2h |

---

## Soon — Polish & wiring

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #120 | Wire employee/project search input (client-side keyup filter) | wiring | 2h | Confirm #110 is duplicate first |
| #121 | Wire week selector dropdown on heatmap | wiring | 2h | Confirm #111 is duplicate first |
| #104 | Settings tab styling inconsistencies | polish | 2h | |
| #114 | Deactivated section expanded by default | feat | 1h | |
| #115 | Tooltip on disabled role select for invited rows | feat | 1h | |
| #124 | Add new project assignment to consultant from heatmap | feat | 3–4h | |
| #125 | Consultant profile editor — is_billable, capacity, rate overrides | feat | 4–6h | |
| #126 | Consultants management panel in Settings tab | feat | 6–8h | |

Soon subtotal: ~21–24h

---

## V1 Stable — Production hardening

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #123 | Session role staleness — stale JWT after role change | security | 2h | Was D1. High priority — close before onboarding real users |
| #102 | Email verification flow for invited users | auth | 2h | |
| #103 | Password strength enforcement for temp password | auth | 1h | |
| #100 | User Management access enhancements | feat | 2h | |
| #116 | Document tab access matrix in HANDOFF | chore | 0.5h | |

---

## Phase 2 — Scale & multi-tenancy

#96 is the gate — nothing else in Phase 2 can ship without tenant onboarding.

| # | Title | Type | Est. |
|---|---|---|---|
| #96 | Tenant onboarding + signup flow | epic | 12–16h |
| #99 | Multi-role support + role toggle UI | feat | 6–8h |
| #98 | Finance and Ops Dashboard — rates, margin, billing | feat | 8–12h |
| #97 | Extended roles — consultant, finance, recruiter | feat | 4h |
| #95 | Light mode toggle | feat | 3–4h |
| #66 | Store weekly staffing snapshots | feat | 6–8h |
| #64 | Export and import Excel for supply and needs | feat | 4–6h |

---

## Hygiene — Pending before next session

| Task | Issues | Status |
|---|---|---|
| Confirm and close duplicate issues | #110 → #120, #111 → #121 | Pending |
| Batch triage 29 unmilesoned issues | See session_tracker.md | Pending |

---

## Prioritization notes (Session 13 review)

- **#122 moved up** from low priority into Active Sprint — executive role seeing broken data is a stakeholder credibility issue
- **#108 moved up** — hardcoded badge count is visible to every user on every page load and signals unfinished work during demos
- **#123 (was D1) elevated** from Phase 2 into V1 Stable — session role staleness is a security gap, not a nice-to-have
- **#110 and #111** are likely duplicates of #120 and #121 — confirm and close before starting work on either

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

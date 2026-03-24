# Staffing Intelligence — Product Roadmap

Last updated: Session 14 · March 24 2026
Live app: https://staffing-app-production.up.railway.app
GitHub milestones: Active Sprint (#17) · Soon (#18) · V1 Stable (#19) · Phase 2 (#20)

---

## Summary

| Phase | Issues | Est. effort |
|---|---|---|
| Active Sprint | — | ✅ Cleared (Session 13) |
| Soon | 11 | ~35–40h |
| V1 Stable | 7 | ~10h |
| Phase 2 | 11 | ~72–85h |
| Unmilesoned (needs triage) | 0 | Triage complete (Session 13) |
| **Total** | **~29 open** | **~117–135h** |

30 issues closed · 72% complete

---

## Active Sprint — ✅ Cleared (Session 13)

All Active Sprint issues closed and browser-verified.

| # | Title | Type | Session |
|---|---|---|---|
| #109 | Fix isBillable defaulting to true for new assignments | data bug | 13 |
| #122 | Executive overview — Projects with Most Utilization shows no data | stakeholder bug | 13 |
| #108 | Bell notification badge hardcoded to 4 | visible defect | 13 |
| #106 | Year-boundary week upsert — getFullYear() not weekKeyToDate | data bug | 13 |
| #127 | Success toast not appearing after heatmap Save All | ui bug | 13 |

---

## Soon — Polish & wiring

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #120 | Wire employee/project search input — global typeahead navigator | wiring | 2h | ✅ Done Session 14 |
| #121 | Wire week selector dropdown on heatmap | wiring | 2h | ✅ Closed Session 14 — superseded by #129 |
| #104 | Settings tab styling inconsistencies | polish | 2h | ✅ Done Session 14 |
| #114 | Deactivated section expand default | feat | 1h | ✅ Done Session 14 |
| #115 | Tooltip on disabled role select | feat | 1h | ✅ Done Session 14 |
| #128 | Clicking consultant total row expands + focuses first cell | feat | 1–2h | Start here |
| #61 | Comprehensive drilldown review | feat | 3–4h | |
| #124 | Add new project assignment to consultant from heatmap | feat | 3–4h | |
| #119 | Consultant profile editor overlap | triage | — | Review vs #125 before starting |
| #125 | Consultant profile editor — is_billable, capacity, rate overrides | feat | 4–6h | |
| #126 | Consultants management panel in Settings tab | feat | 6–8h | |

Soon subtotal: ~35–40h (5 closed, ~25–30h remaining)

---

## V1 Stable — Production hardening

| # | Title | Type | Est. | Note |
|---|---|---|---|---|
| #123 | Session role staleness — stale JWT after role change | security | 2h | Was D1. High priority — close before onboarding real users |
| #82 | UAT completion | qa | 2h | |
| #83 | Remove test toast button | chore | 0.5h | |
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
| #129 | Historical staffing snapshots + time-travel view (supersedes #121) | feat | 8–12h |
| #66 | Store weekly staffing snapshots | feat | 6–8h | Review vs #129 — close as duplicate if confirmed |
| #64 | Export and import Excel for supply and needs | feat | 4–6h |
| #43 | Toggl integration | integration | — |
| #117 | Role switching UI | feat | — |
| #118 | Audit log | feat | — |
| #94 | UAT testing mode | qa | — |

---

## Hygiene — Session 13 complete

| Task | Issues | Status |
|---|---|---|
| Confirm and close duplicate issues | #110 → #120, #111 → #121 | ✅ Done (Session 13) |
| Batch triage 29 unmilesoned issues | 18 issues actioned | ✅ Done (Session 13) |

---

## Prioritization notes (Session 13 review)

- **Active Sprint cleared** — #109, #122, #108, #106, #127 all closed and browser-verified
- **18 issues triaged** — milestones assigned, 10 stale/completed issues closed, 2 duplicates (#110/#111) closed
- **#122 moved up** from low priority into Active Sprint — executive role seeing broken data is a stakeholder credibility issue
- **#108 moved up** — hardcoded badge count is visible to every user on every page load and signals unfinished work during demos
- **#123 (was D1) elevated** from Phase 2 into V1 Stable — session role staleness is a security gap, not a nice-to-have
- **#110 and #111 confirmed duplicates** — closed in favour of #120 and #121
- **#119** assigned to Soon pending review vs #125 (consultant profile editor) — close as duplicate if confirmed
- **New issues #124–#128 logged** — all assigned to Soon or created during session

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
| #122 | Executive overview — Projects with Most Utilization shows no data | 13 |
| #108 | Bell notification badge hardcoded to 4 | 13 |
| #106 | Year-boundary week upsert — getFullYear() not weekKeyToDate | 13 |
| #127 | Success toast after heatmap Save All | 13 |
| #110 | Duplicate of #120 — closed | 13 |
| #111 | Duplicate of #121 — closed | 13 |
| #120 | Wire search input — global typeahead navigator | 14 |
| #121 | Week selector — closed, superseded by #129 | 14 |
| #104 | Settings tab styling inconsistencies | 14 |
| #114 | Deactivated section expand default logic | 14 |
| #115 | Tooltip on disabled role select | 14 |

---

### Session 14 Follow-Ups (carry to Session 15)

1. **#119 vs #125** — compare on GitHub, close #119 as duplicate if confirmed
2. **Heatmap inline filter** — create new GitHub issue scoped to Staffing tab only
3. **#82 UAT cases** — write formal test script before #123 closes and real users onboard
4. **#61 update** — add note about row flash polish from #120
5. **#66 vs #129** — close #66 as duplicate if #129 covers it fully
6. **Cache buster audit** — app.js v=32, styles.css v=35
7. **Kill node in Git Bash** — pkill node not working, document workaround
8. **Holistic UI/UX design pass** — create GitHub issue for full design review before V1, candidate for V1 Stable

# Staffing Intelligence — Session Tracker

> Copy this file at the start of each session. Update checkboxes as you go. Archive completed sessions below.

---

## Session 13 — March 24 2026

**Goal:** Active sprint bug fixes + GitHub hygiene + triage 29 unmilesoned issues

---

### Active Sprint — Bug fixes

| # | Issue | Notes | Done |
|---|-------|-------|------|
| #109 | Fix isBillable defaulting to true for new assignments | server.js — read from employees table when no supply row exists | [x] |
| #122 | Executive overview — Projects with Most Utilization shows no data | Executive role sees empty projects panel — RBAC or query gap | [x] |
| #108 | Bell notification badge hardcoded to 4 | Visible to every user on every page load | [x] |
| #106 | Year-boundary week upsert — getFullYear() not weekKeyToDate | server.js /api/supply/update — bad date logic at year boundary | [x] |
| #127 | Success toast not appearing after heatmap Save All | Added showToast call in saveStaffingChanges success path | [x] |

---

### Hygiene — GitHub duplicate cleanup

| # | Task | Notes | Done |
|---|------|-------|------|
| #110 | Confirm duplicate of #120 — close if confirmed | #110 = "header search bar" · #120 = "search employees/projects input" | [x] |
| #111 | Confirm duplicate of #121 — close if confirmed | #111 = "date range selector" · #121 = "week selector dropdown" | [x] |

---

### Triage — 29 unmilesoned issues

| Task | Notes | Done |
|------|-------|------|
| Batch triage all 29 unmilesoned open issues | Includes #101, #105, #107, #110–#113, #117–#119, #61–#63, #79–#83, #94, #43 + others. Assign milestone or close as duplicate/stale. | [x] |

---

### New issues logged this session

| # | Issue | Milestone | Done |
|---|-------|-----------|------|
| #124 | Add new project assignment to consultant from heatmap | Soon | [ ] |
| #125 | Consultant profile editor — edit is_billable, capacity, rate overrides from UI | Soon | [ ] |
| #126 | Consultants management panel in Settings tab | Soon | [ ] |

---

### Session admin — before wrapping up

| Task | Notes | Done |
|------|-------|------|
| Verify Railway deploy | Hard refresh Ctrl+Shift+R · confirm cache buster incremented · log in and verify each fix in browser | [ ] |
| Update HANDOFF_6.md | Note: D1 is now #123 · cache buster at v=21 · milestones created · triage status | [ ] |
| Close completed issues in GitHub | Add commit references · never close before browser verification | [ ] |

---

### Session notes

_Add anything worth capturing for the next session here._

- 

---

## Session template (copy for next session)

```
## Session N — [Date]

**Goal:** [one line]

### Active Sprint — Bug fixes
| # | Issue | Notes | Done |
|---|-------|-------|------|
|   |       |       | [ ]  |

### Soon — Wiring & polish
| # | Issue | Notes | Done |
|---|-------|-------|------|
|   |       |       | [ ]  |

### Hygiene
| Task | Notes | Done |
|------|-------|------|
|      |       | [ ]  |

### Session admin
| Task | Notes | Done |
|------|-------|------|
| Verify Railway deploy | Hard refresh · cache buster · browser verify | [ ] |
| Update HANDOFF_N.md  | Capture state, issue numbers, cache buster version | [ ] |
| Close completed GitHub issues | Commit refs · browser verified only | [ ] |

### Session notes
-
```

---

## Completed sessions

| Session | Date | Issues closed | Notes |
|---------|------|---------------|-------|
| 13 | March 24 2026 | #109, #122, #108, #106, #127 closed. #124–#128 logged. 18 issues triaged. #110/#111 closed as duplicates | Active Sprint cleared, hygiene pass complete |
| 12 | — | #105, #107, #112, #113, B-save | Role gating UAT done, critical save bug fixed (serviceClient), stale roles cleaned |
| 11 | — | #101, B7, B-isBillable | User management invited/deactivated, temp password masked |
| 10 | — | #63, B1, B2 | User management UI, RBAC guards, heatmap end date dynamic |
| 9  | — | #62, Edit Mode removed | RBAC role enforcement, Airtable/Float model adopted |
| 8  | — | #38, RLS | Railway deploy, RLS tightening |
| 7  | — | #87–#93 | Supabase Auth setup |
| 6  | — | #84 | Terminology rename Supply/Demand |
| 5  | — | #77 | Merge Manage into Staffing: Hybrid Edit Mode |
| 4  | — | #67, #17 | Refresh button relocate, SSE auto-refresh |
| 3  | — | #31 | Supabase swap backend data layer |
| 2  | — | #29, #30 | Supabase schema setup, Excel import script |
| 1  | — | #79, #80, #81 | Duplicate available hours, legend swatch size, favicon 404 |

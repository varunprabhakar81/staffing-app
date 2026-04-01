# Handoff v31 — Session 31 Close

**Date:** 2026-04-01
**Branch:** main
**Status:** V2 complete. Pilot is next.

---

## What Was Done This Session

### #168 — RBAC Full Sweep (V2 Gate — CLOSED)

Completed a full 5-role RBAC verification: 30 initial tests + 13 re-verification tests. All 13/13 passed.

**Fixes shipped across Sessions 30–31:**

| Area | Fix |
|------|-----|
| Consultant isolation | `user_id` column added to `consultants` table; heatmap filtered by ownership for consultant role |
| PM staffing tab | Project Manager now sees Staffing tab (read-only); heatmap rows and overview visible |
| PM needs access | PM can create and edit needs; `POST /api/needs` and `PATCH /api/needs/:id` gates updated |
| Executive Ask Claude | Executive role unblocked from `/api/ask` and `/api/suggested-questions` |
| `canViewRates` enforcement | Rates stripped from profile responses for non-rate roles; PM and consultant cannot see billing rates |
| `supply/update` serviceClient | Bulk assignment endpoint switched to serviceClient to bypass RLS on writes |
| Ask Claude route gates | All AI endpoints check role before proceeding |
| Consultant self-view | Profile view for consultant role uses ownership check; rate fields stripped |

---

## V2 Milestone — CLOSED

All 3 issues complete:
- #154 — UI/UX polished ✓
- #187 — AI recommendations performance ✓
- #168 — All roles verified ✓

---

## Cache Busters

- `app.js?v=104`
- `styles.css?v=54` (bumped this session — no frontend code changes, just close-out)

---

## New Issues Created (Pilot Backlog)

| # | Title | Labels |
|---|-------|--------|
| #194 | UAT portal for real testers | type:feature, priority:medium, effort:large, area:infra |
| #195 | Second tenant + Railway instance for Tester 2 | type:chore, priority:medium, effort:m, area:infra |
| #196 | Rename Staffing → Resource Allocation | type:polish, effort:s, area:frontend |
| #197 | Open needs modal — group by project, collapsed on open | type:enhancement, effort:s, area:frontend |
| #198 | Needs tab — add expand all / collapse all button | type:enhancement, effort:s, area:frontend |
| #199 | Button terminology audit — standardize Add vs Create | type:polish, effort:s, area:frontend |

All assigned to **Pilot — Internal Adoption** milestone.

---

## Pilot Milestone — Current State

Open issues: 11 (original 5 + 6 new)
- #182 — In-app onboarding tour
- #183 — Contextual tooltips
- #184 — Admin getting-started checklist
- #185 — In-app feedback button (Supabase-backed)
- #186 — Switch prod to real data
- #194–#199 (see above)

Gate: do NOT start V3 until 2–4 weeks of pilot feedback collected.

---

## CLAUDE.md Changes This Session

- Role table updated: PM gets Staffing read-only + needs create/edit; Executive gets Ask Claude; Consultant gets own profile (no rates)
- Cache busters updated: styles.css?v=54
- Build order: V2 section removed, Pilot is now `← next` with all 11 issues listed

---

## Where to Pick Up

Next session: start Pilot work. Recommend beginning with UX polish issues (#196, #197, #198, #199) — all small effort — before tackling the larger infrastructure items (#194, #195) or onboarding features (#182–#186).

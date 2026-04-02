# Handoff v31 — Session 31 Close

**Date:** 2026-04-02
**Branch:** main
**Status:** V2 complete + Pilot sandboxes shipped. Pilot is active.

---

## What Was Done This Session

### #196 — Rename Staffing → Resource Allocation (CLOSED)
Nav label and tab title updated throughout frontend.

### #199 — Button terminology audit (CLOSED)
Standardized Add vs Create labels across all modals and panels.

### #187 — AI recommendations performance (CLOSED)
Parallel Claude reasoning calls + 60-second per-tenant `recoCacheMap` keyed by `tenantId`. Eliminated the sequential waterfall.

### #192 — Week alignment (CLOSED)
Heatmap weeks now align to Deloitte Saturday week-end convention.

### #168 — RBAC full sweep (CLOSED)
30-point initial + 13-point re-verification. All roles confirmed:
- Consultant: own heatmap row + own profile only (no rates)
- PM: Resource Allocation read-only + needs create/edit (not close/assign)
- Executive: full read + Ask Claude
- `user_id` column on `consultants` links auth user to row

### #195 — Per-tenant sandboxes + personalization (CLOSED)

**Sandbox infrastructure:**
- 4 tenants on single Railway + Supabase instance; RLS enforces isolation
- Deterministic per-tenant seed data: FNV-1a hash of tenant UUID → mulberry32 PRNG → Fisher-Yates shuffle → unique names per tenant, reproducible on reset
- `seed-synthetic-data.js` exports `seedTenant(tenantId, client, opts)` with `skipConfirm` option
- `POST /api/admin/reset-sandbox` — admin-only, rejects prod tenant UUID
- Tenant names in `tenants` table (`name TEXT` column)

**Personalization:**
- Sidebar brand area: company name (bold white) + "Staffing Intelligence" (muted secondary)
- Sidebar footer: user display name + role badge (color-coded by role)
- First-login welcome modal: "Welcome, [FirstName]!" + "You're managing resources for [Company]." + role-tailored bullet list; keyed by `localStorage.si_welcomed_<userId>`
- `GET /api/auth/me` returns `display_name` and `tenant_name`

**Tenant isolation fixes (global `staffingData` elimination):**
- All routes now call `readStaffingData(null, serviceClient, tId(req))`
- `tId(req)` helper: `req.session?.tenant_id || process.env.TENANT_ID`
- `staffingData` global removed entirely — no module-level cache
- `recoCache` (single object) → `recoCacheMap = new Map()` keyed by `tenantId`
- Write functions (`upsertAssignment`, `deleteAssignments`, `resolveConsultantId`, `resolveProjectId`) all accept and use `tenantId` param
- Root bug that caused "Need not found" and wrong consultant names: `/api/dashboard` fetched `freshData` with correct tenant but destructured from the deleted `staffingData` global on the next line — fixed

### #200 — Tenant environment tiers (CREATED, V3 backlog)
New issue for dev/UAT/prod per-customer environment tiers.

---

## Tester Credentials

| Tester | Email | Password | Role | Tenant |
|--------|-------|----------|------|--------|
| Varun | vaprabhakar@deloitte.com | StaffingAdmin_2026! | admin | Meridian Consulting (prod) |
| Tim | tcallesen@deloitte.com | TestAdmin_2026! | admin | Acme Corp |
| Shreyas | ssampath@deloitte.com | TestRM_2026! | resource_manager | BigCo Inc |
| Nick | nkolbow@deloitte.com | TestRM_2026! | resource_manager | Summit LLC |

Tenant UUIDs in `docs/tester-setup.md`.

---

## Tenant Isolation Verification (end-to-end)

Tested against live dev server. Zero data leakage between tenants:

| Check | Tim (Acme Corp) | Shreyas (BigCo Inc) |
|-------|----------------|---------------------|
| tenant_name | Acme Corp ✓ | BigCo Inc ✓ |
| Dashboard bench | Amber Cook, Carmen Shaw… ✓ | Thomas Harris, Nathan Mitchell… ✓ |
| Open needs | 11 (Axiom Corp project) ✓ | 12 (Summit Logistics project) ✓ |
| Heatmap employees | Beth Scott, Sarah Morris… ✓ | Eva Collins, Maya Morris… ✓ |
| Ask Claude | Names Acme Corp consultants ✓ | Names BigCo consultants ✓ |

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Parallel Claude calls in `/api/recommendations` | Eliminated 4s sequential waterfall; now fires all reasoning calls concurrently |
| Per-tenant `recoCacheMap` (60s TTL) | Avoids paying full readStaffingData cost on every panel open; safe because keyed by tenantId |
| `user_id` column on `consultants` | Links Supabase auth user → consultant row for RBAC isolation without storing auth state in app DB |
| Deterministic RNG (FNV-1a + mulberry32) | Same tenant UUID always produces same names on every reset; different tenants get different names |
| Single Railway + Supabase for all tenants | Simpler ops; RLS provides isolation; no per-tester infra needed |
| Sandbox reset rejects prod tenant UUID | Safety guard: `if (tenantId === process.env.TENANT_ID) → 403` |
| `tId(req)` helper | Falls back to `process.env.TENANT_ID` for prod compatibility; all routes use it |
| Welcome modal keyed by `si_welcomed_<userId>` | Shows once per user per browser; doesn't re-show on every login |
| Forgot password shows generic message | Prevents email enumeration — same message for valid and invalid emails |
| Saturday week-end alignment | Matches Deloitte Sun-Sat payroll week convention |

---

## Issues Completed This Session

| # | Title | Status |
|---|-------|--------|
| #187 | AI recommendations performance | CLOSED |
| #168 | RBAC full sweep | CLOSED |
| #192 | Week alignment | CLOSED |
| #196 | Rename Staffing → Resource Allocation | CLOSED |
| #199 | Button terminology audit | CLOSED |
| #195 | Per-tenant sandboxes + personalization | CLOSED |

## Issues Created This Session

| # | Title | Milestone |
|---|-------|-----------|
| #200 | Tenant environment tiers — dev/UAT/prod per customer | V3 |

---

## Cache Busters

- `app.js?v=113`
- `styles.css?v=59`

---

## Pilot Milestone — Current State

Active. Gate: 2–4 weeks of pilot feedback before V3 starts.

**8 open issues (priority order for Session 32):**
1. #185 — In-app feedback button (so testers can report issues)
2. #183 — Contextual tooltips
3. #184 — Admin getting-started checklist
4. #182 — In-app onboarding tour (builds on welcome modal already shipped)
5. #188 — Consultant master data: add Industry and Country fields
6. #194 — UAT portal for real testers (tester-setup.md covers manual process)
7. #197 — Open needs modal — group by project, collapsed
8. #198 — Needs tab — expand all / collapse all

Note: #186 (Switch prod to real data) is **Parked**, not in Pilot.

**Completed in Pilot:**
- #195 — Per-tenant sandboxes + personalization ✓
- #196 — Rename Staffing → Resource Allocation ✓
- #199 — Button terminology audit ✓
- #192 — Week alignment ✓

---

## Session Backlog Notes

- **B4**: #194 UAT portal — DONE; tester-setup.md is the deliverable, no code remaining
- **B5**: superseded by #195 (per-tenant sandboxes on shared instance, no second Railway needed)
- **B6**: UAT widget template enforcement — doc-only, not a code issue

**UAT widget standard (carried forward):**
- Card-per-test layout, title + nav path, right-aligned Pass/Fail/Note buttons
- Inline styles on buttons (not CSS classes) to avoid specificity issues
- Credentials card at top when multi-account testing
- Origin notes on re-verification tests

---

## GitHub Operations Note

**`gh project item-add` CLI silently fails** (returns empty output, no error, no confirmation) when adding issues to project board #4. Use GraphQL instead:

```bash
# Get issue node ID
node_id=$(gh api repos/varunprabhakar81/staffing-app/issues/NNN --jq '.node_id')

# Add to board
gh api graphql -f query="mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwHOAiRn_s4BTGRI\"
    contentId: \"$node_id\"
  }) { item { id } }
}"
```

Project ID: `PVT_kwHOAiRn_s4BTGRI` (board #4, Staffing Intelligence Build Board).

---

## Where to Pick Up (Session 32)

1. **#185** — In-app feedback button (testers need a reporting channel)
2. **#183** — Contextual tooltips
3. **#184** — Admin getting-started checklist
4. **#182** — Onboarding tour (builds on welcome modal already shipped)

Hold #186 (real data) until pilot feedback confirms the data model is stable.

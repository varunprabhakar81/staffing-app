# Handoff v37 — Session 37 Close

**Date:** 2026-04-06
**Branch:** main
**Last commit:** 54b4630
**Status:** Pilot active. UAT Round 1 ~65% complete (70 pass, 4 deferred, 40 untested).

---

## Roadmap & Milestone Summary

### Product stage
Pilot — internal adoption. 8 test users across 4 tenants. No external customers yet.
Gate to V3: at least 3 unsolicited feature requests from pilot users.

### Pilot milestone (14 open issues)

**Ready for next session:**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 1 | — | Finish UAT Round 1: Cross-cutting (8), RBAC (22), Sandbox Reset (5), Tenant Isolation (5) | Medium |
| 2 | — | Post-UAT failure report → batch fix → retest | Medium |
| 3 | #193 Ph1 | Project heatmap — read-only with consultant cross-link | Medium |
| 4 | #213 | Tester onboarding — Tim (Acme), Shreyas (BigCo), Nick (Summit) HTML walkthrough | Small |
| 5 | #214 | Overview tab UX/UI audit (includes overview-06 drilldown) | Medium |
| 6 | #210 Ph3 | Command palette: Contextual page filters | Medium |
| 7 | #204 | Main app header redesign | Medium |
| 8 | #208 | Skill set categories rethink — structured grouping | Medium-Large |
| 9 | #183 | Contextual tooltips (post UAT feedback) | Small |
| 10 | #184 | Admin getting-started checklist (post UAT) | Medium |
| 11 | #182 | In-app onboarding tour (post UAT) | Medium |

**Enhancement issues from UAT (fix when prioritized):**
| Issue | Description | Priority |
|-------|-------------|----------|
| #220 | needs-21: Bulk assign UI — no row-select mechanism | medium |
| #221 | heatmap-09: Quick Fill date input needs StaffingDatePicker | low |
| #222 | settings-c-08: Deactivate consultant uses browser confirm() | low |

**Completed this session:**
- Fixed #215 — Bulk add need validation: Level required, error at top of modal, red border on invalid field
- Fixed #216 — Close Need buttons: ✓ Met and ✗ Abandon buttons with in-app confirmation modal, capture-phase event delegation, CSS column width fix
- Fixed #217 — Deactivate user message: intercepts "banned" → "deactivated"
- Fixed #218 — Invite metadata promotion: generateLink now writes app_metadata via updateUserById; pending badge + resend invite button
- Fixed #219 — Donut tooltip: count moved below canvas, no collision
- Fixed inline confirm modal callback ordering (_icmDoConfirm snapshots callback before closing)
- Updated test cases: needs-23 (allSkillSets language), overview-09 (expand-by-default is design intent), needs-18/needs-19 (button-based close flow)
- Created issues #215–#222
- Updated #214 with overview-06 and overview-09 UAT notes
- Moved #193 from V3 to Pilot (scoped to Ph1 read-only)
- Polish fixes from session 36 carried over: tenant name color, Alt+R, category badges, sidebar back-link

**Recently completed (session 35–36):**
- #212 — Testing lifecycle: retest workflow + admin review dashboard ✓
- #211 — Date picker redesign — week-snapping custom picker ✓

**Completed earlier in Pilot:**
- #195, #196, #199, #192, #201, #202, #197, #198, #205, #206, #207, #188, #209 ✓

### V3 milestone (first external customer — after Pilot)
| # | Title |
|---|-------|
| #96 | Tenant onboarding |
| #97 | Extended roles |
| #118 | Audit log |
| #172 | Client hierarchy |
| #193 Ph2 | Project heatmap — interactive editing (deferred from Pilot) |
| #203 | Configure custom SMTP for branded emails |

### Parallel tracks (non-Pilot)
- **SOD Detector SaaS** — starts after staffing app auth + Railway deploy close out
- **Deloitte client work** — AT&T (NetSuite + Ivalua), ForgedFiber ADM

---

## What Was Done This Session

### UAT Round 1 progress
- Continued testing from ~25% (29/113) to ~65% (73/113)
- 70 pass, 4 deferred fails (tied to enhancement issues), 40 untested
- Categories completed: Auth ✓, Overview ✓, Resource Allocation ✓, Open Needs ✓, Settings: Consultants ✓, Settings: Users ✓
- Categories remaining: Cross-cutting (8), RBAC (22), Sandbox Reset (5), Tenant Isolation (5)

### Bug fixes (5 bugs across 6 issues)
All fixes committed in 54b4630.

**#215 — Bulk add validation:** Removed silent row-skip logic. Every row validates Level on submit. Error displays at top of modal with red border on invalid field. Three rounds of debugging: (1) scroll visibility, (2) error position, (3) skip condition matching placeholder-only rows.

**#216 — Close Need buttons:** Added ✓ Met and ✗ Abandon buttons to open need rows (admin/resource_manager). Root cause of invisibility: CSS `table-layout: fixed` reads width from `<th>`, not `<td>` classes — column was clipped to 56px. Fixed at `th:nth-child(8)` level with 25% width. Abandon button required capture-phase event delegation to prevent row click handler from intercepting.

**#217 — Deactivate user message:** Intercepts Supabase "banned" language in login.html, replaces with "Your account has been deactivated."

**#218 — Invite metadata promotion:** `generateLink` puts data into `user_metadata`, not `app_metadata`. Added `updateUserById` call after `generateLink` to promote `role` and `tenant_id` into `app_metadata`. Pending badge and resend invite already implemented.

**#219 — Donut tooltip collision:** Moved open needs count from canvas center to a `<p>` element below the canvas.

**Inline confirm modal fix:** `_icmDoConfirm()` was calling `_closeConfirm()` (which nulls `_icmCallback`) before executing the callback. Fixed by snapshotting the callback reference before closing.

### Issues created this session
| # | Title | Type | Milestone |
|---|-------|------|-----------|
| #215 | needs-16: Bulk add need validation not firing | bug | Pilot |
| #216 | needs-18/19: Close Need buttons missing (regression) | bug | Pilot |
| #217 | settings-u-05: Deactivate user shows 'User is banned' | bug | Pilot |
| #218 | settings-u-07: Resend invite — no pending state | bug | Pilot |
| #219 | needs-03: Donut tooltip collides with open needs count | bug | Pilot |
| #220 | needs-21: Bulk assign UI — no row-select mechanism | enhancement | Pilot |
| #221 | heatmap-09: Quick Fill date input needs StaffingDatePicker | enhancement | Pilot |
| #222 | settings-c-08: Deactivate consultant uses browser confirm() | enhancement | Pilot |

### Issues closed this session
| # | Title |
|---|-------|
| #215 | Bulk add need validation ✓ |
| #216 | Close Need buttons ✓ |
| #217 | Deactivate user message ✓ |
| #218 | Invite metadata promotion ✓ |
| #219 | Donut tooltip collision ✓ |

---

## UAT Round 1 — Current Status

| Category | Total | Tested | Pass | Fail (deferred) |
|----------|-------|--------|------|-----------------|
| Auth | 7 | 7 | 7 | 0 |
| Overview | 9 | 9 | 8 | 1 (overview-06 → #214) |
| Resource Allocation | 12 | 12 | 11 | 1 (heatmap-09 → #221) |
| Open Needs | 23 | 23 | 21 | 2 (needs-21 → #220, needs-03 closed via #219) |
| Settings: Consultants | 9 | 9 | 8 | 1 (settings-c-08 → #222) |
| Settings: Users | 7 | 7 | 7 | 0 |
| Ask Claude | 6 | 6 | 6 | 0 |
| Cross-cutting | 8 | 0 | — | — |
| RBAC | 22 | 0 | — | — |
| Sandbox Reset | 5 | 0 | — | — |
| Tenant Isolation | 5 | 0 | — | — |
| **Total** | **113** | **73** | **70** | **4 deferred** |

---

## Session 37 Backlog Items → GitHub Issues

Create these as GitHub issues during session close:

| ID | Title | Labels |
|----|-------|--------|
| S37B1 | Bulk add need: inline-on-blur validation upgrade | type:enhancement, priority:low |
| S37B2 | Closed needs section (met + abandoned) on Open Needs tab | type:enhancement, priority:medium |
| S37B3 | Testing portal: retest requires double-press to pass | type:bug, priority:medium |
| S37B4 | Audit trail for cancelled invites and closed/abandoned needs | type:enhancement, priority:low |
| S37B5 | Testing portal: optional notes on passed test cases | type:enhancement, priority:medium |
| S37B6 | Testing portal: merge filter tabs into clickable progress bar | type:enhancement, priority:low |

All get Milestone: Pilot. All get added to project board via GraphQL.

---

## Cache Busters
- app.js?v=158
- styles.css?v=67
(testing.html is self-contained)

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Validate on submit (not gate row creation) | Users need to scaffold multiple rows freely; validation blocks POST with visible error + red border |
| Capture-phase event delegation for need action buttons | Row click (toggleNeedExpansion) was intercepting button clicks; capture phase fires before bubble phase |
| Snapshot _icmCallback before _closeConfirm() | _closeConfirm nulls the callback; must save reference first |
| th:nth-child(8) width for action column | table-layout: fixed reads width from th, not td classes |
| updateUserById after generateLink | generateLink writes to user_metadata; app needs tenant_id in app_metadata for listing filter |
| Abandon + Met as separate buttons (not dropdown) | Direct, discoverable; matches the two-option close model |

---

## Supabase Auth — Current State (8+ users)

| Email | Role | Tenant | testing_role |
|-------|------|--------|-------------|
| vaprabhakar@deloitte.com | admin | Meridian | none |
| varun.prabhakar+meridian@gmail.com | admin | Meridian | test_admin |
| varun.prabhakar+acme@gmail.com | admin | Acme Corp | test_admin |
| varun.prabhakar+bigco@gmail.com | admin | BigCo Inc | test_admin |
| varun.prabhakar+summit@gmail.com | admin | Summit LLC | test_admin |
| rm_test@test.com | resource_manager | Meridian | tester |
| pm_test@test.com | project_manager | Meridian | tester |
| exec_test@test.com | executive | Meridian | tester |

Plus any users invited via generateLink this session (now visible with Pending badge).

### Passwords (unchanged)
- vaprabhakar@deloitte.com: StaffingAdmin_2026!
- varun.prabhakar+meridian@gmail.com: TestAdmin_2026!
- rm_test/pm_test/exec_test: Testing_2026!

---

## Where to Pick Up (Session 38)

1. Finish UAT Round 1 — Cross-cutting (8), RBAC (22), Sandbox Reset (5), Tenant Isolation (5)
2. Post-UAT failure report → CC prompt from HANDOFF_v36 (still valid, just update session number)
3. Batch fix all failures
4. Retest
5. Close backlog issues created from S37B1–B6
6. #193 Ph1 — read-only project heatmap
7. #213 — Tester onboarding

---

## GitHub Operations Note

gh project item-add CLI silently fails. Use GraphQL:

```
node_id=$(gh api repos/varunprabhakar81/staffing-app/issues/NNN --jq '.node_id')
gh api graphql -f query="mutation {
  addProjectV2ItemById(input: {
    projectId: \"PVT_kwHOAiRn_s4BTGRI\"
    contentId: \"$node_id\"
  }) { item { id } }
}"
```

Project ID: PVT_kwHOAiRn_s4BTGRI

---

## Windows git add -A Warning

**Do NOT use `git add -A` on Varun's Windows machine.** Stage files by name only.

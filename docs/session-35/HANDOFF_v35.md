# Handoff v35 — Session 35 Close

**Date:** 2026-04-05
**Branch:** main
**Status:** Pilot active. Full testing lifecycle shipped.

---

## Roadmap & Milestone Summary

### Product stage
Pilot — internal adoption. 8 test users across 4 tenants. No external customers yet.
Gate to V3: at least 3 unsolicited feature requests from pilot users.

### Pilot milestone (6 open issues)

**Ready for next session:**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 1 | — | Tester onboarding — Tim/Shreyas/Nick via docs/onboarding-runbook.md | Small |
| 2 | #210 Ph3 | Command palette: Contextual page filters | Medium |
| 3 | #204 | Main app header redesign | Medium |
| 4 | #208 | Skill set categories rethink — structured grouping | Medium-Large |
| 5 | #183 | Contextual tooltips (post UAT feedback) | Small |
| 6 | #184 | Admin getting-started checklist (post UAT) | Medium |
| 7 | #182 | In-app onboarding tour (post UAT) | Medium |

**Completed this session:**
- #212 — Testing lifecycle: retest workflow + admin review dashboard ✓

**Recently completed (session 34):**
- #207 — Comprehensive test case regeneration ✓
- #209 — Remove dead overview mini donut ✓
- #188 — Industry + Country dropdowns ✓
- #210 Ph1+2 — Command palette + quick actions ✓
- #211 — Date picker redesign ✓

**Completed earlier in Pilot:**
- #195 — Per-tenant sandboxes + personalization ✓
- #196 — Rename Staffing → Resource Allocation ✓
- #199 — Button terminology audit ✓
- #192 — Week alignment ✓
- #201 — Invite flow (set-password + generateLink) ✓
- #202 — Testing companion app ✓
- #197 — Open needs modal — group by project, collapsed ✓
- #198 — Needs tab — expand/collapse all ✓
- #205 — Donut hover tooltip ✓
- #206 — Bulk need creation ✓

### V3 milestone (first external customer — after Pilot)
| # | Title |
|---|-------|
| #96 | Tenant onboarding |
| #97 | Extended roles |
| #118 | Audit log |
| #172 | Client hierarchy |
| #203 | Configure custom SMTP for branded emails |

### Parallel tracks (non-Pilot)
- **SOD Detector SaaS** — starts after staffing app auth + Railway deploy close out
- **Deloitte client work** — AT&T (NetSuite + Ivalua), ForgedFiber ADM

---

## What Was Done This Session

### #212 — Testing lifecycle: retest workflow + admin review dashboard (CLOSED)

Comprehensive overhaul of testing.html to support the full test-fix-retest cycle.

**Phase 1 — Schema + API (commit e1d4ff3):**
- Added `status` column to `test_results` with CHECK constraint (pass/fail/skip/note/retest)
- Migration `003-test-results-retest.sql` run via Supabase SQL Editor
- 5 new API endpoints: GET results, PATCH retest, PATCH retest-all-failed, DELETE reset, DELETE reset-all
- All endpoints tenant-scoped via tId(req), writes use serviceClient

**Phase 2 — Tester view (commit ab0c45b):**
- Filter tabs: All / Pending / Passed / Failed / Skipped / Retest with live count badges
- Retest badges (amber) on cards marked for re-verification
- Locked passed tests (green, disabled form)
- Category gating bypass for retest items
- "Reset My Results" button in sticky progress bar
- Data source switched to GET /api/testing/results

**Phase 3 — Admin dashboard (commit 80c9d39):**
- Admin Dashboard tab (test_admin only) replaces old Summary tab
- Tester cards with email, pass/fail/retest/pending counts, segmented progress bar
- Results table grouped by tester with collapsible sections
- Filter bar: category dropdown, status tabs (All/Pass/Fail/Retest/Pending)
- Mark Retest per-row + Retest All Failed bulk action (in-place updates)
- Reset per-user + Reset All Users controls

**UX polish:**
- Sticky progress bar (pinned on scroll with solid background + shadow)
- Optional gating toggle ("Enforce sequential testing" in Admin Dashboard, in-memory Map storage)
- Locked category hint: amber callout "🔒 Complete all tests in [Category] to unlock"
- Single submit dialog with inline general feedback tip + clickable link
- Past tense progress bar labels (Passed/Failed/Skipped)
- Skipped filter tab (muted blue-grey)

**9 bug fixes during UAT:**
1. Added Passed filter tab (was missing entirely)
2. Submit button disappearing after first submit (visibility logic)
3. Submit button greyed out after submit (disabled state not re-enabled)
4. Notes validation "10+ chars" warning not clearing (isSubmitted gate blocked input listener)
5. Filter tab counts stale — wrong data source (submitted_at gate mismatch with progress bar)
6. Category gating broken (isSubmitted/isCardLocked refactor side effect)
7. Admin My Tests showing other users' locked cards (results not user-scoped)
8. Error toast on multiple clicks ("Tests already submitted" on locked cards)
9. Category unlock not re-evaluating after submission (missing renderMyTests call)

---

## Issues Closed This Session

| # | Title |
|---|-------|
| #212 | Testing lifecycle: retest workflow + admin review dashboard |

## Issues Created This Session

| # | Title | Milestone |
|---|-------|-----------|
| #212 | Testing lifecycle (created + closed) | Pilot |

---

## Cache Busters

- app.js?v=146
- styles.css?v=65
(testing.html is self-contained — no external versioned files)

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| status column added to test_results (not rename pass→passed) | Frontend hardcodes 'pass'/'fail' in CSS classes; rename deferred to avoid breaking changes |
| isCardLocked over isSubmitted for per-card gating | isSubmitted is a global flag; isCardLocked is per-card (submitted_at && status !== 'retest') |
| In-memory Map for sequential_testing toggle | sb_secret_* key can't connect to Postgres directly; in-memory is functional for pilot, defaults to true on restart |
| Results user-scoped in My Tests view | Admin must have independent test copy; filter by currentUser.user?.id on boot |
| refreshMyTests() on tab switch | Ensures retest marks from Admin Dashboard are immediately reflected without browser refresh |
| Grouped admin results by tester | Flat list was hard to parse with multiple testers; collapsible sections per user with counts |
| Removed Refresh button from Admin Dashboard | Tab switching now triggers re-fetch; button was redundant |
| Lock hint as amber callout with 🔒 prefix | Subtle muted text was invisible on dark theme; amber callout is visible without being alarming |

---

## Pilot Milestone — Current State

Active. 6 open issues.

**Session 36 priority order:**
1. Tester onboarding — Tim/Shreyas/Nick
2. #210 Phase 3 — Contextual page filters
3. #204 — Main app header redesign
4. #208 — Skill set categories
5. #183 — Contextual tooltips
6. #184 — Getting-started checklist
7. #182 — Onboarding tour

---

## Supabase Auth — Current State (8 users, unchanged)

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

### Passwords (unchanged)
- vaprabhakar@deloitte.com: StaffingAdmin_2026!
- varun.prabhakar+meridian@gmail.com: TestAdmin_2026!
- rm_test/pm_test/exec_test: Testing_2026!

---

## Session 35 Backlog Items (all resolved)

**S35B1 — Open GitHub issue #212** → Done, added to project board
**S35B2 — CLAUDE.md migration convention** → Done, added sb_secret_* note

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

## Where to Pick Up (Session 36)

1. Tester onboarding — Tim/Shreyas/Nick via docs/onboarding-runbook.md
2. #210 Phase 3 — Contextual page filters
3. #204 — Main app header redesign

---

## Post-UAT CC Prompt (run after completing 113-case test suite)

After completing all tests on testing.html, paste this prompt into Claude Code:

Read CLAUDE.md for context.

Task: Generate UAT failure report and create GitHub issue.

Step 1 — Query results: Query the test_results table via serviceClient for tenant_id = '9762ee19-e1d1-48db-bc57-e96bee9ce2f8' (Meridian). Get all rows where status = 'fail'. Include test_case_id, status, notes, submitted_at.

Step 2 — Enrich with test case metadata: Read public/test-cases.json. For each failed result, look up the test case to get: category (area), test name, description.

Step 3 — Generate report: Build a markdown report with a summary line ("X of 113 tested. Y passed, Z failed, W skipped."), a failures table sorted by category (columns: #, Category, Test ID, Test Name, Fail Notes), and a separate skipped table if any. Only include failures and skips — do not list passes.

Step 4 — Create GitHub issue: Title "UAT Round 1 — Failure report (session 36)", body is the full markdown report, labels type:bug and priority:high, milestone Pilot. Then add to project board — get the node_id via gh api repos/varunprabhakar81/staffing-app/issues/NNN --jq '.node_id', then call addProjectV2ItemById mutation with projectId PVT_kwHOAiRn_s4BTGRI and that node_id as contentId.

Step 5 — Output: Print the full report to console AND the GitHub issue URL.

Then paste the console output into Claude chat for batched fix prompts.

# Handoff v36 — Session 36 Close

**Date:** 2026-04-06
**Branch:** main
**Status:** Pilot active. UAT Round 1 ~25% complete.

---

## Roadmap & Milestone Summary

### Product stage
Pilot — internal adoption. 8 test users across 4 tenants. No external customers yet.
Gate to V3: at least 3 unsolicited feature requests from pilot users.

### Pilot milestone (8 open issues)

**Ready for next session:**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 1 | — | Finish UAT → failure report → batch fix → retest | Medium |
| 2 | #193 Ph1 | Project heatmap — read-only with consultant cross-link | Medium |
| 3 | #213 | Tester onboarding — Tim (Acme), Shreyas (BigCo), HTML walkthrough | Small |
| 4 | #214 | Overview tab UX/UI audit | Medium |
| 5 | #210 Ph3 | Command palette: Contextual page filters | Medium |
| 6 | #204 | Main app header redesign | Medium |
| 7 | #208 | Skill set categories rethink — structured grouping | Medium-Large |
| 8 | #183 | Contextual tooltips (post UAT feedback) | Small |
| 9 | #184 | Admin getting-started checklist (post UAT) | Medium |
| 10 | #182 | In-app onboarding tour (post UAT) | Medium |

**Completed this session:**
- #212 carried over — Testing lifecycle: retest workflow + admin review dashboard ✓ (shipped session 35, documented here)
- Polish fixes: tenant name color, Alt+R shortcut, category completion badges, testing portal sidebar back-link

**Recently completed (session 35):**
- #212 — Testing lifecycle: retest workflow + admin review dashboard ✓

**Completed earlier in Pilot:**
- #195 — Per-tenant sandboxes + personalization ✓
- #196 — Rename Staffing → Resource Allocation ✓
- #199 — Button terminology audit ✓
- #192 — Week alignment ✓
- #201 — Invite flow — set-password + generateLink ✓
- #202 — Testing companion app ✓
- #197 — Open needs modal — group by project, collapsed ✓
- #198 — Needs tab — expand/collapse all ✓
- #205 — Needs donut chart hover tooltip ✓
- #206 — Bulk need creation — multi-line modal ✓
- #207 — Comprehensive test case regeneration ✓
- #188 — Consultant master data: Industry and Country fields ✓
- #209 — Overview mini donut — removed ✓
- #211 — Date picker redesign — week-snapping custom picker ✓

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

### Polish fixes — UAT Round 1 blockers

**Tenant name color fix:**
- Testing portal was rendering tenant name in generic white instead of brand color
- Root cause: CSS variable `--tenant-color` not available in testing portal; portal uses a JS `TENANT_BRANDS` lookup map
- Fix: switched to JS brand lookup on load, applies inline style to `.tenant-name` element

**Alt+R replaces Ctrl+R (app.js?v=149):**
- `Ctrl+R` is browser-reserved (hard reload); was triggering page reload instead of dashboard refresh
- Changed keyboard shortcut to `Alt+R`; added `preventDefault()` guard
- Updated keyboard shortcuts table in UI help modal

**Category completion badges (testing portal sidebar):**
- Added color-coded completion badges next to each category in sidebar: green (all pass), amber (some fail/retest), grey (not started)
- Badges update live as tests are submitted
- Helps testers see progress at a glance without scrolling through cards

**Testing Portal sidebar back-link:**
- Sidebar "Testing Portal" link was re-loading testing.html (no-op when already on the page)
- Changed to navigate back to Overview tab (`/`) so testers can return to the main app

**CSS variable alignment:**
- Aligned `--tenant-color`, `--tenant-bg`, `--card-bg` definitions between `styles.css` and `testing.html` inline styles
- Prevents visual inconsistencies when both apps are open

### Issues created this session

**#213 — Tester onboarding:**
- Tenant assignments: Tim → Acme Corp, Shreyas → BigCo Inc, Nick → Summit LLC
- Onboarding via `docs/onboarding-runbook.md` + HTML walkthrough
- Blocked on clean UAT pass — do not onboard until UAT failures are resolved

**#214 — Overview tab UX/UI audit:**
- Capturing overview-06 (KPI card layout) and overview-09 (bench list sorting) as tracked bugs
- To be addressed in batch fix pass after UAT completes

### #193 — Moved from V3 to Pilot (scoped down)
- Original: full interactive project heatmap (read + write)
- Scoped to Ph1: read-only project heatmap with consultant cross-link to Resource Allocation tab
- Ph2 (interactive editing) deferred to V3
- Added to Pilot build order as lower priority (after UAT + #213 + #214)

---

## UAT Round 1 — Progress (~25% complete)

| Category | Tests | Status |
|----------|-------|--------|
| Auth | 7/7 | All pass ✓ |
| Overview | 9/9 | 3 fail — overview-06 → #214, overview-08 fixed+retested passing, overview-09 → #214 |
| Resource Allocation | 12/12 | All pass ✓ |
| Open Needs | 1/23 | In progress |
| Ask Claude | 0/? | Not started |
| Settings | 0/? | Not started |
| Invite Flow | 0/? | Not started |
| Other | — | Not started |
| **Total** | **~29/113** | **~25%** |

**Bugs captured:**
- overview-06: KPI card layout → #214
- overview-09: bench list sorting → #214
- overview-08: fixed and retested passing (no issue needed)

---

## Issues Closed This Session

None — polish fixes were uncommitted bugs, not tracked issues.

## Issues Created This Session

| # | Title | Milestone |
|---|-------|-----------|
| #213 | Tester onboarding — Tim/Shreyas/Nick HTML walkthrough | Pilot |
| #214 | Overview tab UX/UI audit | Pilot |

## Issues Updated This Session

| # | Change |
|---|--------|
| #193 | Moved from V3 → Pilot; scoped to Ph1 read-only; Ph2 stays in V3 |

---

## Cache Busters

- app.js?v=149
- styles.css?v=65
(testing.html is self-contained — no external versioned files)

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Alt+R over Ctrl+R | Ctrl+R is hard-reserved by browsers; Alt+R is safe across Chrome/Edge/Firefox |
| TENANT_BRANDS JS lookup for tenant color | CSS variables from main app don't inherit into testing.html; JS lookup is portable and explicit |
| #193 Ph1 read-only only | Interactive editing (write paths) is substantial effort; read-only heatmap delivers 80% of value for pilot |
| Tim→Acme, Shreyas→BigCo, Nick→Summit | Tenant assignments match org familiarity; Meridian reserved for Varun internal testing |
| Onboarding blocked on clean UAT | Don't onboard external testers to a portal with known bugs; finish UAT first |

---

## Pilot Milestone — Current State

Active. UAT Round 1 in progress (~25% complete).

**Session 37 priority order:**
1. Finish UAT (Open Needs → Ask Claude → Settings → Invite Flow)
2. Run post-UAT CC prompt → failure report → create GitHub issue
3. Batch fix pass on all failures
4. Retest failures
5. #193 Ph1 — read-only project heatmap
6. #213 — Tester onboarding
7. #214 — Overview UX/UI audit
8. #210 Ph3 — Contextual page filters
9. #204 — Main app header redesign

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

## Session 36 Backlog Items

None carried forward — all polish fixes shipped inline.

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

**Do NOT use `git add -A` on Varun's Windows machine.** Stage files by name only:

```bash
git add CLAUDE.md docs/session-36/CLAUDE.md docs/session-36/HANDOFF_v36.md
```

Reason: `git add -A` on Windows can inadvertently stage untracked binary files, lock files, or OS artifacts (Thumbs.db, desktop.ini) that pollute the commit history.

---

## Where to Pick Up (Session 37)

1. Finish UAT — continue from Open Needs (test 2/23 onward)
2. Run post-UAT CC prompt below → failure report → GitHub issue
3. Batch fix all failures
4. Retest
5. #193 Ph1 — read-only project heatmap + consultant cross-link

---

## Post-UAT CC Prompt (run after completing 113-case test suite)

After completing all tests on testing.html, paste this prompt into Claude Code:

Read CLAUDE.md for context.

Task: Generate UAT failure report and create GitHub issue.

Step 1 — Query results: Query the test_results table via serviceClient for tenant_id = '9762ee19-e1d1-48db-bc57-e96bee9ce2f8' (Meridian). Get all rows where status = 'fail'. Include test_case_id, status, notes, submitted_at.

Step 2 — Enrich with test case metadata: Read public/test-cases.json. For each failed result, look up the test case to get: category (area), test name, description.

Step 3 — Generate report: Build a markdown report with a summary line ("X of 113 tested. Y passed, Z failed, W skipped."), a failures table sorted by category (columns: #, Category, Test ID, Test Name, Fail Notes), and a separate skipped table if any. Only include failures and skips — do not list passes.

Step 4 — Create GitHub issue: Title "UAT Round 1 — Failure report (session 37)", body is the full markdown report, labels type:bug and priority:high, milestone Pilot. Then add to project board — get the node_id via gh api repos/varunprabhakar81/staffing-app/issues/NNN --jq '.node_id', then call addProjectV2ItemById mutation with projectId PVT_kwHOAiRn_s4BTGRI and that node_id as contentId.

Step 5 — Output: Print the full report to console AND the GitHub issue URL.

Then paste the console output into Claude chat for batched fix prompts.

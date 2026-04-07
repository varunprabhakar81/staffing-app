# Handoff v39 — Session 39 Close

**Date:** 2026-04-07
**Branch:** main
**Cache busters:** app.js?v=181, styles.css?v=72
**Status:** Pilot active. 4 testers onboarded. Tier 1 bugs nearly clear.

---

## Roadmap & Milestone Summary

### Product stage
Pilot — internal adoption. 4 real testers active across 4 tenants + 4 test accounts. No external customers yet.
Gate to V3: at least 3 unsolicited feature requests from pilot users.

### Active pilot testers
| Person | Email | Tenant | Role |
|--------|-------|--------|------|
| Tim Callesen | tcallesen@deloitte.com | Acme Corp | admin |
| Shreyas Sampath | shsampath@deloitte.com | BigCo Inc | admin |
| Nick Kolbow | nkolbow@deloitte.com | Summit LLC | admin |
| Surendra Kumar | surendkumar@deloitte.com | Meridian Consulting | resource_manager |

### Pilot milestone (open issues — restacked)

**Tier 1: Bugs + blockers (Session 40 — do first)**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 1 | #231 | Testing portal: retest requires double-press to pass | Small |

**Tier 2: First impression (Session 40 — after #231)**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 2 | #204 | Main app header redesign | Medium |
| 3 | #238 | Command palette: Consultant result → Resource Allocation row | Medium |
| 4 | #237 | Command palette: Search open needs + rename Projects label | Medium |

**Tier 3: UAT completion (Session 40-41)**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 5 | — | Finish UAT Round 1: Cross-cutting (8), RBAC (22), Sandbox Reset (5), Tenant Isolation (5) | Medium |
| 6 | — | Post-UAT failure report → batch fix → retest | Medium |

**Tier 4: Depth + polish (backlog)**
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 7 | #242 | Overview: Wow layer — sparklines, trends, animations | Medium |
| 8 | #193 Ph1 | Project heatmap — read-only with consultant cross-link | Medium |
| 9 | #210 Ph3 | Command palette: Contextual page filters | Medium |
| 10 | #230 | Closed needs section (met + abandoned) on Open Needs tab | Medium |
| 11 | #208 | Skill set categories rethink — structured grouping | Medium-Large |
| 12 | #233 | Testing portal: optional notes on passed test cases | Medium |
| 13 | #236 | Testing portal: visual screenshots for navigation paths | Medium |
| 14 | #234 | Testing portal: progress bar filter | Low |
| 15 | #220 | Bulk assign UI — row-select mechanism | Medium |
| 16 | #235 | Overview: Reintroduce project utilization KPI | Low |
| 17 | #229 | Bulk add need: inline-on-blur validation | Low |
| 18 | #221 | Quick Fill date input → StaffingDatePicker | Low |
| 19 | #222 | Deactivate consultant → in-app confirm | Low |
| 20 | #232 | Audit trail for cancelled invites/closed needs | Low |
| 21 | #183 | Contextual tooltips | Small |
| 22 | #184 | Admin getting-started checklist | Medium |
| 23 | #182 | In-app onboarding tour | Medium |

### Completed this session
- #243 — Change Password section: Settings → Account panel, all roles, Enter key submit, green inline success state ✓
- #240 — Open Needs donut: Unknown → Non-Client for null-client projects ✓
- #241 — Location autocomplete: replaced 50-city typeahead with ~230-city native datalist ✓
- #239 — Available Capacity KPI: filtered <45h, sorted by most available, heatmap color coding ✓
- Expand-to-match: two-tier model — Expand All = group level, client header = match level ✓
- Partner/MD level name fix across 4 locations
- Per-issue workflow .md created (docs/per-issue-workflow.md)

### V3 milestone (first external customer — after Pilot)
| # | Title |
|---|-------|
| #96 | Tenant onboarding |
| #97 | Extended roles |
| #118 | Audit log |
| #172 | Client hierarchy |
| #193 Ph2 | Project heatmap — interactive editing |
| #203 | Configure custom SMTP for branded emails |

---

## What Was Done This Session

### #243 — Change Password Section (CLOSED)
- Backend: POST /api/auth/change-password with throwaway Supabase client for verification
- Frontend: Account sub-nav in Settings, visible to all roles
- Sub-nav gating: Consultants (admin+RM), Users+Sandbox (admin), Account (all roles)
- Default panel: admin/RM → Consultants; PM/exec/consultant → Account
- Enter key submits from any password field
- Success state: green inline banner + 4s disabled form (replaces toast)
- chp* prefix on field IDs to avoid consultant-profile namespace collision
- Bugs fixed: signInWithPassword null-user pass-through, shared client session corruption, success path fall-through
- 17/17 UAT pass, 17 test cases in test-cases.json

### #240 — Unknown Donut Segment (CLOSED)
- Root cause: donut used 'Unknown', rows used 'Unassigned' → filter mismatch
- Renamed to 'Non-Client' across all 4 code locations
- Meridian's Pre-Sales Support + Internal Training have client_id=NULL by design
- 6/6 UAT pass, 6 test cases in test-cases.json

### Expand-to-Match Enhancement (CLOSED — no GitHub issue)
- Two-tier model: Expand All = group level only (instant), client header = match level (staggered)
- Bugs fixed: DOM sibling scoping, button label source of truth, collapse-before-filter ordering
- toggleAllNeedsClients reduced from ~65 to ~40 lines
- 8/8 UAT pass, 8 test cases in test-cases.json

### #241 — Location Autocomplete (CLOSED)
- Removed CP_CITIES (50 cities) + initLocationTypeahead (~80 lines)
- Replaced with native HTML datalist: ~230 options (Remote + ~190 US + 20 Indian cities)
- Freeform input still accepted — datalist suggests but does not restrict
- 7/7 UAT pass, 7 test cases in test-cases.json

### #239 — Available Capacity KPI (CLOSED)
- Server: filters booked<45h + is_active, sorts by level → availability
- Frontend: card shows filtered count, drilldown grouped by level
- Color coding: red (#DA291C) ≥30h free, yellow (#E8A317) 15-29h, green (#86BC25) <15h
- Partner/MD level name fix in 4 locations
- 8/8 UAT pass, 8 test cases in test-cases.json

### Test Cases Added: 46 total (chp 17, don 6, etm 8, loc 7, cap 8). New total ~164.

---

## Key Technical Decisions This Session

| Decision | Rationale |
|----------|-----------|
| Throwaway Supabase client for password verification | Shared client mutates session state on signInWithPassword |
| Check signInData.user AND signInError | Supabase returns null user with no error on bad creds |
| Explicit success path with return | Implicit fall-through caused toast to be swallowed |
| 'Non-Client' for null-client needs | 'Unassigned' implied something missing; 'Non-Client' is accurate |
| Two-tier expand model | Global expand-to-match caused race conditions with stagger timers |
| Button label as source of truth | Toggle variable got out of sync with visual state |
| Native datalist over custom typeahead | 80 lines replaced with zero JS |
| Heatmap color palette for capacity drilldown | Consistency with RA tab mental model |
| Full level name everywhere | "Partner/MD" shorthand caused "Other" bucket |

---

## Where to Pick Up (Session 40)

1. #231 — Testing portal retest double-press
2. #204 — Header redesign
3. #238 — Command palette consultant → RA row
4. #237 — Command palette search needs
5. UAT Round 1 completion: 40 untested cases

---

## Supabase Auth — Current State

| Email | Role | Tenant | testing_role | Status |
|-------|------|--------|-------------|--------|
| vaprabhakar@deloitte.com | admin | Meridian | none | Active |
| varun.prabhakar+meridian@gmail.com | admin | Meridian | test_admin | Active |
| varun.prabhakar+acme@gmail.com | admin | Acme Corp | test_admin | Active |
| varun.prabhakar+bigco@gmail.com | admin | BigCo Inc | test_admin | Active |
| varun.prabhakar+summit@gmail.com | admin | Summit LLC | test_admin | Active |
| rm_test@test.com | resource_manager | Meridian | tester | Active |
| pm_test@test.com | project_manager | Meridian | tester | Active |
| exec_test@test.com | executive | Meridian | tester | Active |
| tcallesen@deloitte.com | admin | Acme Corp | tester | Active |
| shsampath@deloitte.com | admin | BigCo Inc | tester | Active |
| nkolbow@deloitte.com | admin | Summit LLC | tester | Active |
| surendkumar@deloitte.com | resource_manager | Meridian | tester | Active |

## GitHub Operations Note
gh project item-add CLI silently fails. Use GraphQL with project ID PVT_kwHOAiRn_s4BTGRI.

## Windows git add -A Warning
Do NOT use git add -A. Stage files by name only.

## Cache Busters
- app.js?v=181
- styles.css?v=72

# Handoff v38 — Session 38 Close

**Date:** 2026-04-07
**Branch:** main
**Last commit:** e1dfd70
**Status:** Pilot active. 4 testers onboarded. Invite flow reworked. Overview redesigned.

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

### Pilot milestone (open issues — prioritized)
| Priority | Issue | Description | Effort |
|----------|-------|-------------|--------|
| 1 | — | Finish UAT Round 1: Cross-cutting (8), RBAC (22), Sandbox Reset (5), Tenant Isolation (5) | Medium |
| 2 | — | Post-UAT failure report → batch fix → retest | Medium |
| 3 | #243 | Settings: Change Password section for all users | Medium |
| 4 | #239 | Overview: Available Capacity KPI — only <45h, sorted by availability | Medium |
| 5 | #240 | Open Needs: Unknown donut segment — needs without client/project | Medium |
| 6 | #204 | Main app header redesign | Medium |
| 7 | #238 | Command palette: Consultant result → Resource Allocation row | Medium |
| 8 | #237 | Command palette: Search open needs + rename Projects label | Medium |
| 9 | #193 Ph1 | Project heatmap — read-only with consultant cross-link | Medium |
| 10 | #242 | Overview: Wow layer — sparklines, trends, animations | Medium |
| 11 | #241 | Settings: Consultant location autocomplete — incomplete city list | Medium |
| 12 | #210 Ph3 | Command palette: Contextual page filters | Medium |
| 13 | #208 | Skill set categories rethink — structured grouping | Medium-Large |
| 14 | #231 | Testing portal: retest requires double-press to pass | Medium |
| 15 | #233 | Testing portal: optional notes on passed test cases | Medium |
| 16 | #230 | Closed needs section (met + abandoned) on Open Needs tab | Medium |
| 17 | #236 | Testing portal: visual screenshots for navigation paths | Medium |
| 18 | #183 | Contextual tooltips | Small |
| 19 | #184 | Admin getting-started checklist | Medium |
| 20 | #182 | In-app onboarding tour | Medium |
| 21 | #220 | Bulk assign UI — row-select mechanism | Medium |
| 22 | #235 | Overview: Reintroduce project utilization KPI | Low |
| 23 | #229 | Bulk add need: inline-on-blur validation | Low |
| 24 | #221 | Quick Fill date input → StaffingDatePicker | Low |
| 25 | #222 | Deactivate consultant → in-app confirm | Low |
| 26 | #234 | Testing portal: progress bar filter | Low |
| 27 | #232 | Audit trail for cancelled invites/closed needs | Low |

### Completed this session
- #213 — Tester onboarding: 4 users across 4 tenants ✓
- #214 — Overview tab UX/UI audit: 15/15 pass, KPI removal + urgency panel, 2x2 grid, content scaling ✓
- Invite flow rework: Own the token (7-day TTL, single-use, 18/18 UAT pass)
- Walkthrough page deployed at /walkthrough.html + sidebar link
- Architecture page deployed at /architecture.html + sidebar link
- General feedback textarea fix (always editable, supports multiple submissions)
- set-password.html rewrite (custom token validation, no Supabase client)
- testing.html: "Heatmap" → "Resource Allocation" rename
- testing.html: Updated invite flow test cases (custom token)

### V3 milestone (first external customer — after Pilot)
| # | Title |
|---|-------|
| #96 | Tenant onboarding |
| #97 | Extended roles |
| #118 | Audit log (scope expanded via S38 pilot feedback) |
| #172 | Client hierarchy |
| #193 Ph2 | Project heatmap — interactive editing |
| #203 | Configure custom SMTP for branded emails |

---

## What Was Done This Session

### #213 — Tester Onboarding (CLOSED)
- Audited sandbox data across all 4 tenants
- Enriched skill catalogs: 16 skills per tenant (8 Practice Areas + 8 Technologies)
- Assigned 2-4 skills per consultant across all 100 consultants
- Attached skill requirements to all open needs
- Cleaned duplicate test needs in Meridian
- Deployed walkthrough page at /walkthrough.html (no auth, sidebar link)
- Deployed architecture page at /architecture.html (no auth, sidebar link)
- Set testing_role: tester for all 4 pilot testers
- Fixed expired token issues (Tim, Shreyas, Nick)
- All 4 testers confirmed active

### #214 — Overview Tab Audit (CLOSED)
- 15/15 UAT pass (after 1 fix)
- "View Heatmap" → "View Resource Allocation" in drilldown modals
- Removed "Projects with Most Utilization" KPI (#235 backlog)
- Added "Open Needs by Urgency" panel (Urgent/Soon/Planned)
- Converted to 2x2 CSS grid (equal-height panels)
- Scaled up content: larger fonts, thicker bars, bigger urgency counts
- Full viewport fill — no dead space

### Invite Flow Rework (18/18 UAT pass)
- Replaced Supabase generateLink with custom invite tokens
- Backend: createUser + crypto.randomUUID() token in app_metadata
- 7-day TTL, single-use (token cleared after password set)
- New endpoints: POST /api/auth/validate-invite, POST /api/auth/set-password, POST /api/admin/users/:id/reset-password, POST /api/admin/users/:id/resend-invite
- Frontend: set-password.html rewritten (no Supabase client, reads ?invite= param)
- Invite modal shows copyable link with 7-day TTL note
- Resend Invite for pending users, Reset Password for active users
- Pending/Active badge based on last_sign_in_at

### Other Fixes & Additions
- General feedback append logic (server-side, preserves all submissions)
- General feedback textarea always editable (testing.html)
- testing.html: "Heatmap" → "Resource Allocation" rename
- testing.html: Updated invite flow test cases
- set-password.html expired link UX (mailto fallback)
- Walkthrough: UAT guidance section added
- Getting Started + Testing Portal open in separate browser windows
- Window behavior: external links reset app to Overview
- Email link in walkthrough footer

### Issues Created This Session
| # | Title | Type | Priority |
|---|-------|------|----------|
| #229 | Bulk add need: inline-on-blur validation upgrade | enhancement | low |
| #230 | Closed needs section on Open Needs tab | enhancement | medium |
| #231 | Testing portal: retest requires double-press | bug | medium |
| #232 | Audit trail for cancelled invites/closed needs | enhancement | low |
| #233 | Testing portal: optional notes on passed cases | enhancement | medium |
| #234 | Testing portal: merge filter tabs into progress bar | enhancement | low |
| #235 | Overview: Reintroduce project utilization KPI | enhancement | low |
| #236 | Testing portal: visual screenshots for navigation paths | enhancement | medium |
| #237 | Command palette: Search open needs | enhancement | medium |
| #238 | Command palette: Consultant result → RA row | enhancement | high |
| #239 | Overview: Available Capacity KPI filter + sort | enhancement | high |
| #240 | Open Needs: Unknown donut segment | bug | high |
| #241 | Consultant location autocomplete | bug | medium |
| #242 | Overview: Wow layer | enhancement | medium |
| #243 | Change Password section | enhancement | high |

### Issues Closed This Session
| # | Title |
|---|-------|
| #213 | Tester onboarding ✓ |
| #214 | Overview tab UX/UI audit ✓ |

---

## UAT Round 1 — Current Status

| Category | Total | Tested | Pass | Fail (deferred) |
|----------|-------|--------|------|-----------------|
| Auth | 7 | 7 | 7 | 0 |
| Overview | 9 | 9 | 8 | 1 (#214) |
| Resource Allocation | 12 | 12 | 11 | 1 (#221) |
| Open Needs | 23 | 23 | 21 | 2 (#220) |
| Settings: Consultants | 9 | 9 | 8 | 1 (#222) |
| Settings: Users | 7 | 7 | 7 | 0 |
| Ask Claude | 6 | 6 | 6 | 0 |
| Cross-cutting | 8 | 0 | — | — |
| RBAC | 22 | 0 | — | — |
| Sandbox Reset | 5 | 0 | — | — |
| Tenant Isolation | 5 | 0 | — | — |
| **Total** | **113** | **73** | **70** | **4 deferred** |

---

## Key Technical Decisions This Session

| Decision | Rationale |
|----------|-----------|
| Own invite tokens (not Supabase generateLink) | Supabase tokens expire quickly, get consumed on click even when expired. Our tokens: 7-day TTL, single-use, we control lifecycle. 18/18 UAT pass. |
| createUser instead of generateLink | User created confirmed but without password. Token in app_metadata. Password set via our endpoint. |
| Pending badge based on last_sign_in_at | confirmed_at is unreliable after admin API fixes. last_sign_in_at is the only trustworthy signal. |
| 2x2 CSS grid for Overview panels | Equal-height panels fill viewport. Flex:1 caused disproportionate stretching. |
| Remove "Projects with Most Utilization" KPI | Lacked context without a Projects page. Replaced with "Open Needs by Urgency". |
| Architecture + Walkthrough as hosted pages | No auth required, discoverable via sidebar, always up to date. |

---

## Cache Busters
- app.js?v=166
- styles.css?v=72

---

## Where to Pick Up (Session 39)

1. Finish UAT Round 1 — Cross-cutting (8), RBAC (22), Sandbox Reset (5), Tenant Isolation (5)
2. Post-UAT failure report → batch fix → retest
3. #243 — Change Password section (pilot users need this)
4. #239 — Available Capacity KPI fix (pilot feedback)
5. #240 — Unknown donut segment fix (pilot feedback)
6. #204 — Main app header redesign
7. Collect and triage ongoing pilot tester feedback
8. Overview wow layer (#242) when bandwidth allows

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

---

## GitHub Operations Note
gh project item-add CLI silently fails. Use GraphQL with project ID PVT_kwHOAiRn_s4BTGRI.

## Windows git add -A Warning
Do NOT use git add -A on Varun's Windows machine. Stage files by name only.

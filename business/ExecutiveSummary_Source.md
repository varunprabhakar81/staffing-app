# Executive Summary — Source File
# Staffing Intelligence

> This file is the single source of truth for the executive summary deck.
> Update the content below, then regenerate the PPTX using the CC prompt at the bottom.

---

## Deck metadata

- **Title:** Staffing Intelligence
- **Subtitle:** Real-time staffing management for a modern consulting practice
- **Organisation:** Deloitte · NetSuite Practice
- **Date:** March 2026
- **Status line:** Live in production · 25 consultants
- **URL:** staffing-app-production.up.railway.app

---

## Slide 1 — Title

No edits needed. Pulls from deck metadata above.

---

## Slide 2 — What we built

**Heading:** A platform that replaces spreadsheets
**Subheading:** Built from scratch in 18 sessions — live on Railway, backed by Supabase, powered by Claude AI.

### Capability cards (8)

| Title | Description |
|---|---|
| Availability heatmap | Weekly hours by consultant across all projects. Inline editing, no spreadsheets. |
| Role-based access | 4 roles — admin, resource manager, project manager, executive. |
| Ask Claude (AI) | Natural language queries against live staffing data. |
| Staffing needs pipeline | Open roles matched to available consultants with AI recommendations. |
| Utilization dashboard | KPIs, overallocation alerts, rolling-off warnings, top projects. |
| User management | Invite, activate, deactivate and manage roles from an admin panel. |
| Consultant profile editor | View and edit skill sets, level, location, and rate overrides per consultant. Role-gated. |
| Consultants management panel | Manage all 25 consultants from Settings — edit, deactivate, and reactivate. |

---

## Slide 3 — Where we are

**Hero stat:** 80%
**Hero label:** of v1 complete
**Progress bar:** 80% filled

**Supporting text:** 35 issues shipped across auth, RBAC, heatmap editing, user management, consultant management, AI integration, and production deploy.

### KPI cards (4)

| Value | Label |
|---|---|
| 18 | Sessions shipped |
| 35 | Issues closed |
| ~13h | To v1 stable |
| ~60h | Phase 2 scope |

---

## Slide 4 — Build phases

**Heading:** Four phases from zero to multi-tenant scale
**Footer:** Each phase ships to production — no big-bang release.

### Phases

| Phase | Status | Colour | Items |
|---|---|---|---|
| Foundation | Complete | green | Supabase data layer · Real-time SSE refresh · Railway production deploy · Auth + session management · Row-level security |
| Core platform | Complete | green | Availability heatmap · RBAC — 4 roles · User management panel · Staffing needs + AI match · Overview dashboard |
| V1 stable | In progress · ~13h | amber | Session role staleness fix · UAT sign-off · Auth hardening · User mgmt enhancements · UX polish pass |
| Phase 2 | Planned · ~60h | blue | Multi-tenant onboarding · Finance + ops dashboard · Weekly snapshots · Extended roles · Excel export/import |

---

## Slide 5 — What's next

**Heading:** V1 Stable — production-ready in ~13h of build time

### Next items

| ID | Title | Description | Est. |
|---|---|---|---|
| #123 | Session role staleness fix | Role changes take effect immediately without requiring a manual logout. | 2h |
| #82 | UAT completion | Write formal test script and sign off before onboarding real users. | 2h |
| #102 | Email verification flow | Enforce magic link confirmation for invited users. | 2h |
| #103 | Password strength policy | Enforce complexity rules in Supabase Auth for all user accounts. | 1h |
| #100 | User management access enhancements | Additional access controls and audit columns for the admin panel. | 2h |

---

## How to regenerate the PPTX

When content above changes, run this CC prompt in the staffing-app repo:

```
Read ExecutiveSummary_Source.md from the repo root. Using the content in that file, regenerate Staffing_Intelligence_Executive_Summary.pptx using the existing build_deck.js script as a base. Update build_deck.js to reflect any changed content — headings, stats, card titles, phase items, next items, dates, and KPIs. Then run: node build_deck.js. Convert to PDF and render slide images for visual QA. Report any layout issues found.
```

## Colour palette reference (do not change without designer sign-off)

| Name | Hex |
|---|---|
| Navy (primary bg) | 1E2761 |
| Ice blue (text on navy) | CADCFC |
| Teal (accent) | 0D9488 |
| White | FFFFFF |
| Off-white (light slide bg) | F4F6FB |
| Amber (in progress) | F59E0B |
| Slate (body text) | 64748B |
| Light (badge bg) | E8EDF6 |
| Green (complete) | 059669 |
| Muted (footer text) | 94A3B8 |

---

## Version history

| Version | Date | Changes |
|---|---|---|
| 1.0 | March 24 2026 | Initial deck — Session 13 complete |
| 1.1 | March 25 2026 | Session 18 — Soon milestone cleared, consultant profile editor + management panel shipped, 35 issues closed, V1 Stable next |

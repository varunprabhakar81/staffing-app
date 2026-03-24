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
**Subheading:** Built from scratch in 13 sessions — live on Railway, backed by Supabase, powered by Claude AI.

### Capability cards (6)

| Title | Description |
|---|---|
| Availability heatmap | Weekly hours by consultant across all projects. Inline editing, no spreadsheets. |
| Role-based access | 4 roles — admin, resource manager, project manager, executive. |
| Ask Claude (AI) | Natural language queries against live staffing data. |
| Staffing needs pipeline | Open roles matched to available consultants with AI recommendations. |
| Utilization dashboard | KPIs, overallocation alerts, rolling-off warnings, top projects. |
| User management | Invite, activate, deactivate and manage roles from an admin panel. |

---

## Slide 3 — Where we are

**Hero stat:** 72%
**Hero label:** of v1 complete
**Progress bar:** 72% filled

**Supporting text:** 30 issues shipped across auth, RBAC, heatmap editing, user management, AI integration, and production deploy.

### KPI cards (4)

| Value | Label |
|---|---|
| 13 | Sessions shipped |
| 30 | Issues closed |
| ~29h | To v1 stable |
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
| V1 stable | In progress · ~29h | amber | Search + week selector · Consultant management UI · Security hardening · UX polish pass · UAT sign-off |
| Phase 2 | Planned · ~60h | blue | Multi-tenant onboarding · Finance + ops dashboard · Weekly snapshots · Extended roles · Excel export/import |

---

## Slide 5 — What's next

**Heading:** Soon queue — v1 stable in ~29h of build time

### Next items

| ID | Title | Description | Est. |
|---|---|---|---|
| #120 | Wire search input on heatmap | Type a consultant or project name to instantly filter the staffing view. | 2h |
| #121 | Wire week selector dropdown | Navigate to any date range from the heatmap header — no page reload. | 2h |
| #126 | Consultant management panel | Admin UI to manage billability, capacity, and rate overrides per consultant. | 6–8h |
| #124 | Add new assignment from heatmap | Assign a consultant to a project directly from the UI — no database access needed. | 3–4h |
| #123 | Session role staleness fix | Role changes take effect immediately without requiring a manual logout. | 2h |

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

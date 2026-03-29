# Staffing Intelligence

A real-time staffing management platform for professional services consulting teams — built on Node.js, Supabase, and Claude AI.

Live at: https://staffing-app-production.up.railway.app

---

## What it does

- **Availability heatmap** — Rolling 12-week view of consultant hours across all projects. Inline editing with instant save. 4-tier color scheme: Red 0–10h / Yellow 11–44h / Green 45h / Orange 46h+. Click consultant name to open profile modal; chevron toggles row expand/collapse.
- **Utilization dashboard** — KPI cards, utilization by seniority level, overallocation warnings, rolling-off alerts, top projects by utilization.
- **Drilldowns** — Every KPI card, project row, need item, heatmap cell, and donut segment is clickable with contextual detail modals. All modals open expanded with Expand/Collapse All.
- **Staffing needs pipeline** — Open demand roles matched against available consultants with AI-powered recommendations. Any-skill matching (allSkillSets.includes). Accepted matches persist to database with date range guard.
- **Ask Claude** — Natural language Q&A against live staffing data powered by Claude Sonnet.
- **Role-based access** — 4 roles (admin, resource_manager, project_manager, executive) with tab-level and API-level enforcement.
- **User management** — Invite, activate, deactivate, and manage roles for all practice users from an admin panel. Users grouped by role. Click user name to edit role inline.
- **Consultant profiles** — Edit consultant details, skill sets, level, and location from a Settings panel. Consultants grouped by level. Click name to open profile editor (with Smart Discard for unsaved changes).
- **Session security** — Role changes and deactivations take effect within 30 seconds with no action required by the affected user.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Data | Supabase (Postgres) with Row-Level Security |
| Auth | Supabase Auth + express-session (JWT + server-side sessions) |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| Frontend | Vanilla JS SPA, Chart.js, dark theme |
| Deployment | Railway (auto-deploy from GitHub main) |

---

## Getting started

### Prerequisites
- Node.js 18+
- A Supabase project with the schema set up
- An Anthropic API key

### Install and run

```bash
npm install
cp .env.example .env   # fill in your keys
node server.js
```

Open http://localhost:3000 — you'll be redirected to the login page.

### Environment variables

```
ANTHROPIC_API_KEY=your-key
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SESSION_SECRET=random-32-byte-hex
TENANT_ID=your-tenant-uuid
NODE_ENV=development
```

---

## Authentication

- Email/password via Supabase Auth
- Server-side sessions via express-session (httpOnly cookie, 8-hour maxAge)
- Role stored in `app_metadata.role` in Supabase, stamped into JWT via `custom_access_token_hook`
- 4 roles: `admin`, `resource_manager`, `project_manager`, `executive`
- apiFetch() wrapper: all API calls redirect to login on 401
- Background session poll every 30s — auto-logout on role change or deactivation
- Invite flow: temp password only (magic link removed). SSO placeholder for V3.

---

## Project structure

```
staffing-app/
├── server.js              # Express backend + all API routes
├── supabaseReader.js      # Supabase data layer
├── claudeService.js       # Claude API integration
├── public/
│   ├── index.html         # Main app shell
│   ├── app.js             # Frontend SPA logic (v=88)
│   ├── styles.css         # Dark theme styles (v=42)
│   └── login.html         # Login page
├── docs/
│   └── session-24/
│       ├── HANDOFF_v24.md
│       ├── README_v24.md
│       ├── Roadmap_v24.md
│       └── session-dashboard_v24.html
```

---

## Development workflow

This project is built using Claude Code (CC) as a co-pilot. Each session starts with a new Claude chat — upload HANDOFF_v24.md and session-dashboard_v24.html to load context.

```bash
# Terminal 1 — Claude Code
cd staffing-app
claude

# Terminal 2 — Local server
node server.js
```

Railway auto-deploys from GitHub on every push to `main`. Allow 1–3 min for build.

---

## Status

- **Version:** Phase 2 in progress
- **Consultants:** 25 real employees, real project data
- **Sessions:** 24 build sessions completed
- **Issues closed:** 105
- **Current milestone:** Phase 2 — #156 (Open Needs filter), #165 (Settings nav), #162–#164 (demand CRUD) next

See `Roadmap_v24.md` for the full prioritized build queue.

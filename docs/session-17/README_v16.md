# Staffing Intelligence

A real-time staffing management platform for professional services consulting teams — built on Node.js, Supabase, and Claude AI.

Live at: https://staffing-app-production.up.railway.app

---

## What it does

- **Availability heatmap** — Rolling 12-week view of consultant hours across all projects. Inline editing with instant save. No spreadsheets.
- **Utilization dashboard** — KPI cards, utilization by seniority level, overallocation warnings, rolling-off alerts, top projects by utilization.
- **Staffing needs pipeline** — Open demand roles matched against available consultants with AI-powered recommendations.
- **Ask Claude** — Natural language Q&A against live staffing data powered by Claude Sonnet.
- **Role-based access** — 4 roles (admin, resource_manager, project_manager, executive) with tab-level and API-level enforcement.
- **User management** — Invite, activate, deactivate, and manage roles for all practice users from an admin panel.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Data | Supabase (Postgres) with Row-Level Security |
| Auth | Supabase Auth + express-session (JWT + server-side sessions) |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Frontend | Vanilla JS SPA, Chart.js, dark theme |
| Deployment | Railway (auto-deploy from GitHub main) |

---

## Getting started

### Prerequisites
- Node.js 18+
- A Supabase project with the schema set up (see below)
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

## Data

All data lives in Supabase. The app uses a dual-client pattern:
- `serviceClient` — service role key, bypasses RLS, used for all data reads and writes
- `anonClient` — per-request JWT, RLS enforced, used for auth operations only

Key tables: `consultants`, `resource_assignments`, `projects`, `clients`, `needs`, `levels`, `skill_sets`

To seed initial data from Excel, run:
```bash
node import-to-supabase.js
```

---

## Authentication

- Email/password via Supabase Auth
- Server-side sessions via express-session (httpOnly cookie, 8-hour maxAge)
- Role stored in `app_metadata.role` in Supabase, stamped into JWT via `custom_access_token_hook`
- 4 roles: `admin`, `resource_manager`, `project_manager`, `executive`

---

## Project structure

```
staffing-app/
├── server.js              # Express backend + all API routes
├── supabaseReader.js      # Supabase data layer
├── claudeService.js       # Claude API integration
├── public/
│   ├── index.html         # Main app shell
│   ├── app.js             # Frontend SPA logic
│   ├── styles.css         # Dark theme styles
│   └── login.html         # Login page
├── business/
│   ├── ExecutiveSummary_Source.md   # Executive deck content source
│   └── build_deck.js               # pptxgenjs deck generator
├── HANDOFF_7.md           # Full technical context for AI-assisted development
├── NewChatPrompt_v2.md    # Starter prompt for new Claude Code sessions
├── Roadmap_v2.md          # Prioritized issue roadmap with effort estimates
└── session_tracker.md     # Session-by-session task checklist
```

---

## Development workflow

This project is built using Claude Code (CC) as a co-pilot. Start each session by pasting `NewChatPrompt_v2.md` into a new Claude chat. All technical context is in `HANDOFF_7.md`.

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

- **Version:** v1 in progress (72% complete as of Session 13)
- **Consultants:** 25 real employees, real project data
- **Sessions:** 13 build sessions completed
- **Issues closed:** 30
- **Next milestone:** V1 stable — ~29h of build remaining

See `Roadmap_v2.md` for the full prioritized build queue.

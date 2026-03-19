# Staffing Intelligence Platform

A resource management dashboard for professional services teams — built on Node.js, Excel data, and Claude AI.

## What it does

- **Availability Heatmap** — All employees as rows, 12 rolling weeks as columns. Color-coded by utilization status (bench, underutilized, nominal, full, overbooked). Expandable rows show project-level breakdown per employee. Virtual scrolling for 44+ employees.
- **KPI Strip** — Headcount, average utilization, bench count, open demand roles. All clickable with drilldown panels.
- **Needs Coverage** — Donut chart categorizing open demand roles as Fully Met / Partially Met / Unmet based on weekly availability.
- **Project Roll-off Cliffs** — Weekly booked vs available hours chart highlighting weeks with mass roll-offs.
- **Ask Claude** — Natural language Q&A powered by Claude Sonnet. Ask about coverage gaps, bench talent, utilization, upcoming cliffs.

## Tech stack

- **Backend**: Node.js + Express
- **Data layer**: Excel (exceljs) — Supply, Demand, Master tabs
- **AI**: Anthropic Claude API (claude-sonnet)
- **Frontend**: Vanilla JS SPA, Chart.js, dark theme with pastel color palette
- **Deployment**: Railway

## Getting started

### Prerequisites
- Node.js 18+
- Anthropic API key

### Install and run

```bash
npm install
ANTHROPIC_API_KEY=your_key_here node server.js
```

Open `http://localhost:3000`

### Data

Place your staffing Excel file at `data/resourcing.xlsx` with three tabs:
- **Supply** — Employee bookings by week (one row per employee per week)
- **Demand** — Open role requirements (project, role, hours needed, week)
- **Master** — Employee master data (name, level, skill set, capacity)

## Project status

V1 is feature-complete and running with real data (44 employees, 8 demand roles).

See [V2-VISION.md](V2-VISION.md) for the roadmap toward a commercial-grade platform with SQLite, drag-and-drop staffing UI, and AI booking engine.

## Repository

- `main` — V1 production branch
- `v2-commercial` — V2 planning and early development

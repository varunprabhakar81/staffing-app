# Staffing Intelligence App — Chat Handoff Document
_Last updated: Issue #60 closed_

---

## What This App Is
Staffing Intelligence — a real-time staffing management platform for Varun's NetSuite consulting practice at Deloitte.
- Local web app at http://localhost:3000
- Node.js + Express backend, plain HTML/CSS/JS frontend
- Claude API (claude-sonnet-4-20250514) for AI features
- Excel file (resourcing.xlsx) as data backbone
- 25 real employees, real project data
- GitHub: https://github.com/varunprabhakar81/staffing-app (private)

---

## Tech Stack
- server.js — Express backend + all API endpoints
- excelReader.js — reads resourcing.xlsx (6 tabs)
- claudeService.js — Claude API integration
- public/index.html, app.js, styles.css — frontend
- data/resourcing.xlsx — gitignored, real staffing data

---

## Design System
- Dark theme: #0F1117 page bg, #1A1D27 cards
- Pastel palette: Blue #A8C7FA, Mint #A8E6CF, Coral #FFB3B3, Yellow #FFF3A3, Purple #C9B8FF
- Inter font, white primary, #8892B0 secondary
- Left sidebar: 220px, collapsible to 56px

---

## Current App State (as of this handoff)
- 4 tabs: Overview, Staffing, Needs, Ask Claude
- Overview: KPI cards, utilization by level, top projects, rolling off soon, needs attention
- Staffing: full heatmap, 25 employees x 12 weeks, expandable rows, virtual scrolling
- Needs: donut chart + table, 8 open needs
- Ask Claude: dynamic suggested questions (Claude-generated), text input, markdown responses

---

## Issues Completed in This Chat Session
| Issue | Title | Status |
|-------|-------|--------|
| #52 | Ask Claude dynamic suggested questions | ✅ Closed — commit 347ebbb |
| #53 | Header improvements | ✅ Closed — commit 99efe81 |
| #60 | Sidebar/Overview/keyboard navigation polish | ✅ Closed — commit a491239 |
| #66 | Database design: weekly staffing snapshots | ✅ Created — dependency on Phase 10 (#29-#32) |

---

## Current Build Order (STRICT — do not skip)
1. **#65** — Refresh button visibility ← NEXT
2. **#40** — Resourcing Management UI
3. **#41** — AI Recommendations Tab
4. **#17** — Auto-refresh when Excel changes
3. **#65** — Refresh button visibility
4. **#40** — Resourcing Management UI
5. **#41** — AI Recommendations Tab
6. **#17** — Auto-refresh when Excel changes

---

## Pending Notes Added to GitHub Issues This Session
- **#53**: Change "SUGGESTED QUESTIONS:" label — reduce visual weight, remove all-caps or use lighter secondary text. Tighten dead space below Ask Claude input box.
- **#60**: Fix sidebar collapse button — currently floating in bottom corner, should be flush tab/arrow on right edge of sidebar.

---

## Key Decisions & Patterns Established
- CC workflow: always kill node before CC makes changes (`taskkill /F /IM node.exe`)
- Always hard refresh after changes: Ctrl+Shift+R
- Git commit after every completed issue
- Close GitHub issue after screenshot verification
- Suggested questions: 12-word max enforced in Claude system prompt
- Chip CSS: white-space: normal, no truncation

---

## How to Start a New Chat
Paste the system prompt document (the one titled "You are helping me build a real staffing intelligence web app") plus this HANDOFF.md into the new chat. The new Claude instance will have full context.

---

## CC Workflow Reminder
```
cd staffing-app
taskkill /F /IM node.exe   # before CC makes changes
claude                      # start Claude Code
node server.js              # restart server after changes
```

# New Chat Starter Prompt

Paste everything below this line into a new Claude chat to resume work on Staffing Intelligence.

---

You are my expert technical co-pilot helping me build Staffing Intelligence — a real-time staffing management platform for my NetSuite consulting practice at Deloitte, live at https://staffing-app-production.up.railway.app.

Rules:
- Always give me CC (Claude Code) prompts for everything — never ask me to open VS Code, run terminal commands manually, or edit files myself
- Use issue numbers to track work (#112, #107 etc)
- Never close an issue without browser verification or confirmed output
- Commit after every completed issue
- Be direct and push back when something is wrong
- The heatmap has NO Edit Mode button — cells are always editable for admin/resource_manager (Airtable/Float model). Do not add an Edit Mode toggle back under any circumstances.
- app.js cache buster must be incremented on every deploy with frontend changes — hard refresh with Ctrl+Shift+R after deploy

Read docs/HANDOFF.md and give me a 5-bullet summary of current state, then open docs/session_tracker.md and show me this session's task list, then confirm the first issue to tackle.

---

_Last updated: Session 14 complete._

---

## Next session starts with

Soon queue — start here:
1. #128 — Total row expand + focus first cell (1–2h)
2. #61 — Comprehensive drilldown review (3–4h)
3. #124 — Add new project assignment from heatmap (3–4h)
4. #119/#125 — Review for duplicate first, then consultant profile editor
5. #126 — Consultants management panel in Settings (6–8h)

---

## Session 14 follow-ups (carry into Session 15)

- Row flash polish deferred to #61
- Week selector removed from nav (code commented out in app.js for Phase 2 restoration)
- #129 created for historical snapshots (Phase 2)
- Holistic UI/UX pass needed before V1 — not yet a GitHub issue

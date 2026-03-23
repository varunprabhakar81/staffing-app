# Staffing Intelligence — Codebase Hygiene Checklist

Run this audit periodically (end of every session or before major releases) using CC.

---

## How to Run

Paste the audit prompt below into CC at the start or end of a session.

---

## Audit Prompt

Run a comprehensive audit of the staffing-app codebase. Check the following and report findings for each category:

1. Dead Code
- Search for any references to _editMode, editMode, toggleEditMode, hmEditToggle, conflictBanner
- Search for any references to pendingChanges (should be _pendingStaffing)
- Search for any remaining alert() calls
- Search for any console.log, console.warn, console.error statements left in app.js

2. Cache Buster
- Check the current app.js?v= version in index.html
- Check the styles.css?v= version in index.html
- Report both numbers

3. Gitignore Health
- Show the full contents of .gitignore
- Confirm business/ and *.docx are in there

4. TODO / FIXME / HACK comments
- Search all .js files for TODO, FIXME, HACK, XXX comments
- Report file, line number, and content

5. Unused routes
- List all app.get, app.post, app.patch, app.delete routes in server.js
- Flag any that have no corresponding fetch() call in app.js

6. Environment variable usage
- List all process.env references in server.js and supabaseReader.js
- Confirm all 7 required env vars are referenced:
  ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, SESSION_SECRET, TENANT_ID, NODE_ENV

7. Error handling gaps
- Find any fetch() calls in app.js that have NO try/catch and NO .catch() handler
- Report file and line number

8. index.html hygiene
- Check for any duplicate script or link tags
- Confirm favicon, Inter font, chart.js, marked.js are all present

Report everything found. Do not fix anything yet — audit only.

---

## Triage Guide

| Finding | Action |
|---|---|
| Dead code references (_editMode etc) | Delete immediately |
| alert() calls | Replace with showToast() |
| console.log/warn left in app.js | Remove unless in error handlers |
| Unused routes in server.js | Investigate before deleting — may be intentional |
| Missing try/catch on fetch() | Wrap with try/catch + showToast error |
| Cache buster not incremented | Increment app.js?v= in index.html after every frontend deploy |
| Env vars missing | Add to .env and Railway dashboard immediately |

---

## Notes
- console.error in Dashboard (~line 319) and Ask Claude (~line 2317) are intentional — do not remove
- Run hygiene check before every handoff doc update
- Always fix findings in a single batch commit: "chore: hygiene audit fixes"

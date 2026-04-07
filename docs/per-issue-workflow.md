# Per-Issue Workflow & UAT Widget Spec

## Per-Issue Workflow

Every issue follows this sequence. Do not skip steps or reorder.

1. **Implement** — Claude drafts the CC prompt, Varun pastes into Claude Code, CC implements
2. **Verify** — Quick smoke test to confirm the implementation works at all
3. **UAT widget in chat** — Interactive widget rendered inline (see spec below). Test all cases, fix failures, retest until all pass
4. **Add test cases to testing.html** — CC prompt to add cases to public/test-cases.json (which feeds testing.html dynamically). Run after UAT passes.
5. **Next issue** — Move to the next item on the session stack

### Rules
- Never commit or close an issue without completing steps 1-4
- If UAT reveals bugs, fix → retest from the failing case (don't restart the full suite)
- Test cases added to test-cases.json must match the UAT cases that were actually tested (same IDs, same descriptions)
- Partial submit is allowed on UAT widgets — results can be sent without completing all tests

---

## UAT Widget Spec

The UAT widget is an interactive HTML widget rendered inline in Claude chat via visualize:show_widget. It is the standard format for all issue testing.

### Layout
- Context header (grey background, rounded): issue title, login creds, role/tenant/tab
- Progress counter (right-aligned): "0 / N tested"
- Section headers (small caps, uppercase, letter-spacing 1.5px)
- Test cards (expanded by default, left border accent)
- Submit button (right-aligned)

### Context Header
- Grey background (var(--color-background-secondary)), rounded corners
- 3 lines: issue title, login creds (bold), role/tenant/tab metadata
- When retesting, line 2 can show previously passed cases

### Test Cards
- Always expanded — no click-to-expand
- Left border: 3px, default grey, green on Pass, red on Fail
- Fields: ID + name (bold), Steps, Expected, Hint (italic, prefixed with ↳)

### Buttons
- Pass: background #E1F5EE, color #0F6E56, border #1D9E75
- Fail: background #FCEBEB, color #A32D2D, border #E24B4A
- Use explicit hex colors, NOT CSS variables
- No Skip button

### Notes Button
- Small button below Pass/Fail on each card
- Mandatory on Fail: auto-opens, blocks submit until filled
- Optional on Pass
- Highlights when note entered (color #185FA5, border #185FA5)

### Submit Behavior
- Always enabled (not gated on all tests complete)
- Only blocked when a failed test is missing its note
- Uses sendPrompt() to send results to chat
- MUST include pass notes when provided
- Untested cases listed separately

### Retest Widgets
- Only include failed/untested cases
- Context header references previously passed cases
- Hint text references fix commit and prior failure

### Common Mistakes to Avoid
- Pass notes not in submit output (recurring bug — must fix)
- CSS variables for button colors (unreliable contrast)
- Requiring all tests complete before submit
- Cards collapsed by default
- Including a Skip button

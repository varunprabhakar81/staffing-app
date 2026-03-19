const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const GH   = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const REPO = 'varunprabhakar81/staffing-app';

// GitHub issue # → body content
// Current mapping: GitHub #1-#27 = TASKS.md #6-#32
// TASKS.md #1-#5 (foundation) have no GitHub issues
const issues = {

  1: `## Build Excel reader (parse all tabs)
> **Phase 2 – Backend** | TASKS.md #6

### What this does
Creates \`excelReader.js\` — the data access layer for the entire app. Uses \`exceljs\` to open \`data/resourcing.xlsx\` and parse all 6 tabs into clean JavaScript objects that the rest of the backend can consume.

### Flow
\`\`\`
server starts
  └─► readStaffingData()
        └─► opens data/resourcing.xlsx
              ├─► Supply tab        → supply[]
              ├─► Demand tab        → demand[]
              ├─► Employee Master   → employees[]
              ├─► Skills Master     → skills[]
              ├─► Resource Levels   → resourceLevels[]
              └─► Project Master    → projects[]
                    └─► returns { supply, demand, employees, skills, resourceLevels, projects }
\`\`\`

### Tasks
- [x] Create \`excelReader.js\` using \`exceljs\`
- [x] Parse Supply tab: Employee Name, Skill Set, Project Assigned, weekly hour columns
- [x] Parse Demand tab: Project/Client Name, Resource Level, Resource Skill Set, Start Date, End Date
- [x] Parse Employee Master: Employee Name, Level
- [x] Parse Skills Master: Skill Set
- [x] Parse Resource Levels: Level
- [x] Parse Project Master: Project ID, Project Name
- [x] Export \`readStaffingData()\` returning all 6 tabs as a single object
- [x] Add error handling for missing file and missing tabs
- [x] Add self-test: \`node excelReader.js\` prints row counts per tab
- [x] Import and call \`readStaffingData()\` in \`server.js\` at startup

### Acceptance Criteria
- \`node excelReader.js\` runs without errors and prints correct row counts (30 supply, 8 demand, 15 employees, 4 skills, 6 levels, 12 projects)
- All weekly hour columns (15 weeks) are included in supply objects
- Dates in Demand tab are returned as \`mm/dd/yyyy\` strings
- Missing file returns \`{ error: "File not found: ..." }\` instead of crashing
- Missing tab returns \`{ error: "Missing tabs: ..." }\` listing which ones are absent`,

  2: `## Build Claude API integration
> **Phase 2 – Backend** | TASKS.md #7

### What this does
Creates \`claudeService.js\` — the AI brain of the app. Wraps the Anthropic Claude API with a staffing-aware system prompt so the model understands NetSuite consulting utilization rules and can answer natural language questions about the resourcing data.

### Flow
\`\`\`
/api/ask receives { question }
  └─► askClaude(question, staffingData)
        ├─► formats staffingData as JSON context
        ├─► builds system prompt with utilization rules
        ├─► calls Anthropic messages.create()
        └─► returns plain-text answer string
\`\`\`

### Tasks
- [ ] Create \`claudeService.js\`
- [ ] Install \`@anthropic-ai/sdk\` package
- [ ] Implement \`askClaude(question, staffingData)\` function
- [ ] Write system prompt explaining staffing context and utilization rules:
  - 45 hrs/week = fully utilized
  - > 45 hrs/week = overbooked
  - < 40 hrs/week = underutilized
  - 0 hrs = on bench
- [ ] Pass all 6 tabs as structured context in the user message
- [ ] Return the model's response as a plain string
- [ ] Handle API errors gracefully (invalid key, rate limit, timeout)
- [ ] Load \`ANTHROPIC_API_KEY\` from \`.env\` via \`dotenv\`

### Acceptance Criteria
- \`askClaude("Who is on the bench?", data)\` returns a correct answer based on Excel data
- Utilization thresholds (45h full, >45 overbooked, <40 under) are reflected in answers
- API key missing → returns a clear error message, does not crash server
- Response is a plain string suitable for display in the UI`,

  3: `## Create API endpoints for dashboard and Q&A
> **Phase 2 – Backend** | TASKS.md #8

### What this does
Adds the Express routes that the frontend calls. Exposes the parsed Excel data and Claude Q&A as a clean REST API. The dashboard reads from these endpoints; the Ask Claude tab posts questions to \`/api/ask\`.

### Flow
\`\`\`
Browser
  ├─► GET  /api/supply          → supply[]
  ├─► GET  /api/demand          → demand[]
  ├─► GET  /api/employees       → employees[]
  ├─► GET  /api/dashboard       → aggregated stats for all 4 charts
  └─► POST /api/ask  { question } → { answer: "..." }
\`\`\`

### Tasks
- [ ] Add \`GET /api/supply\` — returns full supply array
- [ ] Add \`GET /api/demand\` — returns full demand array
- [ ] Add \`GET /api/employees\` — returns employees array
- [ ] Add \`GET /api/dashboard\` — returns pre-aggregated stats:
  - Utilization % by level
  - Bench list (employees at 0h)
  - Cliffs data (roll-offs by week)
  - Needs coverage (open demand by level/skill)
- [ ] Add \`POST /api/ask\` — accepts \`{ question }\`, calls \`askClaude()\`, returns \`{ answer }\`
- [ ] Return \`{ error }\` with appropriate HTTP status on failures
- [ ] Reload \`staffingData\` on each request (or cache with TTL) so Excel changes are picked up

### Acceptance Criteria
- \`GET /api/health\` still returns 200
- \`GET /api/supply\` returns JSON array with all 30 supply rows
- \`GET /api/dashboard\` returns all stats needed by the 4 charts without additional processing in the frontend
- \`POST /api/ask\` with a valid question returns \`{ answer: "..." }\` within 30 seconds
- \`POST /api/ask\` with missing question returns HTTP 400 with a clear error`,

  4: `## Build app shell with two-tab navigation
> **Phase 3 – Dashboard** | TASKS.md #9

### What this does
Creates the browser-side app skeleton: a single HTML page with two tabs (Dashboard and Ask Claude) and the JavaScript tab-switching logic. This is the container that all charts and the Q&A UI plug into.

### Flow
\`\`\`
index.html loads
  └─► app.js initialises
        ├─► tab click → show/hide tab panels
        ├─► on Dashboard tab: fetch /api/dashboard → render charts
        └─► on Ask Claude tab: show Q&A input
\`\`\`

### Tasks
- [ ] Update \`public/index.html\` with two-tab nav (Dashboard / Ask Claude)
- [ ] Add tab panel containers (\`#dashboard-panel\`, \`#qa-panel\`)
- [ ] Implement tab switching in \`public/app.js\` (show active panel, highlight active tab)
- [ ] Load Chart.js from CDN in \`index.html\`
- [ ] Add chart placeholder \`<canvas>\` elements for all 4 charts
- [ ] Add Q&A section placeholder (input + response area)
- [ ] Apply base layout styles in \`public/styles.css\`

### Acceptance Criteria
- Clicking Dashboard tab shows dashboard panel, hides Q&A panel
- Clicking Ask Claude tab shows Q&A panel, hides dashboard panel
- Active tab is visually highlighted
- Page loads without console errors
- All 4 chart canvas elements are present in the DOM`,

  5: `## Utilization by Level chart
> **Phase 3 – Dashboard** | TASKS.md #10

### What this does
The first of four dashboard charts. Shows what percentage of the 45-hour weekly capacity is booked per seniority level (Analyst through Partner/MD), giving leadership a quick read on whether junior or senior staff are over- or under-utilized.

### Flow
\`\`\`
GET /api/dashboard
  └─► utilizationByLevel[]
        └─► Chart.js horizontal bar chart
              x-axis: % of 45h capacity (0–100%+)
              y-axis: Analyst, Consultant, Senior Consultant, Manager, Senior Manager, Partner/MD
              color:  green if 90–100%, yellow if 70–89%, red if <70% or >100%
\`\`\`

### Tasks
- [ ] Aggregate supply data: group rows by employee level, sum hours, divide by (45 × headcount)
- [ ] Add utilization-by-level to \`GET /api/dashboard\` response
- [ ] Render Chart.js horizontal bar chart in \`#chart-utilization\` canvas
- [ ] Color bars: green (90–100%), yellow (70–89%), red (<70% or >110%)
- [ ] Show percentage labels on bars
- [ ] Add chart title "Utilization by Level"

### Acceptance Criteria
- Chart renders on page load without manual refresh
- Each level (Analyst → Partner/MD) appears as a separate bar
- Bar length reflects correct % of 45h capacity
- Color coding matches utilization thresholds
- Chart updates if Excel data changes and page is refreshed`,

  6: `## Bench Report chart
> **Phase 3 – Dashboard** | TASKS.md #11

### What this does
Shows which employees are on the bench (0 hours) or critically underutilized (<40h), broken down by skill set. Helps the staffing team quickly identify available resources for new project opportunities.

### Flow
\`\`\`
GET /api/dashboard
  └─► benchReport[]
        └─► Chart.js grouped bar chart or table
              groups: by Skill Set
              bars: count of employees at 0h (bench) vs <40h (underutilized)
              tooltip: employee names on hover
\`\`\`

### Tasks
- [ ] Identify bench employees: total weekly hours = 0 across all weeks
- [ ] Identify underutilized: average weekly hours < 40
- [ ] Add bench report data to \`GET /api/dashboard\` response
- [ ] Render Chart.js bar chart in \`#chart-bench\` canvas
- [ ] Group by skill set, show bench vs underutilized counts
- [ ] Include employee name list in tooltip or below chart
- [ ] Add chart title "Bench Report"

### Acceptance Criteria
- James Okafor and Emily Walsh appear as benched in sample data
- Priya Sharma and Aisha Kamara appear as underutilized
- Chart is grouped by skill set
- Hovering a bar shows employee names
- Zero bench employees shows an empty/green state`,

  7: `## Cliffs visualization
> **Phase 3 – Dashboard** | TASKS.md #12

### What this does
A line chart showing week-by-week availability spikes — "cliffs" where multiple employees roll off projects simultaneously. Helps leadership proactively plan for periods of high availability and avoid scrambling to find work for suddenly free staff.

### Flow
\`\`\`
GET /api/dashboard
  └─► cliffsData[]  (one entry per week)
        └─► Chart.js line chart
              x-axis: week ending dates (3/21 → 6/27)
              y-axis: number of employees with hours dropping week-over-week
              spike = week where ≥2 employees go from booked to 0/low hours
\`\`\`

### Tasks
- [ ] Calculate week-over-week hour changes per employee across all 15 weeks
- [ ] Flag weeks where ≥2 employees show a significant drop (e.g. >20h decrease)
- [ ] Add cliffs data to \`GET /api/dashboard\` response
- [ ] Render Chart.js line chart in \`#chart-cliffs\` canvas
- [ ] Highlight spike weeks in red/orange on the line
- [ ] x-axis shows all 15 week-ending dates
- [ ] Add chart title "Project Roll-off Cliffs"

### Acceptance Criteria
- All 15 week columns from Supply tab appear on x-axis
- Line shows correct count of roll-offs per week
- Spike weeks are visually highlighted
- Flat sample data (all weeks same hours) shows a flat line with no false spikes
- Chart renders correctly with both sample and real data`,

  8: `## Needs Coverage chart
> **Phase 3 – Dashboard** | TASKS.md #13

### What this does
Shows open demand roles from the Demand tab and whether they can be covered by available supply. Breaks down unfilled needs by level and skill set so the staffing team can see exactly what gaps exist and what profiles to hire or reassign.

### Flow
\`\`\`
GET /api/dashboard
  └─► needsCoverage[]
        ├─► demand roles grouped by level + skill set
        ├─► cross-referenced with available supply
        └─► Chart.js stacked bar chart
              x-axis: Resource Level
              bars: filled (matched) vs unfilled (gap) demand
              color: green = covered, red = gap
\`\`\`

### Tasks
- [ ] Group demand rows by Resource Level and Resource Skill Set
- [ ] Cross-reference against supply: employee available if avg hours < 45
- [ ] Calculate filled vs unfilled count per group
- [ ] Add needs coverage data to \`GET /api/dashboard\` response
- [ ] Render Chart.js stacked bar chart in \`#chart-needs\` canvas
- [ ] Color: green for covered demand, red for gaps
- [ ] Add chart title "Needs Coverage"

### Acceptance Criteria
- All 8 demand rows from sample data appear in the chart
- Filled vs unfilled split is calculated correctly
- Chart is grouped by Resource Level
- Red bars indicate genuine gaps (no available matching employee)
- Chart updates on page refresh when Excel data changes`,

  9: `## Build Ask Claude tab UI
> **Phase 4 – Q&A** | TASKS.md #14

### What this does
Builds the user-facing interface for the natural language Q&A feature. A clean, minimal input area where users type resourcing questions and see Claude's answers. Designed for non-technical exec and staffing team users.

### Flow
\`\`\`
User types question → clicks Ask (or presses Enter)
  └─► loading spinner shows
        └─► POST /api/ask
              └─► response displays in answer area
                    └─► user can ask another question
\`\`\`

### Tasks
- [ ] Add question \`<textarea>\` or \`<input>\` in the Ask Claude panel
- [ ] Add "Ask" submit button
- [ ] Add loading spinner / "Thinking..." state while waiting for response
- [ ] Add response display \`<div>\` with styled output area
- [ ] Support pressing Enter to submit (Shift+Enter for newline)
- [ ] Disable input and button while request is in flight
- [ ] Show error message if request fails
- [ ] Clear/reset state for next question after response received

### Acceptance Criteria
- Input area is clearly labelled with placeholder text
- Submitting an empty question does nothing (no API call)
- Loading state is visible while waiting for Claude
- Response renders cleanly (preserve line breaks and formatting)
- Error state shows friendly message, not raw API error
- Works on both desktop and tablet screen sizes`,

  10: `## Wire Q&A to backend and display responses
> **Phase 4 – Q&A** | TASKS.md #15

### What this does
Connects the Ask Claude UI to the \`/api/ask\` backend endpoint. Sends the user's question along with the current staffing data context, receives Claude's answer, and displays it in the response area.

### Flow
\`\`\`
submitQuestion(question)
  └─► POST /api/ask  { question }
        ├─► success → displayAnswer(response.answer)
        └─► error   → displayError(message)
\`\`\`

### Tasks
- [ ] Implement \`submitQuestion()\` in \`app.js\` using \`fetch\`
- [ ] POST to \`/api/ask\` with \`{ question }\` JSON body
- [ ] On success: call \`displayAnswer()\` with response text
- [ ] On HTTP error: show status-appropriate message (400 = bad input, 500 = server error)
- [ ] On network error: show "Could not reach server" message
- [ ] Preserve newlines and basic formatting in displayed response
- [ ] Log question and answer to browser console for debugging

### Acceptance Criteria
- Asking "Who is on the bench?" returns a correct answer within 30s
- Asking "Who is overbooked?" correctly identifies Rachel Torres and Carlos Rivera
- 500 error from server shows user-friendly error, not a stack trace
- Network failure shows "Could not reach server" message
- Multiple questions can be asked sequentially without page refresh`,

  11: `## Styling - make it exec-presentable
> **Phase 5 – Polish** | TASKS.md #16

### What this does
Applies professional, executive-grade styling to the entire app. The dashboard is shown to firm leadership and the staffing team in business reviews, so it needs to look polished, clean, and credible — not like a prototype.

### Tasks
- [ ] Define a consistent color palette (firm brand colors or a clean professional scheme)
- [ ] Style the two-tab navigation bar (active/inactive states, hover)
- [ ] Style all 4 Chart.js charts consistently (fonts, colors, legends, tooltips)
- [ ] Style the Ask Claude panel (clean input, readable response area)
- [ ] Add a header with app name and logo/icon
- [ ] Ensure readable typography (font size, line height, contrast)
- [ ] Add subtle card/panel containers around charts
- [ ] Responsive layout: usable on laptop and large monitor
- [ ] Polish loading states and error messages

### Acceptance Criteria
- App looks professional enough to show to a client or firm partner
- Color scheme is consistent across all components
- Charts have clear titles, axis labels, and legends
- No unstyled/raw HTML visible
- Page is usable at 1280px and 1920px widths`,

  12: `## Auto-refresh when Excel file changes
> **Phase 5 – Polish** | TASKS.md #17

### What this does
Watches \`data/resourcing.xlsx\` for changes and automatically reloads the staffing data in memory. When the staffing team updates the Excel file, the dashboard reflects the new data on the next page load or API call — without restarting the server.

### Flow
\`\`\`
server starts
  └─► fs.watch('data/resourcing.xlsx')
        └─► on 'change' event
              └─► debounce 500ms (Excel saves multiple events)
                    └─► readStaffingData() → update staffingData in memory
                          └─► log "Data reloaded at HH:MM:SS"
\`\`\`

### Tasks
- [ ] Add \`fs.watch()\` on \`data/resourcing.xlsx\` in \`server.js\`
- [ ] Debounce reload by 500ms to handle Excel's multi-event saves
- [ ] On change: call \`readStaffingData()\` and update the in-memory \`staffingData\`
- [ ] Log reload timestamp to console
- [ ] Handle watch errors gracefully (file deleted, permissions)
- [ ] Optionally: emit a server-sent event so the browser can auto-refresh the charts

### Acceptance Criteria
- Saving a change to \`resourcing.xlsx\` triggers a reload within 2 seconds
- Server does not need to be restarted for new data to appear
- Console shows "Data reloaded at HH:MM:SS" after each file change
- Multiple rapid saves (Excel autosave) do not cause multiple simultaneous reloads
- Server remains stable if the file is temporarily unavailable during save`,

  13: `## Test with real data, fix edge cases
> **Phase 5 – Polish** | TASKS.md #18

### What this does
Replaces the sample data in \`resourcing.xlsx\` with actual firm staffing data and fixes any formatting issues, edge cases, or display problems that only appear with real-world data.

### Tasks
- [ ] Replace sample data in \`resourcing.xlsx\` with real staffing data
- [ ] Verify all 6 tabs parse correctly with real data
- [ ] Fix any date format issues in Demand tab
- [ ] Fix any employee name encoding issues (apostrophes, accents)
- [ ] Handle employees with no Supply rows (new starters, leavers)
- [ ] Handle demand rows with no matching supply (genuine gaps)
- [ ] Handle weeks with no data (public holidays, future periods)
- [ ] Verify chart scales adjust correctly for real data ranges
- [ ] Fix any chart rendering issues with larger datasets

### Acceptance Criteria
- All 4 dashboard charts render correctly with real staffing data
- No JavaScript errors in browser console with real data
- Q&A returns sensible answers based on real data
- Edge cases (no hours, missing employees, future dates) handled without crashing`,

  14: `## Functional Testing - verify all dashboard charts render correctly
> **Phase 6 – Testing** | TASKS.md #19

### What this does
Structured functional testing of all four dashboard charts to confirm they render correctly, show the right data, and behave correctly across different data scenarios.

### Tasks
- [ ] Test Utilization by Level chart with sample data — verify all 6 levels appear
- [ ] Test Utilization by Level chart with all employees at 45h — expect all bars at 100%
- [ ] Test Bench Report with sample data — verify James Okafor and Emily Walsh appear
- [ ] Test Bench Report with no bench employees — verify empty/green state
- [ ] Test Cliffs chart with sample data (flat hours) — verify flat line, no false spikes
- [ ] Test Needs Coverage with sample data — verify 8 demand rows shown
- [ ] Test all charts after auto-refresh of Excel file
- [ ] Test chart rendering at 1280px and 1920px viewport widths

### Acceptance Criteria
- All 4 charts render on first page load without manual interaction
- Chart data matches the raw data in \`resourcing.xlsx\`
- No console errors during chart rendering
- Charts re-render correctly after Excel data is updated and page is refreshed`,

  15: `## Functional Testing - verify Q&A returns accurate answers
> **Phase 6 – Testing** | TASKS.md #20

### What this does
Tests that the Ask Claude Q&A feature returns accurate, relevant answers to common staffing questions using the sample data, verifying the system prompt and data context are working correctly.

### Test Cases
| Question | Expected Answer |
|----------|----------------|
| Who is on the bench? | James Okafor, Emily Walsh |
| Who is overbooked? | Rachel Torres (50h), Carlos Rivera (50h) |
| Who is fully utilized? | Sarah Mitchell, David Chen, Marcus Webb, Nina Patel, Tom Nguyen, Ben Foster, Ryan O'Brien |
| What open roles do we have? | Lists all 8 demand rows |
| Who can cover a NetSuite P2P role? | Identifies available P2P consultants |

### Tasks
- [ ] Run each test case in the Ask Claude UI
- [ ] Verify answers are factually correct based on Excel data
- [ ] Test with ambiguous question — verify graceful handling
- [ ] Test with question outside staffing domain — verify appropriate response
- [ ] Test with very long question — verify no truncation issues

### Acceptance Criteria
- Bench and overbooked questions answered correctly 100% of the time
- Utilization thresholds (45h full, >45 overbooked, <40 under) correctly applied in answers
- Responses are clear and readable for a non-technical audience
- No hallucinated employee names or projects not in the data`,

  16: `## Functional Testing - verify Excel dropdowns and data validation
> **Phase 6 – Testing** | TASKS.md #21

### What this does
Verifies that the data validation dropdowns in \`resourcing.xlsx\` work correctly — users can only select valid employees, skills, levels, and projects from the master tabs.

### Tasks
- [ ] Open \`resourcing.xlsx\` in Excel and verify Supply tab dropdowns:
  - Col A (Employee Name): shows all employees from Employee Master
  - Col B (Skill Set): shows all skills from Skills Master
  - Col C (Project Assigned): shows all projects from Project Master
- [ ] Verify Demand tab dropdowns:
  - Col A (Project/Client Name): shows all projects
  - Col B (Resource Level): shows all levels from Resource Levels
  - Col C (Resource Skill Set): shows all skills
- [ ] Verify warning appears when manually typing an invalid value
- [ ] Verify blank rows are allowed (allowBlank: true)
- [ ] Verify dropdowns still work after adding new rows

### Acceptance Criteria
- All 6 dropdown columns show the correct list of valid values
- Invalid entries trigger the warning message
- Dropdowns reference master tabs dynamically (adding a new employee to Employee Master adds them to the dropdown)`,

  17: `## Functional Testing - verify color coding logic in Supply tab
> **Phase 6 – Testing** | TASKS.md #22

### What this does
Verifies that the utilization color coding in the Supply tab weekly hour cells is correct for all four scenarios: underutilized, nominal, fully utilized, and overbooked.

### Color Rules
| Total Weekly Hours | Color | Meaning |
|-------------------|-------|---------|
| < 40h | Dark red | Underutilized |
| 40–44h | Yellow | Nominal |
| 45h | Green | Fully utilized |
| > 45h | Salmon | Overbooked |

### Tasks
- [ ] Open \`resourcing.xlsx\` Supply tab and verify:
  - James Okafor (0h) → all week cells dark red
  - Emily Walsh (0h) → all week cells dark red
  - Priya Sharma (10h) → all week cells dark red
  - Rachel Torres (50h) → all week cells salmon
  - Carlos Rivera (50h) → all week cells salmon
  - Sarah Mitchell (45h) → all week cells green
  - David Chen (45h) → all week cells green
- [ ] Verify color is applied to ALL 15 week columns for each employee
- [ ] Verify multi-row employees: color based on SUM of all their rows, not individual row hours

### Acceptance Criteria
- All 15 color-coded employees show the correct color across all 15 weeks
- Multi-row employees (e.g. Sarah Mitchell has 2 rows: 20h + 25h = 45h total) show green, not dark red for the 20h row
- Colors match the exact ARGB values in \`create-sample-data.js\``,

  18: `## Technical Testing - verify API error handling and edge cases
> **Phase 6 – Testing** | TASKS.md #23

### What this does
Tests that the Express API handles error conditions gracefully — missing files, bad inputs, API failures — and always returns useful error responses rather than crashing or hanging.

### Test Cases
| Scenario | Expected Behaviour |
|----------|-------------------|
| \`resourcing.xlsx\` deleted | \`/api/supply\` returns \`{ error: "File not found" }\` with HTTP 503 |
| POST \`/api/ask\` with no body | HTTP 400 with \`{ error: "question is required" }\` |
| POST \`/api/ask\` with invalid API key | HTTP 500 with user-friendly error message |
| GET non-existent endpoint | HTTP 404 |
| Excel file open/locked in Excel | Graceful error, not a crash |

### Tasks
- [ ] Test each scenario above manually via curl or Postman
- [ ] Verify server does not crash for any of the above scenarios
- [ ] Verify HTTP status codes are correct (400 for bad input, 503 for missing data, 500 for server errors)
- [ ] Verify error responses are JSON with an \`error\` field

### Acceptance Criteria
- Server remains running after any single error scenario
- All error responses are JSON (never plain text or HTML)
- HTTP status codes correctly reflect the error type
- No stack traces exposed in API error responses`,

  19: `## Technical Testing - verify app handles missing or malformed Excel data
> **Phase 6 – Testing** | TASKS.md #24

### What this does
Tests robustness when \`resourcing.xlsx\` contains unexpected data: empty rows, missing columns, null values, employees with no bookings, or demand rows with no matching supply.

### Test Cases
- Empty row in middle of Supply tab
- Employee in Supply tab not in Employee Master
- Demand row with no matching supply employee
- Missing "Week ending" column header
- Cell with text instead of number in weekly hours column
- Completely empty tab

### Tasks
- [ ] Add each edge case to a test copy of \`resourcing.xlsx\`
- [ ] Verify \`excelReader.js\` handles each without throwing
- [ ] Verify API endpoints return valid (possibly empty) arrays, not errors
- [ ] Verify charts render gracefully with missing data (empty chart, not broken chart)
- [ ] Verify Q&A handles "no data" gracefully

### Acceptance Criteria
- No unhandled exceptions for any of the above edge cases
- Empty rows are skipped, not returned as \`{ null: null }\` objects
- Charts degrade gracefully (show empty state) rather than crashing
- Server log shows a warning for malformed data, not a fatal error`,

  20: `## Technical Testing - performance testing with large datasets
> **Phase 6 – Testing** | TASKS.md #25

### What this does
Tests that the app performs acceptably when the Excel file grows beyond the sample data — e.g. 100+ employees, 50+ projects, 6 months of weekly columns — to ensure it will scale for daily use.

### Tasks
- [ ] Create a large test Excel file: 100 employees × 26 weeks × 2 projects each (200 supply rows)
- [ ] Measure \`readStaffingData()\` parse time for large file
- [ ] Measure \`GET /api/dashboard\` response time with large dataset
- [ ] Measure \`POST /api/ask\` response time (Claude API latency)
- [ ] Test browser rendering time for charts with large datasets
- [ ] Identify any bottlenecks and optimise if response times > 3s for dashboard

### Acceptance Criteria
- \`readStaffingData()\` completes in < 2 seconds for 200-row Supply tab
- \`GET /api/dashboard\` returns in < 3 seconds
- \`POST /api/ask\` returns in < 30 seconds (Claude API SLA)
- Browser renders all 4 charts in < 2 seconds
- No memory leaks after 100 consecutive API calls`,

  21: `## UAT - exec team reviews dashboard with real data
> **Phase 6 – Testing** | TASKS.md #26

### What this does
The executive team reviews the live dashboard with real staffing data and confirms it meets their needs for weekly business reviews. Sign-off from this group is required before the app is considered production-ready.

### Attendees
- Practice lead / Partner
- Delivery manager(s)
- Staffing coordinator

### Review Checklist
- [ ] All 4 charts render correctly with real data
- [ ] Utilization by Level chart reflects current bench situation accurately
- [ ] Bench Report correctly identifies available resources
- [ ] Cliffs chart highlights upcoming availability spikes
- [ ] Needs Coverage chart shows correct open roles
- [ ] Charts are readable and professional enough for client-facing use
- [ ] Data matches what the team knows from manual tracking

### Acceptance Criteria
- Exec team confirms dashboard data is accurate
- No critical display or data issues identified during review
- Feedback collected and added to Phase 5 polish backlog if needed
- Exec team signs off to proceed to UAT round 2`,

  22: `## UAT - staffing team tests Q&A with real resourcing scenarios
> **Phase 6 – Testing** | TASKS.md #27

### What this does
The staffing team uses the Ask Claude tab with real data to test whether it can accurately answer the questions they ask in day-to-day resourcing decisions. Sign-off confirms the Q&A is fit for operational use.

### Test Scenarios (Real Data)
- [ ] "Who is available to start on [Project X] next week?"
- [ ] "Which managers are underutilized this month?"
- [ ] "Do we have anyone with P2P skills who isn't fully booked?"
- [ ] "What's our overall utilization rate this week?"
- [ ] "Who rolls off projects in May?"
- [ ] "Can we staff a new Senior Consultant on O2C?"

### Acceptance Criteria
- Staffing team confirms answers are accurate for ≥ 80% of questions tested
- Answers are in plain English, not raw JSON
- Response time is acceptable for day-to-day use (< 30 seconds)
- Any inaccurate answers traced to data gaps in Excel, not logic errors in the app
- Staffing team signs off to proceed to final UAT`,

  23: `## UAT - final sign off and move to Phase 7
> **Phase 6 – Testing** | TASKS.md #28

### What this does
Final stakeholder sign-off that the app is ready for daily operational use. All UAT feedback has been addressed, and the team agrees to move forward to Phase 7 (database enhancement).

### Sign-off Checklist
- [ ] All Phase 1–5 issues resolved and closed
- [ ] Exec UAT sign-off received (#26)
- [ ] Staffing team UAT sign-off received (#27)
- [ ] All critical bugs from UAT rounds fixed
- [ ] App running stably in daily use for at least 1 week
- [ ] \`resourcing.xlsx\` update process documented for staffing team
- [ ] Decision made: proceed to Phase 7 (SQLite) or continue on Excel

### Acceptance Criteria
- All stakeholders sign off in writing (email or comment on this issue)
- No open P1 or P2 bugs
- App has been used in at least one real business review meeting
- Phase 7 scope confirmed or deferred`,

  24: `## Set up SQLite schema mirroring all 6 Excel tabs
> **Phase 7 – Database Enhancement** | TASKS.md #29

### What this does
Designs and creates a SQLite database schema that exactly mirrors the structure of the 6 Excel tabs. This is the foundation for Phase 7 — moving from file-based to database-backed data storage.

### Schema Design
\`\`\`sql
CREATE TABLE supply (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT, skill_set TEXT, project_assigned TEXT,
  week_ending TEXT, hours REAL
);
CREATE TABLE demand (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT, resource_level TEXT, skill_set TEXT,
  start_date TEXT, end_date TEXT
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT UNIQUE, level TEXT
);
CREATE TABLE skills (skill_set TEXT PRIMARY KEY);
CREATE TABLE resource_levels (level TEXT PRIMARY KEY);
CREATE TABLE projects (project_id TEXT PRIMARY KEY, project_name TEXT);
\`\`\`

### Tasks
- [ ] Install \`better-sqlite3\` package
- [ ] Create \`db/schema.sql\` with all 6 table definitions
- [ ] Create \`db/initDb.js\` script that creates \`data/staffing.db\` and runs schema
- [ ] Verify schema creates without errors: \`node db/initDb.js\`
- [ ] Add \`data/staffing.db\` to \`.gitignore\`

### Acceptance Criteria
- \`node db/initDb.js\` creates \`data/staffing.db\` without errors
- All 6 tables exist with correct column names and types
- Running \`initDb.js\` twice does not error (idempotent — uses CREATE IF NOT EXISTS)
- \`data/staffing.db\` is in \`.gitignore\``,

  25: `## Build Excel to SQLite import script
> **Phase 7 – Database Enhancement** | TASKS.md #30

### What this does
Creates an import script that reads \`resourcing.xlsx\` using \`excelReader.js\` and populates the SQLite database. This is how data gets from Excel into the database — run manually or triggered by the auto-refresh watcher.

### Flow
\`\`\`
node db/importToDb.js
  └─► readStaffingData()           ← existing excelReader.js
        └─► clear all 6 tables     ← full replace, not upsert
              └─► insert all rows  ← bulk insert per table
                    └─► log: "Imported X supply rows, Y demand rows..."
\`\`\`

### Tasks
- [ ] Create \`db/importToDb.js\`
- [ ] Call \`readStaffingData()\` to get Excel data
- [ ] Wrap all inserts in a transaction for atomicity
- [ ] Clear and reload all 6 tables on each run (full replace)
- [ ] Supply tab: normalise weekly hours (one row per employee+week, not one row per employee+all weeks)
- [ ] Log import summary: row counts per table
- [ ] Handle import errors gracefully (bad data, locked DB)

### Acceptance Criteria
- \`node db/importToDb.js\` completes without errors on sample data
- All 6 tables populated with correct row counts
- Running the script twice produces the same result (idempotent)
- Import completes in < 5 seconds for sample data`,

  26: `## Swap backend data layer from Excel to SQLite
> **Phase 7 – Database Enhancement** | TASKS.md #31

### What this does
Updates the server to read from SQLite instead of Excel. The API endpoints and dashboard aggregations now query the database, making the app faster and more reliable. \`excelReader.js\` is retained for the import step but is no longer called on every request.

### Flow
\`\`\`
Before: GET /api/supply → readStaffingData() → parse Excel → return data
After:  GET /api/supply → db.prepare('SELECT * FROM supply').all() → return data
\`\`\`

### Tasks
- [ ] Create \`db/db.js\` — initialises and exports the \`better-sqlite3\` connection
- [ ] Update \`GET /api/supply\` to query \`supply\` table
- [ ] Update \`GET /api/demand\` to query \`demand\` table
- [ ] Update \`GET /api/employees\` to query \`employees\` table
- [ ] Update \`GET /api/dashboard\` aggregations to use SQL queries
- [ ] Update \`POST /api/ask\` to pull context from DB instead of Excel
- [ ] Update auto-refresh watcher: on Excel change → run import → data auto-updates in DB
- [ ] Keep \`excelReader.js\` intact (still used by import script)

### Acceptance Criteria
- All API endpoints return identical data as the Excel-backed version
- \`resourcing.xlsx\` can be deleted and the server still serves cached DB data
- Auto-refresh still works: Excel change → DB import → updated API response
- No direct \`exceljs\` calls remain in \`server.js\``,

  27: `## Test and validate SQLite parity with Excel
> **Phase 7 – Database Enhancement** | TASKS.md #32

### What this does
Final validation that the SQLite-backed app produces identical results to the Excel-backed version for all dashboard charts and Q&A responses. Confirms Phase 7 is complete and the migration is safe.

### Tasks
- [ ] Run app with Excel data layer — capture \`/api/dashboard\` response as baseline JSON
- [ ] Run import: \`node db/importToDb.js\`
- [ ] Run app with SQLite data layer — capture \`/api/dashboard\` response
- [ ] Compare baseline vs SQLite responses: must be identical
- [ ] Verify all 4 charts render identically with SQLite data
- [ ] Ask the same 5 Q&A test questions against both data layers — compare answers
- [ ] Performance test: verify SQLite \`/api/dashboard\` is faster than Excel equivalent
- [ ] Document any deliberate differences (e.g. normalised supply rows)

### Acceptance Criteria
- \`/api/dashboard\` responses are identical between Excel and SQLite data layers
- All 4 charts render identically
- Q&A answers are semantically equivalent (may differ in wording)
- SQLite \`/api/dashboard\` response time ≤ Excel version
- No regressions in any Phase 1–6 functionality`,
};

// Update each issue
let updated = 0;
let failed  = 0;

for (const [num, body] of Object.entries(issues)) {
  const tmp = path.join(os.tmpdir(), `issue_body_${num}.md`);
  fs.writeFileSync(tmp, body, 'utf8');

  const r = spawnSync(GH, ['issue', 'edit', num, '--repo', REPO, '--body-file', tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);

  if (r.status === 0) {
    console.log(`  ✓ #${num} updated`);
    updated++;
  } else {
    console.log(`  ✗ #${num} FAILED: ${(r.stderr || r.stdout).slice(0, 120)}`);
    failed++;
  }
}

console.log(`\nDone: ${updated} updated, ${failed} failed`);

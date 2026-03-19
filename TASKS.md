## Staffing App - Build Tracker

### Phase 1 - Foundation
- [x] #1 Install prerequisites (Node.js, Claude Code, API key)
- [x] #2 Initialize local Git repository
- [x] #3 Set up project folder and file structure
- [x] #4 Create sample Excel file with Supply, Demand and Master tabs

### Phase 2 - Backend
- [x] #5 Set up Node.js + Express server
- [x] #6 Build Excel reader (parse all tabs)
- [x] #7 Build Claude API integration
- [x] #8 Create API endpoints for dashboard and Q&A

### Phase 3 - Dashboard
- [x] #9 Build app shell with two-tab navigation
- [x] #10 Utilization by Level chart
- [x] #11 Bench Report chart
- [x] #12 Cliffs visualization
- [x] #13 Needs Coverage chart

### Phase 4 - Q&A
- [x] #14 Build Ask Claude tab UI
- [x] #15 Wire Q&A to backend and display responses

### Phase 4b - Chart Drilldowns
- [x] #34 Drilldown - Utilization by Level
- [x] #35 Drilldown - Bench Report
- [x] #36 Drilldown - Cliffs Visualization
- [x] #37 Drilldown - Needs Coverage
- [x] #39 Drilldown - KPI Summary Cards (Headcount, Utilization, Bench, Demand)

### Phase 4c - Heatmap
- [x] #42 Replace Utilization by Level and Cliffs charts with Interactive Availability Heatmap
- [x] #45 Heatmap Expand All / Collapse All buttons

### Phase 4d - Real Data
- [x] #44 Import real staffing data from Staffing_Data.xlsx

### Phase 4e - Layout & UX
- [x] #47 Dashboard layout redesign - viewport optimization and compact KPI strip
- [x] #33 Dark theme with minimalistic pastel color scheme
- [x] #16 Styling - make it exec-presentable

### Phase 5 - Navigation & UX
- [x] #46 Restructure navigation into Overview, Staffing, Needs and Ask Claude tabs

### Phase 5b - SaaS Polish & UX
- [x] #54 Staffing tab - remove Bench Report, add bench count indicator to heatmap
- [x] #51 Staffing tab - Bench Report as collapsible side panel (closed - superseded by #54)
- [x] #55 Heatmap - optimized row density (50-60 employees)
- [x] #58 Heatmap - complete virtual scrolling to show all 25+ employees
- [ ] #56 Heatmap - minor polish items (truncation, hover highlight, border fixes, row spacing)
- [ ] #57 Move Bench Report snapshot to Overview tab as 4th stat card
- [ ] #48 Left sidebar navigation to replace top tab bar
- [ ] #50 Needs tab - rename, add dates, hours per week and improve layout
- [ ] #52 Ask Claude - dynamic suggested questions based on current data
- [ ] #49 Overview tab - fill empty space with meaningful content
- [ ] #53 Header improvements - notifications, user avatar, search and date range

### Phase 6 - Core Features
- [ ] #40 Resourcing Management UI - Edit Supply Tab from Browser
- [ ] #41 AI Recommendations Tab - Auto Match Supply and Demand
- [ ] #17 Auto-refresh when Excel file changes

### Phase 7 - Polish & Real Data
- [ ] #18 Test with real data, fix edge cases

### Phase 8 - Testing
- [ ] #19 Functional Testing - verify all dashboard charts render correctly
- [ ] #20 Functional Testing - verify Q&A returns accurate answers
- [ ] #21 Functional Testing - verify Excel dropdowns and data validation
- [ ] #22 Functional Testing - verify color coding logic in Supply tab
- [ ] #23 Technical Testing - verify API error handling and edge cases
- [ ] #24 Technical Testing - verify app handles missing or malformed Excel data
- [ ] #25 Technical Testing - performance testing with large datasets

### Phase 9 - UAT
- [ ] #26 UAT - exec team reviews dashboard with real data
- [ ] #27 UAT - staffing team tests Q&A with real resourcing questions
- [ ] #28 UAT - sign off and move to next phase

### Phase 10 - Database Enhancement
- [ ] #29 Set up SQLite schema mirroring all Excel tabs
- [ ] #30 Build Excel to SQLite import script
- [ ] #31 Swap backend data layer from Excel to SQLite
- [ ] #32 Test and validate parity

### Phase 11 - Deployment
- [ ] #38 Deploy app to Railway for internal team access

### Phase 12 - Developer Experience
- [ ] #43 Toggl Track integration for automatic time tracking

---
**31 complete [x] · 27 open [ ] · 58 tracked**

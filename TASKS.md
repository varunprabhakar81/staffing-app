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

### Phase 5 - Polish
- [ ] #16 Styling - make it exec-presentable
- [ ] #17 Auto-refresh when Excel file changes
- [ ] #18 Test with real data, fix edge cases

### Phase 6 - Testing
- [ ] #19 Functional Testing - verify all dashboard charts render correctly
- [ ] #20 Functional Testing - verify Q&A returns accurate answers
- [ ] #21 Functional Testing - verify Excel dropdowns and data validation
- [ ] #22 Functional Testing - verify color coding logic in Supply tab
- [ ] #23 Technical Testing - verify API error handling and edge cases
- [ ] #24 Technical Testing - verify app handles missing or malformed Excel data
- [ ] #25 Technical Testing - performance testing with large datasets
- [ ] #26 UAT - exec team reviews dashboard with real data
- [ ] #27 UAT - staffing team tests Q&A with real resourcing questions
- [ ] #28 UAT - sign off and move to Phase 7

### Phase 7 - Database Enhancement
- [ ] #29 Set up SQLite schema mirroring all Excel tabs
- [ ] #30 Build Excel to SQLite import script
- [ ] #31 Swap backend data layer from Excel to SQLite
- [ ] #32 Test and validate parity with Phase 1

# Staffing Intelligence - Build Journey & Decision Log

## Project Genesis
- Started as a Claude Code tutorial/learning exercise
- Evolved into a real staffing intelligence platform
- Built by a NetSuite consulting practice leader
- Goal: replace manual Excel-based staffing with AI-powered tool

## Tech Stack Decisions
Document why each technology was chosen:
- Node.js + Express (simple, fast to build)
- Plain HTML/CSS/JS (no framework needed for V1)
- ExcelJS (replaced xlsx due to security vulnerabilities)
- Chart.js (charts without heavy dependencies)
- Anthropic Claude API (claude-sonnet-4-20250514)
- Git + GitHub (version control, issue tracking)
- Railway (planned deployment - free tier)

## Data Model Evolution

### Initial Design
- Started with Supply and Demand tabs only
- Added Employee Name, Level, Skill Set, Project, weekly hours

### Evolution
- Added Employee Master tab (master list of employees)
- Added Skills Master tab (NetSuite R2R, P2P, O2C, Supply Chain, Pigment)
- Added Resource Levels tab (Analyst through Partner/MD)
- Added Project Master tab (project IDs and names)
- Added data validation dropdowns for all reference fields
- Added color coding to Supply tab (bench/under/nominal/over)
- Added Hours Per Week to Demand tab
- Removed Start/End dates from Supply (not needed)
- Real data imported from Staffing_Data.xlsx (25 employees)

## Architecture Decisions

### Excel vs Database
- V1: Excel file (resourcing.xlsx) as data backbone
- Reasoning: familiar to resource managers, fast to build
- V2: SQLite migration planned (Phase 10)
- V3: PostgreSQL for multi-tenant SaaS

### Frontend Architecture
- Decision: plain HTML/CSS/JS over React
- Reasoning: simpler for V1, no build toolchain needed
- V2 consideration: React for complex drag-and-drop UI (#7 in V2 epics)

### API Design
- RESTful Express endpoints
- /api/health, /api/supply, /api/demand, /api/employees
- /api/dashboard (aggregated stats)
- /api/ask (Claude Q&A)
- /api/heatmap (virtual scrolling data)
- /api/recommendations (planned - Issue #41)

## Key UX Decisions

### Navigation Evolution
1. Started with horizontal top tabs
2. Evolved to 4 tabs: Overview, Staffing, Needs, Ask Claude
3. Finally: left sidebar navigation (Issue #48)
4. Reasoning: scales better, more professional SaaS feel

### Dashboard Evolution
1. Started with 4 charts: Utilization, Bench, Cliffs, Needs Coverage
2. Removed Utilization by Level and Cliffs charts
3. Added Interactive Availability Heatmap (Issue #42)
4. Added Executive Overview dashboard (Issue #59)
5. Key insight: heatmap is the hero chart - needs maximum space

### Heatmap Design Decisions
- Virtual scrolling for performance with 25+ employees
- Expandable rows to show project breakdown
- Color coding: bench (dark red), under (coral), nominal (yellow), full (mint), over (light coral)
- Expand All / Collapse All toggle button
- Skill set moved to hover tooltip (saves vertical space)
- 30px row height target for density

### Overview Tab Executive Dashboard
Inspired by Solace HR dashboard reference:
- 4 KPI cards: Utilization, Available Capacity, Pipeline Coverage, On Bench
- Utilization by Level with progress bars
- Projects with Most Utilization (top 5)
- Rolling Off Soon panel (employees dropping hours)
- Needs Attention panel (unmet/partial demands)
- Fits in single 1080p viewport without scrolling

## Major Bug Fixes & Lessons Learned

### Bench Report Bug
- Root cause: was reading last week column instead of current week
- Fix: find first week on or after today dynamically
- Lesson: always use dynamic current week detection

### Nick Kolbow Missing Details
- Root cause: empMeta built from first supply row only
- First row had null skillSet (bench/admin row)
- Fix: scan all supply rows, use first non-null value
- Lesson: employees can have multiple supply rows

### Needs Coverage Calculation
- Original: simple matched/unmatched
- Evolved to: Fully Met / Partially Met / Unmet
- Added Hours Per Week constraint
- Full match = available hours >= needed hours for ALL weeks
- Lesson: demand matching needs week-by-week analysis

### Virtual Scrolling Bug
- Root cause: heatmap built while tab was display:none
- clientHeight returned 0, wrong row count calculated
- Fix: requestAnimationFrame re-renders after tab visible
- Lesson: measure DOM elements only when visible

### CSS Flex Layout Lessons
- flex-shrink: 0 needed on list items to prevent compression
- min-height: 0 needed on flex children for overflow-y: auto
- align-items: stretch for equal height columns
- These are common CSS flexbox gotchas

## Product Decisions & Pivots

### Features Added Mid-Build
- Expandable heatmap rows (project breakdown inline)
- Expand All / Collapse All toggle
- Executive Overview dashboard (inspired by Solace UI)
- Left sidebar navigation
- Keyboard shortcuts (planned - Issue #60)
- Role-based access control (planned - Issue #62)
- Export/Import Excel (planned - Issue #64)

### Features Removed or Deferred
- Utilization by Level bar chart (replaced by heatmap)
- Project Roll-off Cliffs chart (replaced by Rolling Off Soon panel)
- Bench Report card (moved to Overview KPI card)
- Utilization gauge SVG (removed - too hard to size correctly)

### Naming Decisions
- "Needs" not "Demand" (more natural language)
- "Open needs" not "open roles" (clearer intent)
- "Rolling Off Soon" not "Cliffs" (more intuitive)
- "Projects with Most Utilization" not "Top Projects"
- "Staffing Intelligence" as app name

## V2 Commercial Vision
See V2-VISION.md on v2-commercial branch for full details.

Key insight from build: the Excel backbone will hit limits fast.
Priority for V2:
1. SQLite migration (Phase 10)
2. Auth & user management (Phase 13)
3. Drag and drop staffing UI (Epic 7)
4. Booking engine with hard constraints (Epic 1)
5. Multi-tenant SaaS architecture (Epic 9)

## Issue Tracking Notes
- GitHub issues used throughout for tracking
- TASKS.md as primary source of truth (bible)
- Issues sometimes got out of sync with GitHub numbers
- Lesson: always verify issue numbers match before closing
- Total issues created: 64 (as of end of V1 build)

## Development Workflow
- Claude Code (CC) used for all code generation
- Bash output issues on Windows - fixed with CLAUDE_CODE_GIT_BASH_PATH
- Always ground CC with project context after crashes
- CC crashes are common on complex builds - always check git status
- Hard refresh (Ctrl+Shift+R) needed after CSS changes
- taskkill /F /IM node.exe to kill stale server processes

## Setup Notes
See SETUP.md for full cross-platform setup instructions.
Key gotchas:
- ANTHROPIC_API_KEY must be in .env file
- data/resourcing.xlsx is gitignored (add manually)
- Git Bash path must be set for Claude Code on Windows
- npm install must be run before first server start

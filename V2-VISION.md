# Staffing Intelligence Platform - V2 Commercial Vision

## Status
🚧 In planning - V1 must be completed first

## Strategic Intent
Evolve the internal staffing tool into a commercial-grade resource management
platform for professional services organizations.

## Three Horizon Plan

### Horizon 1 - Complete V1 (current branch: main)
Complete all items in TASKS.md. Internal pilot with our NetSuite practice.

### Horizon 2 - V2 Core Platform (current branch: v2-commercial)
- Proper relational data model (SQLite)
- Booking engine with hard constraints
- Drag and drop staffing UI
- Scenario planning
- Full AI matching engine with explainability

### Horizon 3 - Commercial Grade
- Role based access control
- Audit trail
- Predictive demand forecasting
- Multi-tenant support
- Integration with time tracking and CRM
- Go to market for professional services firms

## Epic Structure

### Epic 1 - Core Data Model & Foundations
- Consultant master data with capacity and skills
- Hierarchical skills taxonomy with proficiency levels
- Project and demand intake with stages (Proposed/Verbal/Sold)
- Booking engine with hard 45hr/week constraint

### Epic 2 - 8-Week Rolling Capacity Visualization
- Resource heatmap (consultants as rows, weeks as columns)
- Drill-down resource timeline by project
- Demand vs supply overlay with skill shortage highlighting

### Epic 3 - AI Staffing & Recommendation Engine
- AI matching engine with skill, availability and utilization scoring
- Explainability layer showing why each match was made
- Auto-staffing suggestions with Fill All Roles capability
- AI chat interface with action capability (assign from chat)

### Epic 4 - Optimization & Constraints Engine
- Utilization optimization logic
- Hard constraints (45hrs, skill match)
- Soft constraints (minimize fragmentation)

### Epic 5 - Executive Dashboard & KPIs
- Firm-wide utilization % with 8-week trend
- Demand coverage by project stage (Proposed/Verbal/Sold)
- Skill gap insights and bottleneck identification
- Risk alerts for overbooking, underutilization, unstaffed sold work

### Epic 6 - Data Backbone (SQLite)
- Consultants, Skills, Projects, Role Needs, Bookings as proper relational tables
- Referential integrity enforcement
- Audit trail on all changes
- Excel import/export for backward compatibility

### Epic 7 - Staffing Manager UX
- Drag and drop staffing interface
- Hours adjustment via slider
- Scenario planning (what-if without affecting live data)
- Bulk assignment and workload rebalancing
- Undo capability

### Epic 8 - Governance & Controls
- Role based access: Staffing Manager, Executive, Admin
- Full audit trail on bookings and AI recommendations
- Configurable constraint thresholds

### Epic 9 - Future Enhancements
- Predictive demand forecasting
- Burnout risk scoring
- Learning recommendations (upskill consultants)
- Integration with time tracking and CRM
- Historical performance based staffing
- Multi-tenant SaaS architecture

## V1 to V2 Mapping
Features already built in V1 that map to V2 epics:
- Dashboard charts → Epic 5 (will be enhanced)
- Ask Claude Q&A → Epic 3 FEAT-3.4 (will be enhanced)
- Needs Coverage logic → Epic 2 FEAT-2.3 (will be rebuilt properly)
- Excel data backbone → Epic 6 (will migrate to SQLite)
- AI Recommendations tab → Epic 3 (will be enhanced with explainability)

## Technology Decisions for V2
- Database: SQLite → PostgreSQL for multi-tenant
- Frontend: Consider React for complex drag and drop UI
- Auth: Add authentication layer (Auth0 or similar)
- Deployment: Railway (current) → consider AWS or Azure for enterprise

## Next Steps
1. Complete V1 TASKS.md
2. Tag V1 as release v1.0
3. Create GitHub Milestones for each Epic
4. Convert epics to structured GitHub issues as User Stories
5. Begin V2 with Epic 6 data model redesign

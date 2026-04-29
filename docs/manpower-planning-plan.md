# Manpower Planning Plan

Updated: 2026-04-29

## Goal
Make manpower planning readable as one end-to-end workflow: plan headcount, submit requests, manage recruitment progress, and see staffing gaps without cross-checking raw tables.

## Current State
- Phase 1 is live: baseline manpower plans and approved vs filled tracking
- Phase 2 is live: headcount request intake, review, approval, and request queue
- Phase 3A is live: recruitment pipeline data, overview view, card create/update/delete flow, and manual stage movement
- Phase 3B is live: manpower workspace uses the staffing funnel layout, action panels, and detailed subviews
- Phase 3C is live: hiring analytics widgets show planned/approved/filled, pipeline aging, not-started requests, and upcoming deadlines
- Current gap: stage movement uses explicit previous/next actions, not drag-and-drop
- Current UX gap: analytics can be filtered only through the existing workspace context; dedicated department filtering, export, and trend views are still future improvements

## Phase 3 Objective
Build a recruitment management layer on top of approved requests and redesign the manpower workspace into a clear staffing funnel.

## Phase 3 Scope
### 1. Recruitment Kanban
- ✅ Add a kanban board for `recruitment_pipeline`
- ✅ Group cards by stage:
  - `requested`
  - `sourcing`
  - `screening`
  - `interview`
  - `offer`
  - `hired`
  - `closed`
- ✅ Each card shows:
  - candidate name
  - linked request code
  - department
  - position
  - target hire date
  - owner
  - aging in stage
- ✅ Support manual previous/next stage updates for HR and superadmin
- ⏳ Drag-and-drop stage updates remain a future UX enhancement
- ⏳ Compact table fallback for smaller screens remains a future UX enhancement

### 2. Recruitment Record Model
- ✅ Keep the current `recruitment_pipeline` table as the base
- ✅ Standardize these fields:
  - `request_id`
  - `candidate_name`
  - `stage`
  - `source`
  - `owner_id`
  - `stage_updated_at`
  - `offer_status`
  - `expected_start_date`
  - `notes`
- ✅ Add helper view:
  - `recruitment_pipeline_overview`
- ✅ View joins:
  - request details
  - requester / approver names
  - plan period
  - open aging metrics

### 3. Request-to-Recruitment Workflow
- ✅ Approved request becomes the source for recruitment tracking
- ✅ HR can create one or more candidate cards from an approved request
- ✅ Request cards display:
  - requested count
  - hired count
  - remaining openings
  - pipeline count
- ✅ Approved requests with no candidates are visually flagged as “not started”

## Kanban Design
### Board Structure
- Top summary row:
  - approved requests
  - open requests
  - candidates in pipeline
  - hires completed
  - overdue target hire dates
- Main board:
  - stage columns with counts
  - cards sorted by urgency
- Right-side or modal detail:
  - candidate details
  - linked request details
  - stage history
  - notes and expected start date

Implementation note:

- Current board details are inline on each card, with edit/delete buttons and explicit previous/next movement controls.
- A separate right-side/modal detail panel is still optional future refinement.

### Card Priority Rules
- Sort by:
  - overdue target hire date first
  - urgent request priority second
  - oldest stage_updated_at third
- Add urgency badges:
  - `Overdue`
  - `Due Soon`
  - `Urgent Request`

## Clearer Dashboard and Workflow Plan
The manpower workspace should stop reading like two admin tables and start reading like a staffing funnel.

### Recommended Layout
#### Section 1: Workforce Summary
- Summary cards:
  - approved headcount
  - filled headcount
  - open gap
  - pending requests
  - active recruitment cards
  - hires this period

#### Section 2: Planning Funnel
- Four-step visual strip:
  - `Plan`
  - `Request`
  - `Recruit`
  - `Fill`
- Each step should show current count and bottleneck note
- Clicking a step should filter the lower panels

#### Section 3: Action Panels
- Left:
  - headcount gap by department
  - departments with biggest open gap
- Right:
  - approved requests awaiting sourcing
  - overdue recruitment items

#### Section 4: Detailed Views
- Tab or pill switcher:
  - `Plans`
  - `Requests`
  - `Recruitment Board`
  - `Hiring Analytics`

## Recommended Analytics
- ✅ Planned vs approved vs filled totals
- ✅ Approved requests with no pipeline activity
- ✅ Time in stage by recruitment column
- ✅ Hires completed/current-period hires
- ✅ Upcoming target hire deadlines
- ⏳ Planned vs approved vs filled by department
- ⏳ Open gap by position
- ⏳ Trend charts and export

## Data / View Plan
- Keep table writes in `src/modules/data/manpower.js`
- ✅ Add fetch helpers for:
  - `fetchRecruitmentPipeline`
  - `saveRecruitmentCard`
  - `updateRecruitmentStage`
  - `deleteRecruitmentCard`
- ✅ Add server-side views:
  - `recruitment_pipeline_overview`
- ⏳ Optional aggregate views still not created:
  - `manpower_funnel_summary`
  - `manpower_gap_by_department`

## UI Rollout
### Phase 3A
- ✅ Build recruitment overview view and fetch layer
- ✅ Add kanban board with manual stage actions
- ✅ Show request progress and remaining openings

### Phase 3B
- ✅ Redesign manpower page into funnel layout
- ✅ Add action panels and bottleneck cards
- ✅ Keep old tables as detail views, not the main landing view

### Phase 3C
- ✅ Add analytics widgets and department gap insights
- ✅ Add overdue and stalled recruitment indicators

## Current Blockers

- No active Phase 3 implementation blocker remains after routing recruitment-card deletion through the backend adapter.
- The main remaining blocker is documentation/process alignment: `claude.md` references process docs that are not present in this repo (`docs/tech-stack.md`, `docs/db-schema.md`, `docs/api-endpoints.md`, `docs/coding-standards.md`, `docs/env-guide.md`, `docs/git-workflow.md`, `commit-log.md`, and `agents.md`).
- The next product improvements are optional enhancements: drag-and-drop movement, compact table fallback, analytics export, department filter, trend charts, and aggregate summary views.

## Permissions
- `superadmin`: full access
- `hr`: full recruitment board management
- `manager`: create requests, view department-scoped request and hiring progress
- `director`: read summary and department progress

## Success Criteria
- HR can move recruitment work without leaving the manpower workspace
- Managers can understand request status without reading raw tables
- Staffing gaps and stalled hiring are visible from the top of the page
- The default manpower landing view explains the workflow in under 10 seconds

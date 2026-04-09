# Manpower Planning Plan

## Goal
Make manpower planning readable as one end-to-end workflow: plan headcount, submit requests, manage recruitment progress, and see staffing gaps without cross-checking raw tables.

## Current State
- Phase 1 is live: baseline manpower plans and approved vs filled tracking
- Phase 2 is live: headcount request intake, review, approval, and request queue
- Current gap: recruitment execution is still pipeline-ready data, but not yet a dedicated operational UI
- Current UX gap: planning and request tables exist, but the workflow is still hard to understand at a glance

## Phase 3 Objective
Build a recruitment management layer on top of approved requests and redesign the manpower workspace into a clear staffing funnel.

## Phase 3 Scope
### 1. Recruitment Kanban
- Add a kanban board for `recruitment_pipeline`
- Group cards by stage:
  - `requested`
  - `sourcing`
  - `screening`
  - `interview`
  - `offer`
  - `hired`
  - `closed`
- Each card should show:
  - candidate name
  - linked request code
  - department
  - position
  - target hire date
  - owner
  - aging in stage
- Support drag-and-drop stage updates for HR and superadmin
- Support compact table fallback for smaller screens

### 2. Recruitment Record Model
- Keep the current `recruitment_pipeline` table as the base
- Add or standardize these fields if needed:
  - `request_id`
  - `candidate_name`
  - `stage`
  - `source`
  - `owner_id`
  - `stage_updated_at`
  - `offer_status`
  - `expected_start_date`
  - `notes`
- Add helper view:
  - `recruitment_pipeline_overview`
- View should join:
  - request details
  - requester / approver names
  - plan period
  - open aging metrics

### 3. Request-to-Recruitment Workflow
- Approved request becomes the source for recruitment tracking
- HR can create one or more candidate cards from an approved request
- Request cards should display:
  - requested count
  - hired count
  - remaining openings
  - pipeline count
- Approved requests with no candidates should be visually flagged as “not started”

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
- Planned vs approved vs filled by department
- Open gap by position
- Approved requests with no pipeline activity
- Time in stage by recruitment column
- Hires completed vs requested count
- Upcoming target hire deadlines

## Data / View Plan
- Keep table writes in `src/modules/data/manpower.js`
- Add fetch helpers for:
  - `fetchRecruitmentPipeline`
  - `saveRecruitmentCard`
  - `updateRecruitmentStage`
  - `deleteRecruitmentCard`
- Add server-side views:
  - `recruitment_pipeline_overview`
  - `manpower_funnel_summary`
  - `manpower_gap_by_department`

## UI Rollout
### Phase 3A
- Build recruitment overview view and fetch layer
- Add kanban board with manual stage actions
- Show request progress and remaining openings

### Phase 3B
- Redesign manpower page into funnel layout
- Add action panels and bottleneck cards
- Keep old tables as detail views, not the main landing view

### Phase 3C
- Add analytics widgets and department gap insights
- Add overdue and stalled recruitment indicators

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

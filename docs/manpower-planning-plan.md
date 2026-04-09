# Manpower Planning Plan

## Goal
Create a dedicated manpower planning workspace for HR that separates workforce planning from employee master data.

## Core Use Cases
- Submit headcount requests by department and role
- Track approved vs actual headcount
- Monitor open positions and recruitment stage
- Forecast hiring demand by month or quarter
- Compare planned staffing against current employees

## Proposed Modules
### 1. Headcount Requests
- Create request
- Approve or reject request
- Track reason, urgency, and owner

### 2. Position Planning
- Planned positions by department
- Planned quantity vs filled quantity
- Criticality and priority

### 3. Hiring Pipeline
- Open requisitions
- Candidate stage summary
- Target hire date and aging

### 4. Capacity Dashboard
- Current headcount
- Approved plan
- Gap to target
- Hiring progress

## Proposed Tables
### `manpower_plans`
- `id` uuid pk
- `period` text
- `department` text
- `position` text
- `seniority` text
- `planned_headcount` numeric
- `approved_headcount` numeric
- `filled_headcount` numeric
- `status` text
- `notes` text
- `created_by` uuid/text
- `created_at` timestamptz
- `updated_at` timestamptz

### `headcount_requests`
- `id` uuid pk
- `plan_id` uuid fk -> `manpower_plans.id`
- `request_code` text
- `department` text
- `position` text
- `requested_count` numeric
- `business_reason` text
- `priority` text
- `requested_by` uuid/text
- `approved_by` uuid/text nullable
- `approval_status` text
- `target_hire_date` date nullable
- `created_at` timestamptz
- `updated_at` timestamptz

### `recruitment_pipeline`
- `id` uuid pk
- `request_id` uuid fk -> `headcount_requests.id`
- `candidate_name` text nullable
- `stage` text
- `source` text
- `owner_id` uuid/text
- `stage_updated_at` timestamptz
- `offer_status` text nullable
- `expected_start_date` date nullable
- `created_at` timestamptz
- `updated_at` timestamptz

## Suggested Status Enums
- `manpower_plans.status`: `draft`, `submitted`, `approved`, `active`, `closed`
- `headcount_requests.approval_status`: `pending`, `approved`, `rejected`, `cancelled`
- `recruitment_pipeline.stage`: `requested`, `sourcing`, `screening`, `interview`, `offer`, `hired`, `closed`

## API / Data Layer Split
- `src/modules/data/manpower.js`
  - fetchManpowerPlans
  - saveManpowerPlan
  - deleteManpowerPlan
  - fetchHeadcountRequests
  - saveHeadcountRequest
  - fetchRecruitmentPipeline
  - saveRecruitmentStage

## UI Rollout
### Phase 1
- Replace current placeholder with summary cards and an empty-state CTA
- Add planning table for approved vs filled headcount

### Phase 2
- Add request creation flow and approval state
- Add hiring pipeline board/table

### Phase 3
- Add forecasting charts and workforce gap analytics

## Integration Notes
- `filled_headcount` should be derived from existing `employees` data where possible
- Department and position options should reuse organization settings from the current app
- Approval actions should write to `admin_activity_log`

# Manpower Planning Workflow Redesign (Phase 3B & 3C)

This plan details the UI overhaul of the Manpower Planning workspace to transition it from a data-table-heavy view to an intuitive "Funnel Layout" with actionable insights and analytics.

## Goal

Make manpower planning readable as one end-to-end workflow: plan headcount, submit requests, manage recruitment progress, and see staffing gaps without cross-checking raw tables. This will be achieved by implementing Phase 3B and 3C from `docs/manpower-planning-plan.md`.

## Proposed Changes

### 1. UI Redesign (Frontend HTML)

#### [MODIFY] src/components/tab-employees.html

We will restructure the `#employees-planning` container to follow the funnel and action panel approach:

**Section 1: Workforce Summary (Top-level metrics)**

- Will keep and enhance the top counter cards.
- Add "Hires this period".

**Section 2: Planning Funnel (Visual strip)**

- Create a 4-step horizontal strip: Plan -> Request -> Recruit -> Fill.
- Include current counts and bottleneck indicators (e.g., "5 plans delayed", "3 overdue requests").
- Make steps clickable to scroll or filter the main view.

**Section 3: Action Panels (Left & Right Insights)**

- Left: "Headcount Gap by Department" progress bars or list.
- Right: "Awaiting Sourcing" (approved requests without active candidates) and "Overdue/Stalled Recruitment Items".

**Section 4: Detailed Views (Tab/Pill Switcher)**
Instead of all tables stacked vertically, they will be hidden behind a pill navigation switcher inside the Manpower Workspace:

- Tab 1: **Plans Setup & Table (Phase 1)**
- Tab 2: **Requests Intake & Queue (Phase 2)**
- Tab 3: **Hiring Analytics (Phase 3C)**
  _Note: The Recruitment Board itself remains a separate subview accessible via the Navigation or a dedicated button, but we will ensure the analytical summary is present in the funnel._

### 2. Logic Implementation (JavaScript Module)

#### [MODIFY] src/modules/employees.js

- **Render Function (`renderManpowerPlanning`)**:
   - Overhaul to generate the stats for the Funnel steps.
   - Compute Department Gap aggregations and render the left action panel ("Headcount gap by department").
   - Compute Action Items and render the right action panel (overdue tasks, approved requests awaiting sourcing).
- **Tab Switcher Logic**: Add functions to handle the "Detailed Views" tab switching (Plans, Requests, Analytics).
- **UI Data Formatting**: Compute "Hires this period" by filtering recruitment pipelines for hired dates.

#### [MODIFY] src/modules/data/manpower.js

- Ensure helper functions exist for any complex analytics parsing, though most can be done in memory in `employees.js` given the current dataset load approach (`fetchManpowerPlans`, `fetchHeadcountRequests`, `fetchRecruitmentPipeline`). Add specific selectors if needed.

## Open Questions

1. **Charting Library**: We currently use `Chart.js` via `chartLoader.js`. Do we want the analytics tab to include actual charts (like pie charts for Department Gaps) or just HTML-based progress bars/lists?
2. **"Hires this period" Definition**: Are we defining "this period" as the current month based on `expected_start_date` or `stage_updated_at`?
3. **Tab Persistence**: When switching between "Plans", "Requests", and "Analytics", should the app remember the user's last selected tab in this session, or default to the "Analytics/Overview" every time they open Manpower Planning?

## Verification Plan

### Manual Verification

1. Load the Manpower Planning tab and confirm the top summary and 4-step funnel appear instantly.
2. Ensure the "Action Panels" flag real delayed requests (if a request is overdue, it shows up on the right).
3. Test the tab switcher to open Plans Form, Requests Form, and read the tabular data.
4. Verify responsivness to ensure the funnel and analytics cards flex correctly on smaller views.
5. Create an overdue request and check if the bottleneck indicators increment properly.

# Manpower Planning Workflow Redesign (Phase 3B & 3C)

## Status: Phase 3B ✅ COMPLETE | Phase 3C ✅ COMPLETE

This plan details the UI overhaul of the Manpower Planning workspace to transition it from a data-table-heavy view to an intuitive "Funnel Layout" with actionable insights and analytics.

## Implementation Summary

### Phase 3B - UI Redesign (Completed ✅)

#### 1. Workforce Summary (Top-level metrics)
- ✅ Top counter cards preserved (Plan Rows, Approved Headcount, Filled Headcount, Gap to Fill)
- ✅ Secondary metrics added (Pending Requests, Active Pipeline, Hires This Period, Overdue Targets)

#### 2. Planning Funnel (Visual strip)
- ✅ 4-step horizontal strip: Plan → Request → Recruit → Fill
- ✅ Current counts displayed per step
- ✅ Bottleneck indicators when counts are zero
- ✅ **Clickable steps** - clicking navigates to the relevant tab

#### 3. Action Panels (Left & Right Insights)
- ✅ **Left Panel**: "Headcount Gap by Department" with progress bars showing approved vs filled
- ✅ **Right Panel**: "Attention Needed" showing:
  - Approved requests awaiting sourcing (no pipeline candidates)
  - Overdue recruitment items (past target hire date)

#### 4. Detailed Views (Tab/Pill Switcher)
- ✅ Tab 1: **Plans** - Phase 1 setup form + table
- ✅ Tab 2: **Requests** - Phase 2 intake + queue
- ✅ Tab 3: **Recruitment** - Kanban board
- ✅ Tab 4: **Analytics** - Hiring insights and charts

### Phase 3C - Hiring Analytics (Completed ✅)

#### Analytics Widgets Implemented

1. **Planned vs Approved vs Filled** (Chart.js bar chart)
   - Shows total headcount comparison across all plans
   - Visual bar chart for quick comprehension

2. **Time in Pipeline by Stage** (Chart.js bar chart)
   - Average days spent in each active stage
   - Red highlighting for stages with 7+ days average (bottleneck indicator)

3. **Approved Requests Without Pipeline**
   - Lists approved requests that haven't started sourcing
   - Shows request code, department, position

4. **Upcoming Hire Deadlines**
   - Requests with target hire dates within 30 days
   - Color-coded urgency (red ≤7 days, yellow ≤14 days)
   - Sorted by closest deadline first

### Data Logic Improvements

#### "Hires This Period" Fix
- ✅ Now filters to **current month only** using `stage_updated_at` timestamp
- Previously showed ALL hired candidates ever, not just current period

## Files Modified

### src/components/tab-employees.html
- Added `funnel-step` class with `cursor:pointer` to funnel strip columns
- Added `onclick` handlers to funnel steps for tab navigation
- Added `mp-chart-planned` and `mp-chart-pipeline-age` canvas elements for Chart.js
- Replaced static progress bar divs with chart canvases

### src/modules/employees.js
- Added `getChartCtor` import from `chartLoader.js`
- Added `mpChartPlanned` and `mpChartPipelineAge` chart instance variables
- Updated `renderManpowerAnalytics()` to:
  - Use Chart.js for "Planned vs Approved vs Filled" visualization
  - Use Chart.js for "Time in Pipeline by Stage" visualization
  - Retained table views for "Not Started" and "Deadlines" sections
- Updated `renderManpowerFunnel()` to filter hires by current month

## Verification Checklist

- [x] Load Manpower Planning tab → Funnel strip loads instantly
- [x] Funnel steps are clickable and navigate to correct tabs
- [x] Action panels show real delayed requests
- [x] Analytics tab renders Chart.js charts correctly
- [x] "Hires this period" only shows current month's hires
- [x] Responsive layout works on smaller screens

## Dependencies

- Chart.js (loaded via `chartLoader.js` lazy import)
- Bootstrap 5 for UI components
- Supabase for data persistence

## Known Limitations / Future Improvements

1. **Chart Tooltips**: Could add detailed tooltips showing exact numbers
2. **Export Analytics**: Add export to CSV/PDF for reporting
3. **Department Filter**: Add ability to filter analytics by department
4. **Trend Charts**: Add month-over-month trend visualization
5. **Real-time Updates**: Charts could auto-refresh when data changes

## Architecture Notes

### State Dependencies
The analytics rely on three state arrays:
- `state.manpowerPlans` - Phase 1 plan data
- `state.headcountRequests` - Phase 2 request data
- `state.recruitmentPipeline` - Phase 3 recruitment cards

### Chart Lifecycle
Charts are destroyed and recreated when switching to the Analytics tab to prevent memory leaks and ensure fresh data.

## Open Questions (Resolved)

1. **Charting Library**: Chart.js via `chartLoader.js` ✅
2. **"Hires this period" Definition**: Current month based on `stage_updated_at` ✅
3. **Tab Persistence**: Defaults to "Plans" tab (session not persisted) ✅

# Dashboard Module Refactoring Plan

Based on the `docs/refactor/module-map.md`, the next priority for internal module structuring is paying down the technical debt inside the monolithic `src/modules/dashboard/core.js` file.

## Goal
Continue untangling the dashboard feature logic. Specifically, we will extract `renderKpiSummary` and all related leadership analytics display methods from the large `core.js` file into their designated `kpiSummary.js` module.

## Proposed Changes

### [MODIFY] `src/modules/dashboard/kpiSummary.js`
This file is currently just a stub exporting functions from `core.js`. We will:
- Move the actual implementation of `renderKpiSummary`, `renderDeptKpiCards` and any closely related KPI leaderboard/aggregation logic from `core.js` to here.
- Add necessary dependencies such as `state` imports, helper functions from `shared.js`, DOM access methods, and chart utilities.

### [MODIFY] `src/modules/dashboard/core.js`
- Remove the implementation of `renderKpiSummary`, `renderDeptKpiCards`, and the related inner functions.
- Clean up imported dependencies that were only used by those methods.
- Import `renderKpiSummary` and `renderDeptKpiCards` back from `kpiSummary.js` if they are required internally, or let `dashboard.js` (the facade) route the API directly to `kpiSummary.js` (to maintain the internal API surface).

### [MODIFY] `src/modules/dashboard.js`
- Update the facade routing. Instead of forwarding `renderKpiSummary` to `core.js`, it will forward to `kpiSummary.js`. This guarantees that the public contract (e.g. `window.__app`) remains exactly the same for HTML handlers.

## Open Questions
- There may be tightly coupled state inside `core.js` (e.g., cached arrays or filtering objects) that `renderKpiSummary` uses. If so, should we move that state calculation to a shared utility file or keep it within the `kpiSummary` domain if it's exclusive?

## Verification Plan
### Automated & Static Tests
- Run `npm run build` to verify that Vite bundles correctly without circular dependency issues.
- Run `npm run qa:hardening` to ensure no environment regressions occurred.
### Manual Verification
- Render the application locally and navigate to the KPI Dashboard.
- Verify that the Summary Cards (Total Company Score, Department scores) and Leaderboards render exactly as they did before without missing data or console errors.

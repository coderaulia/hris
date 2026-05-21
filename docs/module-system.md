# Module System

Updated: 2026-05-21

The app now supports env-driven feature composition.

## Required Base Modules

These are always enabled:

- `core`
- `dashboard`
- `employees`
- `kpi`

## Optional Modules

- `assessment`
- `tna`
- `manpower`
- `recruitment`
- `probation`
- `pip`

## Environment Controls

- `VITE_ENABLED_MODULES=assessment,tna,probation`

`VITE_ENABLED_MODULES` is the only toggle surface. The required base modules are always added automatically.

## Current Scope

- module registry and env-only resolution
- sidebar/navigation manifest moved into config and filtered by enabled modules
- selective data sync by enabled modules
- dashboard, employees, records, and settings surfaces now hide optional module sections

Large shared views still exist in some modules, but the current production contract is the
environment-driven registry plus stable adapter/data boundaries. Track refactor-specific follow-up
inside `docs/code-audit.md` only when it becomes an active implementation risk.

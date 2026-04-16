# Module System

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

Next migration steps:

- shrink remaining cross-module coupling inside large shared views
- move remaining tab/view defaults into module-owned contracts

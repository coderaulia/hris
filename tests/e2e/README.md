# E2E Regression Tests

Playwright now runs from the repo-level `tests/` directory.

Current regression specs:

- `tests/auth.spec.js`
- `tests/assessment.spec.js`
- `tests/kpi-approval.spec.js`
- `tests/probation.spec.js`
- `tests/stress-workload.spec.js`

## Run

```bash
npm run e2e:bootstrap:local
npm run qa:e2e
```

## Stress QA

Use the dedicated stress seed to simulate larger manager, HR, and employee workloads.

Average profile:

```bash
npm run qa:stress:seed:average
npm run qa:e2e:stress
```

Busy profile:

```bash
npm run qa:stress:seed:busy
set STRESS_PROFILE=busy
set STRESS_EMPLOYEES=220
set TEST_STRESS_EMPLOYEE_EMAIL=qa.stress.busy.employee@demo.local
npm run qa:e2e:stress
```

Required environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`

The stress seed only touches rows with the `QA-STRESS-*` prefixes so it can be re-run safely.

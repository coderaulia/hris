import { test, expect } from '@playwright/test';

test.describe('Backend Adapter Routing', () => {
    
    test.beforeEach(async ({ page }) => {
        // Go to home page to ensure we can evaluate scripts
        await page.goto('/');
    });

    test('routes to Supabase by default', async ({ page }) => {
        const type = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return backend._type;
        });
        expect(type).toBe('supabase');
    });

    test('routes to Laravel when forced', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();
        
        const type = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return backend._type;
        });
        expect(type).toBe('laravel');
    });

    test('Supabase adapter uses Supabase SDK (Mocked)', async ({ page }) => {
        // Mock Supabase REST call
        await page.route('**/rest/v1/employees?*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: 'SUPA-1', name: 'Supa Employee' }])
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.employees.list();
        });

        expect(result.data[0].id).toBe('SUPA-1');
    });

    test('Laravel adapter uses fetch API (Mocked)', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        // Mock Laravel API call
        await page.route('**/api/v1/employees', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [{ id: 'LARA-1', name: 'Lara Employee' }]
                })
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.employees.list();
        });

        expect(result.data[0].id).toBe('LARA-1');
    });

    test('Laravel adapter exposes KPI governance routes', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        await page.route('**/api/v1/kpi-definition-versions', async route => {
            expect(route.request().method()).toBe('POST');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: { id: 'VER-1', version_no: 2 }
                })
            });
        });

        await page.route('**/api/v1/kpi-records/REC-1', async route => {
            expect(route.request().method()).toBe('DELETE');
            await route.fulfill({ status: 204 });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const version = await backend.kpis.saveDefinitionVersion({
                kpi_definition_id: 'DEF-1',
                version_no: 2,
            });
            const deleted = await backend.kpis.deleteRecord('REC-1');

            return {
                versionId: version.data.id,
                deleteError: deleted.error ? deleted.error.message : null,
                methods: [
                    'saveDefinition',
                    'deleteDefinition',
                    'listDefinitionVersions',
                    'saveDefinitionVersion',
                    'updateDefinitionVersion',
                    'listTargetVersions',
                    'saveTargetVersion',
                    'updateTargetVersion',
                    'saveWeightProfile',
                    'saveWeightItems',
                    'deleteRecord',
                ].every(method => typeof backend.kpis[method] === 'function'),
            };
        });

        expect(result.versionId).toBe('VER-1');
        expect(result.deleteError).toBeNull();
        expect(result.methods).toBe(true);
    });

    test('probation and PIP helpers persist every prepared row', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const monthlyRequests = [];
        const pipRequests = [];

        await page.route('**/api/v1/probation-monthly-scores', async route => {
            const payload = route.request().postDataJSON();
            monthlyRequests.push(payload);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: payload })
            });
        });

        await page.route('**/api/v1/pip-actions', async route => {
            const payload = route.request().postDataJSON();
            pipRequests.push(payload);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: payload })
            });
        });

        const result = await page.evaluate(async () => {
            const { state } = await import('./src/lib/store.js');
            const { saveProbationMonthlyScores } = await import('./src/modules/data/probation.js');
            const { savePipActions } = await import('./src/modules/data/pip.js');

            state.probationMonthlyScores = [];
            state.pipActions = [];
            state.appSettings = {};

            const monthly = await saveProbationMonthlyScores('REV-1', [
                { month_no: 1, period_start: '2026-01-01', period_end: '2026-01-31', monthly_total: 80 },
                { month_no: 2, period_start: '2026-02-01', period_end: '2026-02-28', monthly_total: 82 },
                { month_no: 3, period_start: '2026-03-01', period_end: '2026-03-31', monthly_total: 84 },
            ]);

            const actions = await savePipActions('PIP-1', [
                { action_title: 'Weekly coaching check-in', status: 'todo' },
                { action_title: 'Submit KPI recovery target', status: 'todo' },
            ]);

            return {
                monthlyLength: monthly.length,
                monthlyStateLength: state.probationMonthlyScores.filter(row => row.probation_review_id === 'REV-1').length,
                monthlyMonths: monthly.map(row => row.month_no),
                actionLength: actions.length,
                actionStateLength: state.pipActions.filter(row => row.pip_plan_id === 'PIP-1').length,
                actionTitles: actions.map(row => row.action_title),
                actionIds: actions.map(row => row.id),
            };
        });

        expect(monthlyRequests).toHaveLength(3);
        expect(monthlyRequests.map(row => row.month_no)).toEqual([1, 2, 3]);
        expect(pipRequests).toHaveLength(2);
        expect(pipRequests.map(row => row.action_title)).toEqual([
            'Weekly coaching check-in',
            'Submit KPI recovery target',
        ]);
        expect(result.monthlyLength).toBe(3);
        expect(result.monthlyStateLength).toBe(3);
        expect(result.monthlyMonths).toEqual([1, 2, 3]);
        expect(result.actionLength).toBe(2);
        expect(result.actionStateLength).toBe(2);
        expect(result.actionTitles).toEqual([
            'Weekly coaching check-in',
            'Submit KPI recovery target',
        ]);
        expect(result.actionIds.every(Boolean)).toBe(true);
    });

    test('Laravel adapter uploads and downloads HR document archive files', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const requests = [];

        await page.route('**/api/v1/hr-document-archive', async route => {
            const payload = route.request().postDataJSON();
            requests.push({ type: 'create', payload });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: {
                        ...payload,
                        id: '11111111-1111-4111-8111-111111111111',
                        storage_path: null,
                    },
                }),
            });
        });

        await page.route('**/api/v1/hr-document-archive/11111111-1111-4111-8111-111111111111/file', async route => {
            if (route.request().method() === 'POST') {
                requests.push({
                    type: 'upload',
                    contentType: route.request().headers()['content-type'] || '',
                });
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: {
                            id: '11111111-1111-4111-8111-111111111111',
                            employee_id: 'E001',
                            document_type: 'offer_letter',
                            filename: 'offer-letter.pdf',
                            storage_path: 'hr-document-archive/11111111-1111-4111-8111-111111111111/offer-letter.pdf',
                        },
                    }),
                });
                return;
            }

            requests.push({ type: 'download' });
            await route.fulfill({
                status: 200,
                contentType: 'application/pdf',
                body: '%PDF-1.4\n',
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const saved = await backend.documents.storeArchive({
                id: '11111111-1111-4111-8111-111111111111',
                employee_id: 'E001',
                document_type: 'offer_letter',
                filename: 'offer-letter.pdf',
                generated_at: new Date().toISOString(),
                metadata: {},
            }, new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }));
            const urlResult = await backend.documents.getSignedUrl(saved.data.storage_path);

            return {
                error: saved.error ? saved.error.message : null,
                storagePath: saved.data.storage_path,
                urlError: urlResult.error ? urlResult.error.message : null,
                signedUrlPrefix: String(urlResult.data?.signedUrl || '').slice(0, 5),
            };
        });

        expect(result.error).toBeNull();
        expect(result.urlError).toBeNull();
        expect(result.storagePath).toContain('hr-document-archive/11111111-1111-4111-8111-111111111111');
        expect(result.signedUrlPrefix).toBe('blob:');
        expect(requests.map(item => item.type)).toEqual(['create', 'upload', 'download']);
        expect(requests.find(item => item.type === 'upload').contentType).toContain('multipart/form-data');
    });

    test('Laravel employee save uses API training routes instead of direct Supabase writes', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const requests = [];

        await page.route('**/rest/v1/employee_training_records**', async route => {
            requests.push({ type: 'unexpected-supabase-training-write' });
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Training sync must use backend adapter routes.' }),
            });
        });

        await page.route('**/api/v1/employees', async route => {
            const payload = route.request().postDataJSON();
            requests.push({ type: 'employee-create', method: route.request().method(), payload });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: payload }),
            });
        });

        await page.route('**/api/v1/training-records', async route => {
            if (route.request().method() === 'GET') {
                requests.push({ type: 'training-list' });
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [
                            {
                                id: 'TR-OLD',
                                employee_id: 'E777',
                                course: 'Old Course',
                                status: 'completed',
                            },
                            {
                                id: 'TR-OTHER',
                                employee_id: 'E888',
                                course: 'Other Course',
                                status: 'completed',
                            },
                        ],
                    }),
                });
                return;
            }

            const payload = route.request().postDataJSON();
            requests.push({ type: 'training-create', payload });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { ...payload, id: 'TR-NEW' } }),
            });
        });

        await page.route('**/api/v1/training-records/TR-OLD', async route => {
            requests.push({ type: 'training-delete', method: route.request().method() });
            await route.fulfill({ status: 204 });
        });

        const result = await page.evaluate(async () => {
            const { state } = await import('./src/lib/store.js');
            const { saveEmployee } = await import('./src/modules/data/employees.js');

            state.db = {};
            await saveEmployee({
                id: 'E777',
                name: 'Laravel Training Employee',
                position: 'Developer',
                seniority: 'Mid',
                join_date: '2026-05-01',
                department: 'Engineering',
                role: 'employee',
                training_history: [
                    {
                        course: 'Security Basics',
                        start: '2026-05-01',
                        end: '2026-05-02',
                        provider: 'Internal',
                        status: 'completed',
                        notes: 'Passed.',
                    },
                ],
            });

            return {
                savedEmployee: state.db.E777?.name,
                trainingCount: state.db.E777?.training_history?.length,
            };
        });

        expect(result.savedEmployee).toBe('Laravel Training Employee');
        expect(result.trainingCount).toBe(1);
        expect(requests.map(item => item.type)).toEqual([
            'employee-create',
            'training-list',
            'training-delete',
            'training-create',
        ]);
        expect(requests.find(item => item.type === 'training-create').payload).toMatchObject({
            employee_id: 'E777',
            course: 'Security Basics',
            status: 'completed',
        });
    });

    test('Laravel adapter covers manpower approval and pipeline routing', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const requests = [];

        await page.route('**/api/v1/manpower-plans', async route => {
            requests.push({ type: 'plan', method: route.request().method(), payload: route.request().postDataJSON() });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { ...route.request().postDataJSON(), id: 'MP-1' } }),
            });
        });

        await page.route('**/api/v1/headcount-requests', async route => {
            requests.push({ type: 'request', method: route.request().method(), payload: route.request().postDataJSON() });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { ...route.request().postDataJSON(), id: 'REQ-1' } }),
            });
        });

        await page.route('**/api/v1/recruitment-pipeline', async route => {
            requests.push({ type: 'pipeline', method: route.request().method(), payload: route.request().postDataJSON() });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: { ...route.request().postDataJSON(), id: 'PIPE-1' } }),
            });
        });

        await page.route('**/api/v1/recruitment-pipeline/PIPE-1', async route => {
            requests.push({ type: 'pipeline-delete', method: route.request().method() });
            await route.fulfill({ status: 204 });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const plan = await backend.manpower.savePlan({
                period: '2026-05',
                department: 'Engineering',
                position: 'Developer',
                seniority: 'Mid',
                planned_headcount: 2,
            });
            const request = await backend.manpower.saveRequest({
                id: 'REQ-1',
                department: 'Engineering',
                position: 'Developer',
                requested_count: 1,
                approval_status: 'approved',
                approved_by: 'HR01',
            });
            const pipeline = await backend.manpower.savePipeline({
                request_id: 'REQ-1',
                candidate_name: 'Candidate One',
                stage: 'offer',
            });
            const deleted = await backend.manpower.deletePipeline('PIPE-1');

            return {
                planId: plan.data.id,
                requestStatus: request.data.approval_status,
                pipelineStage: pipeline.data.stage,
                deleteError: deleted.error ? deleted.error.message : null,
            };
        });

        expect(result).toEqual({
            planId: 'MP-1',
            requestStatus: 'approved',
            pipelineStage: 'offer',
            deleteError: null,
        });
        expect(requests.map(item => `${item.type}:${item.method}`)).toEqual([
            'plan:POST',
            'request:POST',
            'pipeline:POST',
            'pipeline-delete:DELETE',
        ]);
    });

    test('Laravel adapter covers payroll import and archive listing/download routing', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const requests = [];

        await page.route('**/api/v1/hr-payroll-records/import', async route => {
            const payload = route.request().postDataJSON();
            requests.push({ type: 'payroll-import', payload });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: payload.records }),
            });
        });

        await page.route('**/api/v1/hr-document-archive', async route => {
            requests.push({ type: 'archive-list' });
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [{
                        id: '22222222-2222-4222-8222-222222222222',
                        employee_id: 'E001',
                        document_type: 'payslip',
                        filename: 'payslip.pdf',
                        storage_path: 'hr-document-archive/22222222-2222-4222-8222-222222222222/payslip.pdf',
                    }],
                }),
            });
        });

        await page.route('**/api/v1/hr-document-archive/22222222-2222-4222-8222-222222222222/file', async route => {
            requests.push({ type: 'archive-download' });
            await route.fulfill({
                status: 200,
                contentType: 'application/pdf',
                body: '%PDF-1.4\n',
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const payroll = await backend.documents.savePayrollRecords([{
                employee_id: 'E001',
                payroll_period: '2026-05',
                basic_salary: 12000000,
            }]);
            const archive = await backend.documents.listArchive();
            const url = await backend.documents.getSignedUrl(archive.data[0].storage_path);

            return {
                payrollCount: payroll.data.length,
                archiveCount: archive.data.length,
                signedUrlPrefix: String(url.data?.signedUrl || '').slice(0, 5),
                error: payroll.error || archive.error || url.error,
            };
        });

        expect(result.error).toBeFalsy();
        expect(result.payrollCount).toBe(1);
        expect(result.archiveCount).toBe(1);
        expect(result.signedUrlPrefix).toBe('blob:');
        expect(requests.map(item => item.type)).toEqual([
            'payroll-import',
            'archive-list',
            'archive-download',
        ]);
        expect(requests[0].payload.records[0]).toMatchObject({
            employee_id: 'E001',
            payroll_period: '2026-05',
            basic_salary: 12000000,
        });
    });
});

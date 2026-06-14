import { test, expect } from '@playwright/test';

// Adapter-level routing coverage for the e-signature workflow.
// These tests mock the network and assert the documents adapter routes
// signature-request operations to the expected Supabase / Laravel surfaces.

test.describe('Signature request adapter routing', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('Supabase: listSignatureRequests filters by archive_id', async ({ page }) => {
        let requestedUrl = '';
        await page.route('**/rest/v1/document_signature_requests?*', async route => {
            requestedUrl = route.request().url();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: 'SIG-1', archive_id: 'ARC-1', signer_employee_id: 'EMP-1', status: 'pending' },
                ]),
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.documents.listSignatureRequests('ARC-1');
        });

        expect(result.data[0].id).toBe('SIG-1');
        expect(requestedUrl).toContain('archive_id=eq.ARC-1');
    });

    test('Supabase: createSignatureRequests inserts rows', async ({ page }) => {
        let method = '';
        let body = '';
        await page.route('**/rest/v1/document_signature_requests*', async route => {
            const req = route.request();
            if (req.method() === 'POST') {
                method = req.method();
                body = req.postData() || '';
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        { id: 'SIG-NEW', archive_id: 'ARC-1', signer_employee_id: 'EMP-9', status: 'pending' },
                    ]),
                });
                return;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.documents.createSignatureRequests([
                { archive_id: 'ARC-1', signer_employee_id: 'EMP-9', signer_role: 'employee', status: 'pending' },
            ]);
        });

        expect(method).toBe('POST');
        expect(body).toContain('EMP-9');
        expect(result.data[0].id).toBe('SIG-NEW');
    });

    test('Supabase: updateSignatureRequest patches by id', async ({ page }) => {
        let method = '';
        let requestedUrl = '';
        await page.route('**/rest/v1/document_signature_requests?*', async route => {
            const req = route.request();
            method = req.method();
            requestedUrl = req.url();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: 'SIG-1', status: 'declined' }),
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.documents.updateSignatureRequest('SIG-1', { status: 'declined' });
        });

        expect(method).toBe('PATCH');
        expect(requestedUrl).toContain('id=eq.SIG-1');
        expect(result.data.status).toBe('declined');
    });

    test('Supabase: deleteSignatureRequest deletes by id', async ({ page }) => {
        let method = '';
        let requestedUrl = '';
        await page.route('**/rest/v1/document_signature_requests?*', async route => {
            const req = route.request();
            method = req.method();
            requestedUrl = req.url();
            await route.fulfill({ status: 204, contentType: 'application/json', body: '[]' });
        });

        await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.documents.deleteSignatureRequest('SIG-1');
        });

        expect(method).toBe('DELETE');
        expect(requestedUrl).toContain('id=eq.SIG-1');
    });

    test('Supabase: getSignatureSignedUrl signs a storage object', async ({ page }) => {
        let signedPath = '';
        await page.route('**/storage/v1/object/sign/document-signatures/**', async route => {
            signedPath = route.request().url();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ signedURL: '/storage/v1/object/sign/document-signatures/EMP-1/SIG-1.png?token=abc' }),
            });
        });

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            return await backend.documents.getSignatureSignedUrl('EMP-1/SIG-1.png');
        });

        expect(signedPath).toContain('document-signatures');
        expect(result.data.signedUrl).toContain('token=abc');
    });

    test('Laravel: signature methods degrade gracefully', async ({ page }) => {
        await page.addInitScript(() => {
            window._VITE_BACKEND_TYPE = 'laravel';
        });
        await page.reload();

        const result = await page.evaluate(async () => {
            const { backend } = await import('./src/lib/backend.js');
            const list = await backend.documents.listMySignatureRequests('EMP-1');
            const create = await backend.documents.createSignatureRequests([{ archive_id: 'ARC-1' }]);
            return {
                listData: list.data,
                listError: list.error ? String(list.error.message) : null,
                createHasError: Boolean(create.error),
            };
        });

        expect(result.listData).toEqual([]);
        expect(result.listError).toBeNull();
        expect(result.createHasError).toBe(true);
    });
});

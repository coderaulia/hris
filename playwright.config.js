import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

export default defineConfig({
    testDir: './tests',
    testMatch: ['**/*.spec.js'],
    testIgnore: ['**/README.md'],
    timeout: 90000,
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    expect: {
        timeout: 15000,
    },
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        viewport: { width: 1440, height: 900 },
    },
    reporter: [
        ['list'],
        ['html', { open: 'never' }],
    ],
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});

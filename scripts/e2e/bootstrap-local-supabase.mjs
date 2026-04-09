import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const dbUrl = String(process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres').trim();
const supabaseUrl = String(process.env.SUPABASE_URL || 'http://127.0.0.1:54321').trim().replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required for local e2e bootstrap.');
    process.exit(1);
}

const sqlFiles = [
    path.join(repoRoot, 'complete-setup.sql'),
    ...fs.readdirSync(path.join(repoRoot, 'migrations'))
        .filter(name => name.endsWith('.sql'))
        .sort()
        .map(name => path.join(repoRoot, 'migrations', name)),
    path.join(repoRoot, 'supabase', '01_dummy_seed.sql'),
];

const authUsers = [
    { email: 'superadmin@demo.local', password: 'Superadmin123!' },
    { email: 'director@demo.local', password: 'Director123!' },
    { email: 'hr@demo.local', password: 'HrManager123!' },
    { email: 'eng.manager@demo.local', password: 'Manager123!' },
    { email: 'sales.manager@demo.local', password: 'Manager123!' },
    { email: 'raka.frontend@demo.local', password: 'Employee123!' },
    { email: 'nia.backend@demo.local', password: 'Employee123!' },
    { email: 'bima.sales@demo.local', password: 'Employee123!' },
    { email: 'tari.ops@demo.local', password: 'Employee123!' },
];

async function applySqlFiles() {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    try {
        await client.query('SET statement_timeout = 0');
        for (const file of sqlFiles) {
            const sql = fs.readFileSync(file, 'utf8');
            console.log(`Applying SQL: ${path.relative(repoRoot, file)}`);
            await client.query(sql);
        }
    } finally {
        await client.end();
    }
}

async function createAuthUsers() {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    for (const user of authUsers) {
        const { error } = await admin.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: {
                source: 'playwright-e2e-bootstrap',
            },
        });

        if (error && !/already registered|already exists|duplicate/i.test(String(error.message || ''))) {
            throw error;
        }

        console.log(`Auth user ready: ${user.email}`);
    }
}

async function main() {
    console.log(`Bootstrap DB URL: ${dbUrl}`);
    console.log(`Bootstrap Supabase URL: ${supabaseUrl}`);
    await applySqlFiles();
    await createAuthUsers();
    console.log('Local Supabase bootstrap complete.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'migrations');

if (!fs.existsSync(migrationDir)) {
    throw new Error('migrations directory not found.');
}

const files = fs.readdirSync(migrationDir)
    .filter(name => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
const forwardFiles = files.filter(name => !name.endsWith('.rollback.sql'));
const rollbackFiles = files.filter(name => name.endsWith('.rollback.sql'));

const failures = [];

const bannedPatterns = [
    { regex: /\bdrop\s+table\b/i, label: 'DROP TABLE is not allowed in safe migrations' },
    { regex: /\btruncate\b/i, label: 'TRUNCATE is not allowed in safe migrations' },
    { regex: /\bdelete\s+from\b/i, label: 'DELETE FROM is not allowed in safe migrations' },
    { regex: /disable\s+row\s+level\s+security/i, label: 'Disabling RLS is not allowed' },
];

function readNormalizedSql(file) {
    const fullPath = path.join(migrationDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const sanitizedSql = sql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\\s\\S]*?\*\//g, '');
    const normalized = sanitizedSql.toLowerCase();

    return { sanitizedSql, normalized };
}

function assertTransactionWrapped(file, normalized) {
    if (!/\bbegin\s*;/i.test(normalized)) {
        failures.push(`${file}: missing BEGIN; transaction wrapper`);
    }

    if (!/\bcommit\s*;/i.test(normalized)) {
        failures.push(`${file}: missing COMMIT; transaction wrapper`);
    }
}

for (const file of forwardFiles) {
    const { sanitizedSql, normalized } = readNormalizedSql(file);

    if (!/^\d{8}_[a-z0-9_]+\.sql$/.test(file)) {
        failures.push(`${file}: filename must match YYYYMMDD_description.sql`);
    }

    assertTransactionWrapped(file, normalized);

    for (const pattern of bannedPatterns) {
        if (pattern.regex.test(sanitizedSql)) {
            failures.push(`${file}: ${pattern.label}`);
        }
    }
}

for (const file of rollbackFiles) {
    const { normalized } = readNormalizedSql(file);

    if (!/^\d{8}_[a-z0-9_]+\.rollback\.sql$/.test(file)) {
        failures.push(`${file}: rollback filename must match YYYYMMDD_description.rollback.sql`);
    }

    assertTransactionWrapped(file, normalized);
}

console.log('=== Migration Safety Check ===');
console.log(`forward_migrations_scanned: ${forwardFiles.length}`);
console.log(`rollback_migrations_scanned: ${rollbackFiles.length}`);

if (failures.length > 0) {
    console.error(`failed_checks: ${failures.length}`);
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}

console.log('failed_checks: 0');
console.log('Migration safety checks passed.');

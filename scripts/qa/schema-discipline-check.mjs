import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const allowedRootSql = new Set(['complete-setup.sql']);
const allowedReferencePrefixes = ['docs/qa/'];
const failures = [];

function walk(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
            results.push(...walk(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.sql')) {
            results.push(fullPath);
        }
    }
    return results;
}

const sqlFiles = walk(root);
const migrationDir = path.join(root, 'migrations');

for (const filePath of sqlFiles) {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');

    if (rel.startsWith('migrations/')) {
        const name = path.basename(rel);
        if (!/^\d{8}_[a-z0-9_]+\.sql$/.test(name)) {
            failures.push(`${rel}: migration filename must match YYYYMMDD_description.sql`);
        }
        continue;
    }

    if (allowedReferencePrefixes.some(prefix => rel.startsWith(prefix))) {
        continue;
    }

    if (allowedRootSql.has(rel)) continue;

    failures.push(`${rel}: schema SQL must live in complete-setup.sql or numbered migrations/ files only`);
}

if (!fs.existsSync(path.join(root, 'complete-setup.sql'))) {
    failures.push('complete-setup.sql is required as the fresh-environment bootstrap snapshot');
}

if (!fs.existsSync(migrationDir)) {
    failures.push('migrations/ directory is required for append-only schema changes');
}

console.log('=== Schema Discipline Check ===');
console.log(`sql_files_scanned: ${sqlFiles.length}`);
console.log(`failed_checks: ${failures.length}`);

if (failures.length > 0) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}

console.log('Schema discipline checks passed.');

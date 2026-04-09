import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'migrations');
const baseSetup = path.join(root, 'complete-setup.sql');
const sourceRoots = [
    path.join(root, 'src', 'modules'),
    path.join(root, 'src', 'lib'),
];

function readSqlFilesInOrder() {
    const files = [];
    if (fs.existsSync(baseSetup)) files.push(baseSetup);
    if (fs.existsSync(migrationDir)) {
        const migrationFiles = fs.readdirSync(migrationDir)
            .filter(name => name.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b))
            .map(name => path.join(migrationDir, name));
        files.push(...migrationFiles);
    }
    return files;
}

function walkFiles(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

function stripSqlComments(sql) {
    return String(sql)
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
}

function splitSqlStatements(sql) {
    return stripSqlComments(sql)
        .split(';')
        .map(stmt => stmt.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

function ensureTableState(map, role, table) {
    if (!map.has(role)) map.set(role, new Map());
    const roleMap = map.get(role);
    if (!roleMap.has(table)) roleMap.set(table, new Set());
    return roleMap.get(table);
}

function ensureScopeState(map, role, scopeName) {
    if (!map.has(role)) map.set(role, new Set());
    const roleSet = map.get(role);
    roleSet.add(scopeName);
}

function collectGrantState(sqlFiles) {
    const tablePrivileges = new Map();
    const schemaUsage = new Map();
    const sequenceUsage = new Map();

    const tableRegex = /^(grant|revoke)\s+(.+?)\s+on\s+(?:table\s+)?(?:public\.)?([a-z0-9_]+)\s+to\s+(.+)$/i;
    const schemaRegex = /^(grant|revoke)\s+(.+?)\s+on\s+schema\s+public\s+to\s+(.+)$/i;
    const sequenceRegex = /^(grant|revoke)\s+(.+?)\s+on\s+all\s+sequences\s+in\s+schema\s+public\s+to\s+(.+)$/i;

    for (const filePath of sqlFiles) {
        const statements = splitSqlStatements(fs.readFileSync(filePath, 'utf8'));
        for (const statement of statements) {
            const schemaMatch = statement.match(schemaRegex);
            if (schemaMatch) {
                const [, action, privilegeText, roleText] = schemaMatch;
                const privileges = privilegeText.split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
                const roles = roleText.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
                roles.forEach(role => {
                    privileges.forEach(privilege => {
                        if (action.toLowerCase() === 'grant' && privilege === 'USAGE') {
                            ensureScopeState(schemaUsage, role, 'public');
                        } else if (action.toLowerCase() === 'revoke' && schemaUsage.has(role)) {
                            schemaUsage.get(role).delete('public');
                        }
                    });
                });
                continue;
            }

            const sequenceMatch = statement.match(sequenceRegex);
            if (sequenceMatch) {
                const [, action, privilegeText, roleText] = sequenceMatch;
                const privileges = privilegeText.split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
                const roles = roleText.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
                roles.forEach(role => {
                    privileges.forEach(privilege => {
                        if (action.toLowerCase() === 'grant' && (privilege === 'USAGE' || privilege === 'SELECT')) {
                            ensureScopeState(sequenceUsage, role, privilege);
                        } else if (action.toLowerCase() === 'revoke' && sequenceUsage.has(role)) {
                            sequenceUsage.get(role).delete(privilege);
                        }
                    });
                });
                continue;
            }

            const tableMatch = statement.match(tableRegex);
            if (!tableMatch) continue;

            const [, action, privilegeText, tableNameRaw, roleText] = tableMatch;
            const tableName = tableNameRaw.toLowerCase();
            const privileges = privilegeText.split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
            const roles = roleText.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);

            roles.forEach(role => {
                const privilegeSet = ensureTableState(tablePrivileges, role, tableName);
                privileges.forEach(privilege => {
                    if (action.toLowerCase() === 'grant') privilegeSet.add(privilege);
                    else privilegeSet.delete(privilege);
                });
            });
        }
    }

    return { tablePrivileges, schemaUsage, sequenceUsage };
}

function collectFrontendTables() {
    const tables = new Set();
    const fileOps = new Map();
    const files = sourceRoots.flatMap(walkFiles);
    const fromRegex = /supabase\.from\('([a-z0-9_]+)'\)/g;

    for (const filePath of files) {
        const source = fs.readFileSync(filePath, 'utf8');
        let match;
        while ((match = fromRegex.exec(source)) !== null) {
            const table = String(match[1] || '').toLowerCase();
            tables.add(table);
            if (!fileOps.has(table)) fileOps.set(table, new Set());

            const nearby = source.slice(match.index, match.index + 320);
            ['select', 'insert', 'update', 'upsert', 'delete'].forEach(op => {
                if (new RegExp(`\\.${op}\\s*\\(`, 'i').test(nearby)) {
                    fileOps.get(table).add(op === 'upsert' ? 'INSERT' : op.toUpperCase());
                    if (op === 'upsert') fileOps.get(table).add('UPDATE');
                }
            });
        }
    }

    // Frontend bootstrap requires branding before auth is restored.
    const anonReadableTables = new Set(['app_settings']);

    return {
        tables: Array.from(tables).sort((a, b) => a.localeCompare(b)),
        fileOps,
        anonReadableTables,
    };
}

function hasPrivilege(tablePrivileges, role, table, privilege) {
    return tablePrivileges.get(role)?.get(table)?.has(privilege) || false;
}

function runAudit() {
    const sqlFiles = readSqlFilesInOrder();
    if (sqlFiles.length === 0) {
        throw new Error('No SQL files found (complete-setup.sql/migrations).');
    }

    const { tablePrivileges, schemaUsage, sequenceUsage } = collectGrantState(sqlFiles);
    const { tables, fileOps, anonReadableTables } = collectFrontendTables();
    const failures = [];

    if (!schemaUsage.get('anon')?.has('public')) {
        failures.push('Missing schema usage grant: public -> anon');
    }
    if (!schemaUsage.get('authenticated')?.has('public')) {
        failures.push('Missing schema usage grant: public -> authenticated');
    }

    if (!sequenceUsage.get('authenticated')?.has('USAGE') || !sequenceUsage.get('authenticated')?.has('SELECT')) {
        failures.push('Missing authenticated sequence grant: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated');
    }

    for (const table of tables) {
        const requiredOps = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
        for (const privilege of requiredOps) {
            if (!hasPrivilege(tablePrivileges, 'authenticated', table, privilege)) {
                failures.push(`Missing authenticated ${privilege} grant on public.${table}`);
            }
        }
    }

    for (const table of anonReadableTables) {
        if (!hasPrivilege(tablePrivileges, 'anon', table, 'SELECT')) {
            failures.push(`Missing anon SELECT grant on public.${table}`);
        }
    }

    console.log('=== Bootstrap Grant Audit Summary ===');
    console.log(`sql_files_scanned: ${sqlFiles.length}`);
    console.log(`frontend_tables_seen: ${tables.length}`);
    console.log(`authenticated_tables_granted: ${tablePrivileges.get('authenticated')?.size || 0}`);
    console.log(`anon_tables_granted: ${tablePrivileges.get('anon')?.size || 0}`);
    console.log(`failed_checks: ${failures.length}`);

    console.log('\n=== Frontend Grant Matrix ===');
    console.table(tables.map(table => ({
        table,
        source_ops: Array.from(fileOps.get(table) || []).sort().join(', ') || 'SELECT',
        auth_select: hasPrivilege(tablePrivileges, 'authenticated', table, 'SELECT'),
        auth_insert: hasPrivilege(tablePrivileges, 'authenticated', table, 'INSERT'),
        auth_update: hasPrivilege(tablePrivileges, 'authenticated', table, 'UPDATE'),
        auth_delete: hasPrivilege(tablePrivileges, 'authenticated', table, 'DELETE'),
        anon_select: anonReadableTables.has(table) ? hasPrivilege(tablePrivileges, 'anon', table, 'SELECT') : 'n/a',
    })));

    if (failures.length > 0) {
        console.error('\n=== FAILURES ===');
        failures.forEach(item => console.error(`- ${item}`));
        process.exit(1);
    }

    console.log('\nBootstrap Data API grant audit passed.');
}

runAudit();

import fs from 'node:fs';
import path from 'node:path';
import { getCanonicalSchemaSqlFiles } from '../support/canonical-migration-chain.mjs';

const root = process.cwd();
const migrationDir = path.join(root, 'migrations');
const baseSetup = path.join(root, 'complete-setup.sql');

function readSqlFilesInOrder() {
    return getCanonicalSchemaSqlFiles(root);
}

function normalizeSpace(text = '') {
    return String(text).replace(/\s+/g, ' ').trim();
}

function collectPolicyOps(sql, filePath) {
    const ops = [];

    const patterns = [
        {
            type: 'drop',
            source: 'plain',
            regex: /drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)\s*;/gim,
        },
        {
            type: 'create',
            source: 'plain',
            regex: /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)[\s\S]*?;/gim,
        },
        {
            type: 'drop',
            source: 'execute',
            regex: /execute\s+'drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)'/gim,
        },
        {
            type: 'create',
            source: 'execute',
            regex: /execute\s+'create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)[^']*'/gim,
        },
    ];

    patterns.forEach(({ type, source, regex }) => {
        let match;
        while ((match = regex.exec(sql)) !== null) {
            const policyName = String(match[1] || '').trim();
            const tableName = String(match[2] || '').trim().toLowerCase();
            ops.push({
                index: match.index,
                type,
                source,
                table: tableName,
                policy: policyName,
                statement: normalizeSpace(match[0]),
                file: path.relative(root, filePath),
            });
        }
    });

    return ops.sort((a, b) => a.index - b.index);
}

function buildPolicyState(sqlFiles) {
    const policyMap = new Map();
    const rlsEnabledTables = new Set();

    const rlsPatterns = [
        /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security\s*;/gim,
        /execute\s+'alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security'/gim,
    ];

    for (const filePath of sqlFiles) {
        const sql = fs.readFileSync(filePath, 'utf8');

        rlsPatterns.forEach(regex => {
            let rlsMatch;
            while ((rlsMatch = regex.exec(sql)) !== null) {
                rlsEnabledTables.add(String(rlsMatch[1] || '').toLowerCase());
            }
        });

        const operations = collectPolicyOps(sql, filePath);
        operations.forEach(op => {
            const key = `${op.table}::${op.policy}`;
            if (op.type === 'drop') {
                policyMap.delete(key);
            } else {
                policyMap.set(key, op);
            }
        });
    }

    return {
        policies: Array.from(policyMap.values()).sort((a, b) => `${a.table}:${a.policy}`.localeCompare(`${b.table}:${b.policy}`)),
        rlsEnabledTables,
    };
}

function hasPolicy(policyState, table, policyName) {
    return policyState.some(p => p.table === table && p.policy === policyName);
}

function findPolicy(policyState, table, policyName) {
    return policyState.find(p => p.table === table && p.policy === policyName) || null;
}

function runAudit() {
    const sqlFiles = readSqlFilesInOrder();
    if (sqlFiles.length === 0) {
        throw new Error('No SQL files found (complete-setup.sql/migrations).');
    }

    const { policies, rlsEnabledTables } = buildPolicyState(sqlFiles);
    const failures = [];

    const requiredPolicies = [
        ['app_settings', 'Read settings'],
        ['app_settings', 'Read branding settings (anon)'],
        ['app_settings', 'Superadmin manage settings'],
        ['employees', 'Read employees by scope'],
        ['employees', 'Update employees by scope'],
        ['kpi_definitions', 'Manage KPI definitions by category'],
        ['competency_config', 'Manage competency config by position scope'],
        ['probation_monthly_scores', 'HR manage probation monthly scores'],
        ['probation_attendance_records', 'HR manage probation attendance'],
    ];

    for (const [table, policy] of requiredPolicies) {
        if (!hasPolicy(policies, table, policy)) {
            failures.push(`Missing required policy: ${table} -> "${policy}"`);
        }
    }

    const forbiddenPolicies = [
        ['kpi_definitions', 'Manager manage kpi definitions'],
        ['competency_config', 'Manager manage competency config'],
    ];

    for (const [table, policy] of forbiddenPolicies) {
        if (hasPolicy(policies, table, policy)) {
            failures.push(`Forbidden broad policy still active: ${table} -> "${policy}"`);
        }
    }

    const riskyManagerPolicies = policies.filter(p => /\bfor all\b/i.test(p.statement)
        && /using\s*\(\s*is_manager\s*\(\s*\)\s*\)/i.test(p.statement)
        && !/can_manage_/i.test(p.statement));

    if (riskyManagerPolicies.length > 0) {
        riskyManagerPolicies.forEach(row => {
            failures.push(`Risky manager-wide FOR ALL policy: ${row.table} -> "${row.policy}" (${row.file})`);
        });
    }

    const criticalRlsTables = [
        'app_settings',
        'employees',
        'competency_config',
        'kpi_definitions',
        'kpi_records',
        'kpi_definition_versions',
        'employee_kpi_target_versions',
        'probation_reviews',
        'probation_monthly_scores',
        'probation_attendance_records',
        'pip_plans',
        'pip_actions',
    ];

    criticalRlsTables.forEach(table => {
        if (!rlsEnabledTables.has(table)) {
            failures.push(`RLS not explicitly enabled in SQL assets: ${table}`);
        }
    });

    const summary = {
        sql_files_scanned: sqlFiles.length,
        final_policy_count: policies.length,
        rls_enabled_tables_seen: rlsEnabledTables.size,
        failed_checks: failures.length,
    };

    console.log('=== RLS Policy Audit Summary ===');
    Object.entries(summary).forEach(([k, v]) => console.log(`${k}: ${v}`));

    console.log('\n=== Role Coverage Matrix (key tables) ===');
    const matrixRows = [
        {
            table: 'kpi_definitions',
            manager_scoped: Boolean(findPolicy(policies, 'kpi_definitions', 'Manage KPI definitions by category')),
            hr_present: Boolean(findPolicy(policies, 'kpi_definitions', 'Manage KPI definitions by category')),
            superadmin_present: Boolean(findPolicy(policies, 'kpi_definitions', 'Manage KPI definitions by category')),
        },
        {
            table: 'competency_config',
            manager_scoped: Boolean(findPolicy(policies, 'competency_config', 'Manage competency config by position scope')),
            hr_present: Boolean(findPolicy(policies, 'competency_config', 'Manage competency config by position scope')),
            superadmin_present: Boolean(findPolicy(policies, 'competency_config', 'Manage competency config by position scope')),
        },
        {
            table: 'probation_monthly_scores',
            manager_scoped: Boolean(findPolicy(policies, 'probation_monthly_scores', 'Manage probation monthly scores by scope')),
            hr_present: Boolean(findPolicy(policies, 'probation_monthly_scores', 'HR manage probation monthly scores')),
            superadmin_present: Boolean(findPolicy(policies, 'probation_monthly_scores', 'HR manage probation monthly scores')),
        },
        {
            table: 'probation_attendance_records',
            manager_scoped: Boolean(findPolicy(policies, 'probation_attendance_records', 'Manage probation attendance by scope')),
            hr_present: Boolean(findPolicy(policies, 'probation_attendance_records', 'HR manage probation attendance')),
            superadmin_present: Boolean(findPolicy(policies, 'probation_attendance_records', 'Superadmin manage probation attendance')),
        },
        {
            table: 'app_settings',
            manager_scoped: false,
            hr_present: false,
            superadmin_present: Boolean(findPolicy(policies, 'app_settings', 'Superadmin manage settings')),
        },
    ];
    console.table(matrixRows);

    if (failures.length > 0) {
        console.error('\n=== FAILURES ===');
        failures.forEach(item => console.error(`- ${item}`));
        process.exit(1);
    }

    console.log('\nRLS policy audit passed.');
}

runAudit();

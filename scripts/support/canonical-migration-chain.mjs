import fs from 'node:fs';
import path from 'node:path';

export const CANONICAL_MIGRATION_CHAIN = Object.freeze([
    'migrations/20260307_performance_foundation.sql',
    'migrations/20260308_probation_workflow.sql',
    'migrations/20260308_role_scope_access.sql',
    'migrations/20260308_kpi_governance.sql',
    'migrations/20260309_security_qa_hardening.sql',
    'migrations/20260408_data_api_grants.sql',
    'migrations/20260409_drop_legacy_employee_assessment_columns.sql',
    'migrations/20260409_manpower_planning.sql',
    'migrations/20260409_dashboard_server_views.sql',
]);

function assertFilesExist(repoRoot, relativePaths) {
    const missing = relativePaths
        .map(relPath => ({
            relPath,
            absPath: path.join(repoRoot, relPath),
        }))
        .filter(item => !fs.existsSync(item.absPath))
        .map(item => item.relPath);

    if (missing.length > 0) {
        throw new Error(`Canonical migration chain is missing files: ${missing.join(', ')}`);
    }
}

export function getCanonicalSchemaSqlFiles(repoRoot) {
    const relativePaths = [
        'complete-setup.sql',
        ...CANONICAL_MIGRATION_CHAIN,
    ];
    assertFilesExist(repoRoot, relativePaths);
    return relativePaths.map(relPath => path.join(repoRoot, relPath));
}

export function getCanonicalBootstrapSqlFiles(repoRoot) {
    const relativePaths = [
        'complete-setup.sql',
        ...CANONICAL_MIGRATION_CHAIN,
        'supabase/01_dummy_seed.sql',
    ];
    assertFilesExist(repoRoot, relativePaths);
    return relativePaths.map(relPath => path.join(repoRoot, relPath));
}

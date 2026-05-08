import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { config as loadDotenv } from 'dotenv';

const root = process.cwd();

for (const candidate of ['.env', path.join('supabase', 'functions', '.env')]) {
    const fullPath = path.join(root, candidate);
    if (fs.existsSync(fullPath)) {
        loadDotenv({ path: fullPath, override: false, quiet: true });
    }
}

const args = new Set(process.argv.slice(2));
const live = args.has('--live');

function firstEnv(names) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return '';
}

function requireEnv(names) {
    const value = firstEnv(names);
    if (!value) {
        throw new Error(`Missing required env: ${names.join(' or ')}`);
    }
    return value;
}

const supabaseUrl = requireEnv(['SUPABASE_URL', 'URL']).replace(/\/+$/, '');
const webhookSecret = firstEnv(['APPROVAL_NOTIFICATION_WEBHOOK_SECRET']);
const accessToken = firstEnv(['APPROVAL_NOTIFICATION_ACCESS_TOKEN', 'SUPABASE_ACCESS_TOKEN']);

if (!webhookSecret && !accessToken) {
    throw new Error('Set APPROVAL_NOTIFICATION_WEBHOOK_SECRET or APPROVAL_NOTIFICATION_ACCESS_TOKEN.');
}

const cases = [
    {
        label: 'KPI definition version',
        action: 'kpi_definition_versions',
        payloadKey: 'version_id',
        id: firstEnv(['KPI_DEFINITION_VERSION_ID', 'APPROVAL_NOTIFICATION_KPI_DEFINITION_VERSION_ID']),
    },
    {
        label: 'KPI target version',
        action: 'employee_kpi_target_versions',
        payloadKey: 'version_id',
        id: firstEnv(['KPI_TARGET_VERSION_ID', 'APPROVAL_NOTIFICATION_KPI_TARGET_VERSION_ID']),
    },
    {
        label: 'Probation review',
        action: 'probation_reviews',
        payloadKey: 'review_id',
        id: firstEnv(['PROBATION_REVIEW_ID', 'APPROVAL_NOTIFICATION_PROBATION_REVIEW_ID']),
    },
    {
        label: 'PIP plan',
        action: 'pip_plans',
        payloadKey: 'pip_plan_id',
        id: firstEnv(['PIP_PLAN_ID', 'APPROVAL_NOTIFICATION_PIP_PLAN_ID']),
    },
].filter(item => item.id);

if (cases.length === 0) {
    throw new Error([
        'No notification fixture IDs configured.',
        'Set one or more of KPI_DEFINITION_VERSION_ID, KPI_TARGET_VERSION_ID, PROBATION_REVIEW_ID, PIP_PLAN_ID.',
    ].join(' '));
}

async function runCase(item) {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (webhookSecret) {
        headers['x-webhook-secret'] = webhookSecret;
    } else {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/approval-notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            action: item.action,
            [item.payloadKey]: item.id,
            dry_run: !live,
        }),
    });

    const bodyText = await response.text();
    let body = null;
    try {
        body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
        body = { ok: false, error: { message: bodyText } };
    }

    if (!response.ok || body?.ok === false) {
        const message = body?.error?.message || response.statusText;
        throw new Error(`${item.label}: ${message}`);
    }

    return {
        label: item.label,
        id: item.id,
        delivered: Boolean(body?.data?.delivered),
        dry_run: Boolean(body?.data?.dry_run),
        provider: body?.data?.provider || 'unknown',
        recipients: body?.data?.recipients?.length || 0,
    };
}

console.log('=== Approval Notifications Smoke ===');
console.log(`mode: ${live ? 'live delivery' : 'dry run'}`);
console.log(`cases: ${cases.length}`);

const failures = [];
for (const item of cases) {
    try {
        const result = await runCase(item);
        console.log(`ok: ${result.label} (${result.id}) provider=${result.provider} delivered=${result.delivered} dry_run=${result.dry_run} recipients=${result.recipients}`);
    } catch (error) {
        failures.push(error.message);
        console.error(`fail: ${error.message}`);
    }
}

if (failures.length > 0) {
    console.error(`failed_checks: ${failures.length}`);
    process.exit(1);
}

console.log('failed_checks: 0');
console.log('Approval notification smoke checks passed.');

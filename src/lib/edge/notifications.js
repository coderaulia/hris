import { invokeEdgeFunction } from './core.js';

export async function requestKpiDefinitionNotification(versionId, options = {}) {
    const id = String(versionId || '').trim();
    if (!id) return null;

    return invokeEdgeFunction('approval-notifications', {
        action: 'kpi_definition_versions',
        version_id: id,
        dry_run: Boolean(options.dryRun),
    });
}

export async function requestKpiTargetNotification(versionId, options = {}) {
    const id = String(versionId || '').trim();
    if (!id) return null;

    return invokeEdgeFunction('approval-notifications', {
        action: 'employee_kpi_target_versions',
        version_id: id,
        dry_run: Boolean(options.dryRun),
    });
}

export async function requestProbationNotification(reviewId, options = {}) {
    const id = String(reviewId || '').trim();
    if (!id) return null;

    return invokeEdgeFunction('approval-notifications', {
        action: 'probation_reviews',
        review_id: id,
        dry_run: Boolean(options.dryRun),
    });
}

export async function requestPipNotification(pipPlanId, options = {}) {
    const id = String(pipPlanId || '').trim();
    if (!id) return null;

    return invokeEdgeFunction('approval-notifications', {
        action: 'pip_plans',
        pip_plan_id: id,
        dry_run: Boolean(options.dryRun),
    });
}

export async function requestSignatureNotification(requestId, options = {}) {
    const id = String(requestId || '').trim();
    if (!id) return null;

    return invokeEdgeFunction('approval-notifications', {
        action: 'document_signature_requests',
        signature_request_id: id,
        dry_run: Boolean(options.dryRun),
    });
}


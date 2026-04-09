function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeAssessmentSnapshot(source = {}, fallbacks = {}) {
    return {
        percentage: toNumber(source.percentage ?? fallbacks.percentage, 0),
        scores: asArray(source.scores ?? fallbacks.scores),
        updatedAt: source.updatedAt ?? fallbacks.updatedAt ?? '',
        updatedBy: source.updatedBy ?? fallbacks.updatedBy ?? '',
        sourceDate: source.sourceDate ?? fallbacks.sourceDate ?? '',
    };
}

export function hydrateEmployeeRecord(rec = {}) {
    const assessment = rec.assessment || {};
    const manager = normalizeAssessmentSnapshot(assessment.manager, {
        percentage: rec.percentage,
        scores: rec.scores,
        updatedAt: rec.assessment_updated_at,
        updatedBy: rec.assessment_updated_by,
        sourceDate: rec.date_updated || rec.date_created,
    });
    const self = normalizeAssessmentSnapshot(assessment.self, {
        percentage: rec.self_percentage,
        scores: rec.self_scores,
        updatedAt: rec.self_assessment_updated_at,
        updatedBy: rec.self_assessment_updated_by,
        sourceDate: rec.self_date,
    });
    const history = asArray(assessment.history ?? rec.history);
    const trainingRecords = asArray(rec.trainingRecords ?? rec.training_history);

    rec.assessment = { manager, self, history };
    rec.trainingRecords = trainingRecords;

    // Temporary compatibility mirrors for legacy modules.
    rec.percentage = manager.percentage;
    rec.scores = manager.scores;
    rec.assessment_updated_at = manager.updatedAt;
    rec.assessment_updated_by = manager.updatedBy;
    rec.date_updated = manager.sourceDate || rec.date_updated || '-';
    rec.self_percentage = self.percentage;
    rec.self_scores = self.scores;
    rec.self_assessment_updated_at = self.updatedAt;
    rec.self_assessment_updated_by = self.updatedBy;
    rec.self_date = self.sourceDate || rec.self_date || '';
    rec.history = history;
    rec.training_history = trainingRecords;

    return rec;
}

export function getManagerAssessment(rec = {}) {
    return hydrateEmployeeRecord(rec).assessment.manager;
}

export function getSelfAssessment(rec = {}) {
    return hydrateEmployeeRecord(rec).assessment.self;
}

export function getAssessmentHistory(rec = {}) {
    return hydrateEmployeeRecord(rec).assessment.history;
}

export function getTrainingRecords(rec = {}) {
    return hydrateEmployeeRecord(rec).trainingRecords;
}

export function setManagerAssessment(rec = {}, updates = {}) {
    const hydrated = hydrateEmployeeRecord(rec);
    hydrated.assessment.manager = normalizeAssessmentSnapshot({
        ...hydrated.assessment.manager,
        ...updates,
    });
    return hydrateEmployeeRecord(hydrated);
}

export function setSelfAssessment(rec = {}, updates = {}) {
    const hydrated = hydrateEmployeeRecord(rec);
    hydrated.assessment.self = normalizeAssessmentSnapshot({
        ...hydrated.assessment.self,
        ...updates,
    });
    return hydrateEmployeeRecord(hydrated);
}

export function setAssessmentHistory(rec = {}, history = []) {
    const hydrated = hydrateEmployeeRecord(rec);
    hydrated.assessment.history = asArray(history);
    return hydrateEmployeeRecord(hydrated);
}

export function setTrainingRecords(rec = {}, rows = []) {
    const hydrated = hydrateEmployeeRecord(rec);
    hydrated.trainingRecords = asArray(rows);
    return hydrateEmployeeRecord(hydrated);
}

import { state } from '../../lib/store.js';
import { getKpiDefinitionForPeriod, getKpiRecordTarget } from '../data/targets.js';

function normalizeEmployeeId(value) {
    return String(value ?? '').trim();
}

function getKpiRecordMeta(record) {
    const def = getKpiDefinitionForPeriod(record?.kpi_id, record?.period)
        || state.kpiConfig.find(k => k.id === record?.kpi_id);

    return {
        name: record?.kpi_name_snapshot || def?.name || record?.kpi_id || '-',
        unit: record?.kpi_unit_snapshot || def?.unit || '',
        category: record?.kpi_category_snapshot || def?.category || 'General',
        target: getKpiRecordTarget(record, state.db[record?.employee_id]),
    };
}

export {
    getKpiRecordMeta,
    normalizeEmployeeId,
};

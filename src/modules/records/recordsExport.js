// ==================================================
// RECORDS EXPORT — Client-side Excel export for Assessment & KPI records
// ==================================================

import { state, isAdmin } from '../../lib/store.js';
import { getManagerAssessment, getSelfAssessment } from '../../lib/employee-records.js';
import { toPeriodKey, formatPeriod } from '../../lib/utils.js';
import { getFilteredEmployeeIds } from '../../lib/reportFilters.js';
import * as notify from '../../lib/notify.js';

export async function exportAssessmentRecordsExcel() {
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    const { exportToExcel } = await import('../../lib/exportUtils.js');

    const { db } = state;
    const scopedSet = new Set(getFilteredEmployeeIds());
    const keys = Object.keys(db).filter(id => scopedSet.has(id));

    const periodFilter = state.reportFilters?.period || '';

    const rows = [];
    keys.forEach(id => {
        const rec = db[id];
        if (!rec) return;
        const managerAssessment = getManagerAssessment(rec);
        const selfAssessment = getSelfAssessment(rec);

        const period = toPeriodKey(managerAssessment.updatedAt || managerAssessment.sourceDate || rec.date_created);
        if (periodFilter && period !== periodFilter) return;

        rows.push({
            employee_id: id,
            name: rec.name || '-',
            position: rec.position || '-',
            department: rec.department || '-',
            seniority: rec.seniority || '-',
            period: formatPeriod(period) || '-',
            manager_score: managerAssessment.percentage || 0,
            self_score: selfAssessment.percentage || 0,
            assessed_date: managerAssessment.updatedAt || rec.date_updated || '-',
        });
    });

    if (rows.length === 0) {
        await notify.warn('No assessment records to export.');
        return;
    }

    try {
        await exportToExcel(rows, `assessment-records-${new Date().toISOString().slice(0, 10)}`, {
            sheetName: 'Assessment Records',
            columns: [
                { header: 'Employee ID', key: 'employee_id', width: 15 },
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Position', key: 'position', width: 22 },
                { header: 'Department', key: 'department', width: 18 },
                { header: 'Seniority', key: 'seniority', width: 14 },
                { header: 'Period', key: 'period', width: 14 },
                { header: 'Manager Score (%)', key: 'manager_score', width: 18 },
                { header: 'Self Score (%)', key: 'self_score', width: 15 },
                { header: 'Assessed Date', key: 'assessed_date', width: 18 },
            ],
        });
        await notify.success('Assessment records exported.');
    } catch (err) {
        await notify.error('Export failed: ' + err.message);
    }
}

export async function exportKpiRecordsExcel() {
    if (!isAdmin()) { await notify.error('Access Denied'); return; }
    const { exportToExcel } = await import('../../lib/exportUtils.js');

    const records = state.kpiRecords || [];
    const empFilter = document.getElementById('kpi-records-filter-emp')?.value || '';
    const periodFilter = document.getElementById('kpi-records-filter-period')?.value || '';

    let filtered = records;
    if (empFilter) filtered = filtered.filter(r => r.employee_id === empFilter);
    if (periodFilter) filtered = filtered.filter(r => r.period === periodFilter);

    if (filtered.length === 0) {
        await notify.warn('No KPI records to export.');
        return;
    }

    const rows = filtered.map(r => ({
        employee_id: r.employee_id || '-',
        employee_name: state.db[r.employee_id]?.name || r.employee_id || '-',
        kpi_name: r.kpi_name || r.definition_name || '-',
        period: r.period || '-',
        value: r.value ?? '-',
        target: r.target ?? '-',
        achievement_pct: r.target ? Math.round((r.value / r.target) * 100) : '-',
        updated_at: r.updated_at || r.created_at || '-',
    }));

    try {
        await exportToExcel(rows, `kpi-records-${new Date().toISOString().slice(0, 10)}`, {
            sheetName: 'KPI Records',
            columns: [
                { header: 'Employee ID', key: 'employee_id', width: 15 },
                { header: 'Employee Name', key: 'employee_name', width: 25 },
                { header: 'KPI Name', key: 'kpi_name', width: 28 },
                { header: 'Period', key: 'period', width: 12 },
                { header: 'Value', key: 'value', width: 12 },
                { header: 'Target', key: 'target', width: 12 },
                { header: 'Achievement (%)', key: 'achievement_pct', width: 16 },
                { header: 'Updated', key: 'updated_at', width: 18 },
            ],
        });
        await notify.success('KPI records exported.');
    } catch (err) {
        await notify.error('Export failed: ' + err.message);
    }
}

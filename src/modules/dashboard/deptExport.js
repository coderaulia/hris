import {
    downloadEdgeExportFile,
    requestDepartmentKpiExport,
    requestEmployeeKpiExport,
} from '../../lib/edge/exports.js';
import * as notify from '../../lib/notify.js';
import { getDeptKpiContext } from './deptContext.js';

export async function exportDeptKpiExcel() {
    const { name, month } = getDeptKpiContext();
    if (!name) {
        await notify.warn('Open a department KPI modal first.');
        return;
    }

    try {
        const result = await requestDepartmentKpiExport({
            department: name,
            period: month,
            action: 'department_kpi_excel',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Department KPI Excel exported.');
    } catch (error) {
        await notify.error(`Failed to export department KPI Excel: ${error.message}`);
    }
}

export async function exportDeptKpiPDF() {
    const { name, month } = getDeptKpiContext();
    if (!name) {
        await notify.warn('Open a department KPI modal first.');
        return;
    }

    try {
        const result = await requestDepartmentKpiExport({
            department: name,
            period: month,
            action: 'department_kpi_pdf',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Department KPI PDF exported.');
    } catch (error) {
        await notify.error(`Failed to export department KPI PDF: ${error.message}`);
    }
}

export async function exportEmployeeKpiPDF(employeeId) {
    const { month } = getDeptKpiContext();

    try {
        const result = await requestEmployeeKpiExport({
            employeeId,
            period: month,
            action: 'employee_kpi_pdf',
        });
        await downloadEdgeExportFile({
            signedUrl: result?.signed_url,
            filename: result?.filename,
        });
        await notify.success('Employee KPI PDF exported.');
    } catch (error) {
        await notify.error(`Failed to export employee KPI PDF: ${error.message}`);
    }
}

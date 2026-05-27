// ==================================================
// SHARED EXPORT UTILITY — Client-side Excel export via exceljs
// ==================================================

import ExcelJS from 'exceljs';

/**
 * Export data to an Excel file and trigger browser download.
 *
 * @param {Object[]} rows - Array of flat objects (each key becomes a column)
 * @param {string} filename - Download filename (without extension)
 * @param {Object} [options]
 * @param {string} [options.sheetName] - Worksheet name (default: 'Data')
 * @param {Object[]} [options.columns] - Column definitions [{header, key, width}]
 *   If omitted, columns are auto-generated from the first row's keys.
 */
export async function exportToExcel(rows, filename, options = {}) {
    if (!rows || rows.length === 0) {
        throw new Error('No data to export.');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRIS App';
    workbook.created = new Date();

    const sheetName = options.sheetName || 'Data';
    const worksheet = workbook.addWorksheet(sheetName);

    // Determine columns
    if (options.columns && options.columns.length > 0) {
        worksheet.columns = options.columns.map(col => ({
            header: col.header || col.key,
            key: col.key,
            width: col.width || 20,
        }));
    } else {
        const keys = Object.keys(rows[0]);
        worksheet.columns = keys.map(key => ({
            header: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            key,
            width: Math.max(15, key.length + 5),
        }));
    }

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FE' },
    };

    // Add data rows
    rows.forEach(row => worksheet.addRow(row));

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * Export data to CSV and trigger browser download.
 *
 * @param {Object[]} rows - Array of flat objects
 * @param {string} filename - Download filename (without extension)
 */
export function exportToCSV(rows, filename) {
    if (!rows || rows.length === 0) {
        throw new Error('No data to export.');
    }

    const keys = Object.keys(rows[0]);
    const header = keys.map(k => `"${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}"`).join(',');
    const lines = rows.map(row =>
        keys.map(k => {
            const val = row[k] ?? '';
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

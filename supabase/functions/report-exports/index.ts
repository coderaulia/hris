import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import ExcelJS from "npm:exceljs";
import { jsPDF } from "npm:jspdf";
import { createServiceClient, requireActor } from "../_shared/auth.ts";
import { corsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { getOptionalEnv } from "../_shared/env.ts";

type Payload = {
  action?: string;
  department?: string;
  period?: string;
  employee_id?: string;
  review_id?: string;
};

type ExportContext = {
  mode: string;
  admin: ReturnType<typeof createServiceClient>;
  actor: { employee_id: string; role: string; name?: string };
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({ "Content-Type": "application/json" }),
  });
}

function normalizePeriod(period?: string): string {
  const value = String(period || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 7);
}

function slugify(value: string, fallback = "export"): string {
  const slug = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function safeNumber(value: unknown): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function canExportRole(role: string) {
  return ["superadmin", "hr", "manager", "director"].includes(String(role || "").toLowerCase());
}

async function authorizeExport(req: Request): Promise<ExportContext> {
  const webhookSecret = getOptionalEnv("REPORT_EXPORT_WEBHOOK_SECRET");
  const incomingSecret = req.headers.get("x-webhook-secret") || "";

  if (webhookSecret && incomingSecret && incomingSecret === webhookSecret) {
    return {
      mode: "webhook",
      admin: createServiceClient(),
      actor: { employee_id: "system", role: "system", name: "System Webhook" },
    };
  }

  const { admin, actor } = await requireActor(req);
  if (!canExportRole(actor.role)) {
    throw new Error("Access denied.");
  }

  return { mode: "authenticated", admin, actor };
}

async function fetchEmployees(admin: ReturnType<typeof createServiceClient>) {
  const { data, error } = await admin
    .from("employees")
    .select("employee_id, name, position, department, manager_id, role");

  if (error) throw new Error(`Failed to fetch employees: ${error.message}`);
  return data || [];
}

async function fetchKpiRecords(admin: ReturnType<typeof createServiceClient>, period: string) {
  const { data, error } = await admin
    .from("kpi_records")
    .select("id, employee_id, kpi_id, period, value, notes, target_snapshot, kpi_name_snapshot, kpi_unit_snapshot, kpi_category_snapshot")
    .eq("period", period);

  if (error) throw new Error(`Failed to fetch KPI records: ${error.message}`);
  return data || [];
}

async function fetchProbationReview(admin: ReturnType<typeof createServiceClient>, reviewId: string) {
  const { data, error } = await admin
    .from("probation_reviews")
    .select("id, employee_id, review_period_start, review_period_end, quantitative_score, qualitative_score, final_score, decision, manager_notes, reviewed_by, reviewed_at")
    .eq("id", reviewId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch probation review: ${error.message}`);
  if (!data) throw new Error("Probation review not found.");
  return data;
}

async function fetchProbationMonthlyScores(admin: ReturnType<typeof createServiceClient>, reviewId: string) {
  const { data, error } = await admin
    .from("probation_monthly_scores")
    .select("month_no, period_start, period_end, work_performance_score, managing_task_score, manager_qualitative_text, manager_note, attendance_deduction, attitude_score, monthly_total")
    .eq("probation_review_id", reviewId)
    .order("month_no");

  if (error) throw new Error(`Failed to fetch probation monthly scores: ${error.message}`);
  return data || [];
}

async function fetchProbationAttendance(admin: ReturnType<typeof createServiceClient>, reviewId: string) {
  const { data } = await admin
    .from("probation_attendance_records")
    .select("month_no, event_date, event_type, qty, deduction_points, note")
    .eq("probation_review_id", reviewId)
    .order("month_no")
    .order("event_date");

  return data || [];
}

function buildDepartmentRows({
  employees,
  records,
  department,
}: {
  employees: Array<Record<string, unknown>>;
  records: Array<Record<string, unknown>>;
  department: string;
}) {
  const byEmployee = new Map(
    employees.map((employee) => [String(employee.employee_id), employee]),
  );

  return records
    .filter((record) => {
      const employee = byEmployee.get(String(record.employee_id));
      return employee && String(employee.department || "") === department;
    })
    .map((record) => {
      const employee = byEmployee.get(String(record.employee_id));
      const target = safeNumber(record.target_snapshot);
      const actual = safeNumber(record.value);
      const achievement = target > 0 ? Math.round((actual / target) * 100) : 0;
      return {
        employee_id: String(record.employee_id || ""),
        employee_name: String(employee?.name || record.employee_id || "-"),
        position: String(employee?.position || "-"),
        kpi_name: String(record.kpi_name_snapshot || record.kpi_id || "-"),
        unit: String(record.kpi_unit_snapshot || ""),
        category: String(record.kpi_category_snapshot || "General"),
        target,
        actual,
        achievement,
        status: achievement >= 100 ? "On Track" : achievement >= 75 ? "Delayed" : "At Risk",
        note: String(record.notes || ""),
      };
    });
}

function buildEmployeeRows({
  rows,
  employeeId,
}: {
  rows: Array<Record<string, unknown>>;
  employeeId: string;
}) {
  return rows.filter((row) => String(row.employee_id) === employeeId);
}

function formatDateForFilename() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function splitLongText(doc: jsPDF, text: string, maxWidth = 260): string[] {
  return doc.splitTextToSize(String(text || ""), maxWidth);
}

async function generateDepartmentExcel(rows: Array<Record<string, unknown>>, department: string, period: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(department.substring(0, 31) || "Department");

  const avgAchievement = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + safeNumber(row.achievement), 0) / rows.length)
    : 0;
  const employeeCount = new Set(rows.map((row) => String(row.employee_id))).size;

  sheet.addRow([`KPI Department Report`]);
  sheet.addRow([`Department: ${department}`]);
  sheet.addRow([`Period: ${period}`]);
  sheet.addRow([`Generated: ${new Date().toLocaleString("en-GB")}`]);
  sheet.addRow([]);
  sheet.addRow(["Summary", "Value"]);
  sheet.addRow(["Total Employees", employeeCount]);
  sheet.addRow(["Total KPI Records", rows.length]);
  sheet.addRow(["Average Achievement", `${avgAchievement}%`]);
  sheet.addRow([]);
  sheet.addRow(["No", "Employee", "Position", "KPI Metric", "Unit", "Target", "Actual", "Achievement (%)", "Status"]);

  rows.forEach((row, index) => {
    sheet.addRow([
      index + 1,
      row.employee_name,
      row.position,
      row.kpi_name,
      row.unit || "-",
      safeNumber(row.target),
      safeNumber(row.actual),
      safeNumber(row.achievement),
      row.status,
    ]);
  });

  sheet.columns = [
    { width: 6 }, { width: 26 }, { width: 22 }, { width: 28 }, { width: 10 },
    { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

async function generateProbationExcel(payload: {
  employee: Record<string, unknown>;
  review: Record<string, unknown>;
  monthlyScores: Array<Record<string, unknown>>;
}) {
  const workbook = new ExcelJS.Workbook();
  const monthly = workbook.addWorksheet("Monthly");
  const recap = workbook.addWorksheet("Recap");
  const employeeName = String(payload.employee.name || payload.review.employee_id || "Employee");

  monthly.addRow(["Probation Assessment"]);
  monthly.addRow(["Employee", employeeName, "", "Position", String(payload.employee.position || "-")]);
  monthly.addRow(["Period", `${payload.review.review_period_start || "-"} to ${payload.review.review_period_end || "-"}`]);
  monthly.addRow([]);
  monthly.addRow(["Month", "Window", "Work", "Managing", "Attitude", "Deduction", "Total", "Qualitative"]);
  payload.monthlyScores.forEach((row) => {
    monthly.addRow([
      `Month ${row.month_no}`,
      `${row.period_start || "-"} to ${row.period_end || "-"}`,
      safeNumber(row.work_performance_score),
      safeNumber(row.managing_task_score),
      safeNumber(row.attitude_score),
      safeNumber(row.attendance_deduction),
      safeNumber(row.monthly_total),
      String(row.manager_qualitative_text || row.manager_note || ""),
    ]);
  });

  recap.addRow(["Probation Recap"]);
  recap.addRow(["Employee", employeeName]);
  recap.addRow(["Decision", String(payload.review.decision || "pending")]);
  recap.addRow(["Final Score", safeNumber(payload.review.final_score)]);
  recap.addRow(["Quantitative Score", safeNumber(payload.review.quantitative_score)]);
  recap.addRow(["Qualitative Score", safeNumber(payload.review.qualitative_score)]);
  recap.addRow(["Summary", String(payload.review.manager_notes || "-")]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function generateDepartmentPdf(rows: Array<Record<string, unknown>>, department: string, period: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 14;
  doc.setFontSize(14);
  doc.text("KPI Department Report", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.text(`Department: ${department} | Period: ${period}`, 14, y);
  y += 8;

  rows.forEach((row, index) => {
    const line = `${index + 1}. ${row.employee_name} | ${row.position} | ${row.kpi_name} | Target ${row.target} ${row.unit || ""} | Actual ${row.actual} ${row.unit || ""} | ${row.achievement}% | ${row.status}`;
    const lines = splitLongText(doc, line, 270);
    lines.forEach((text) => {
      if (y > 200) {
        doc.addPage();
        y = 14;
      }
      doc.text(text, 14, y);
      y += 5;
    });
  });

  return new Uint8Array(doc.output("arraybuffer"));
}

function generateEmployeePdf(rows: Array<Record<string, unknown>>, employeeId: string, period: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const first = rows[0];
  let y = 14;
  doc.setFontSize(14);
  doc.text("Employee KPI Report", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.text(`Employee: ${first?.employee_name || employeeId} | Position: ${first?.position || "-"} | Period: ${period}`, 14, y);
  y += 8;

  rows.forEach((row, index) => {
    const line = `${index + 1}. ${row.kpi_name} | Target ${row.target} ${row.unit || ""} | Actual ${row.actual} ${row.unit || ""} | ${row.achievement}% | ${row.status}`;
    const lines = splitLongText(doc, line, 270);
    lines.forEach((text) => {
      if (y > 200) {
        doc.addPage();
        y = 14;
      }
      doc.text(text, 14, y);
      y += 5;
    });
  });

  return new Uint8Array(doc.output("arraybuffer"));
}

function generateProbationPdf(payload: {
  employee: Record<string, unknown>;
  review: Record<string, unknown>;
  monthlyScores: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 14;
  doc.setFontSize(14);
  doc.text("Probation Assessment Report", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.text(`Employee: ${payload.employee.name || payload.review.employee_id}`, 14, y);
  y += 5;
  doc.text(`Position: ${payload.employee.position || "-"}`, 14, y);
  y += 5;
  doc.text(`Window: ${payload.review.review_period_start || "-"} to ${payload.review.review_period_end || "-"}`, 14, y);
  y += 5;
  doc.text(`Decision: ${payload.review.decision || "pending"} | Final Score: ${safeNumber(payload.review.final_score)}`, 14, y);
  y += 8;

  payload.monthlyScores.forEach((row) => {
    const block = [
      `Month ${row.month_no}: ${row.period_start || "-"} to ${row.period_end || "-"}`,
      `Work ${safeNumber(row.work_performance_score)} | Managing ${safeNumber(row.managing_task_score)} | Attitude ${safeNumber(row.attitude_score)} | Deduction ${safeNumber(row.attendance_deduction)} | Total ${safeNumber(row.monthly_total)}`,
      `Qualitative: ${String(row.manager_qualitative_text || row.manager_note || "-")}`,
    ];
    block.forEach((line) => {
      const lines = splitLongText(doc, line, 180);
      lines.forEach((text) => {
        if (y > 275) {
          doc.addPage();
          y = 14;
        }
        doc.text(text, 14, y);
        y += 5;
      });
    });
    y += 2;
  });

  if (payload.attendance.length > 0) {
    if (y > 250) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(11);
    doc.text("Attendance", 14, y);
    y += 6;
    doc.setFontSize(9);
    payload.attendance.forEach((row) => {
      const line = `Month ${row.month_no} | ${row.event_date || "-"} | ${row.event_type || "-"} x${safeNumber(row.qty)} | Deduction ${safeNumber(row.deduction_points)} | ${String(row.note || "")}`;
      const lines = splitLongText(doc, line, 180);
      lines.forEach((text) => {
        if (y > 275) {
          doc.addPage();
          y = 14;
        }
        doc.text(text, 14, y);
        y += 5;
      });
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

async function ensureExportBucket(admin: ReturnType<typeof createServiceClient>) {
  const bucket = getOptionalEnv("REPORT_EXPORT_BUCKET", "report-exports");
  const { data } = await admin.storage.getBucket(bucket);
  if (!data) {
    await admin.storage.createBucket(bucket, { public: false });
  }
  return bucket;
}

async function uploadAndSign({
  admin,
  bytes,
  contentType,
  filename,
}: {
  admin: ReturnType<typeof createServiceClient>;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}) {
  const bucket = await ensureExportBucket(admin);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}_${filename}`;
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload export: ${uploadError.message}`);
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, 300);

  if (signedError || !signed?.signedUrl) {
    throw new Error(`Failed to sign export URL: ${signedError?.message || "Unknown error"}`);
  }

  return {
    bucket,
    path,
    signed_url: signed.signedUrl,
  };
}

async function buildDepartmentExport(admin: ReturnType<typeof createServiceClient>, payload: Payload) {
  const department = String(payload.department || "").trim();
  if (!department) throw new Error("department is required.");
  const period = normalizePeriod(payload.period);
  const [employees, records] = await Promise.all([fetchEmployees(admin), fetchKpiRecords(admin, period)]);
  const rows = buildDepartmentRows({ employees, records, department });
  return { rows, department, period };
}

async function buildEmployeeExport(admin: ReturnType<typeof createServiceClient>, payload: Payload) {
  const employeeId = String(payload.employee_id || "").trim();
  if (!employeeId) throw new Error("employee_id is required.");
  const period = normalizePeriod(payload.period);
  const [employees, records] = await Promise.all([fetchEmployees(admin), fetchKpiRecords(admin, period)]);
  const rows = buildEmployeeRows({
    rows: buildDepartmentRows({
      employees,
      records,
      department: String(employees.find((row) => String(row.employee_id) === employeeId)?.department || ""),
    }),
    employeeId,
  });
  if (rows.length === 0) throw new Error("No KPI records found for this employee.");
  return { rows, employeeId, period };
}

async function buildProbationExport(admin: ReturnType<typeof createServiceClient>, payload: Payload) {
  const reviewId = String(payload.review_id || "").trim();
  if (!reviewId) throw new Error("review_id is required.");
  const review = await fetchProbationReview(admin, reviewId);
  const [employees, monthlyScores, attendance] = await Promise.all([
    fetchEmployees(admin),
    fetchProbationMonthlyScores(admin, reviewId),
    fetchProbationAttendance(admin, reviewId),
  ]);
  const employee = employees.find((row) => String(row.employee_id) === String(review.employee_id)) || { employee_id: review.employee_id, name: review.employee_id, position: "-", department: "-" };
  return { employee, review, monthlyScores, attendance };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST for report exports." },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, {
      ok: false,
      error: { code: "invalid_json", message: "Request body must be valid JSON." },
    });
  }

  try {
    const context = await authorizeExport(req);
    let bytes: Uint8Array;
    let contentType = "application/octet-stream";
    let filename = "export.bin";

    switch (String(payload.action || "").trim()) {
      case "department_kpi_excel": {
        const exportData = await buildDepartmentExport(context.admin, payload);
        bytes = await generateDepartmentExcel(exportData.rows, exportData.department, exportData.period);
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = `KPI_Report_${slugify(exportData.department)}_${formatDateForFilename()}.xlsx`;
        break;
      }
      case "department_kpi_pdf": {
        const exportData = await buildDepartmentExport(context.admin, payload);
        bytes = generateDepartmentPdf(exportData.rows, exportData.department, exportData.period);
        contentType = "application/pdf";
        filename = `KPI_Report_${slugify(exportData.department)}_${formatDateForFilename()}.pdf`;
        break;
      }
      case "employee_kpi_pdf": {
        const exportData = await buildEmployeeExport(context.admin, payload);
        bytes = generateEmployeePdf(exportData.rows, exportData.employeeId, exportData.period);
        contentType = "application/pdf";
        filename = `KPI_Employee_${slugify(String(exportData.rows[0]?.employee_name || exportData.employeeId))}_${formatDateForFilename()}.pdf`;
        break;
      }
      case "probation_excel": {
        const exportData = await buildProbationExport(context.admin, payload);
        bytes = await generateProbationExcel(exportData);
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = `probation_${slugify(String(exportData.employee.name || exportData.review.employee_id))}_${formatDateForFilename()}.xlsx`;
        break;
      }
      case "probation_pdf": {
        const exportData = await buildProbationExport(context.admin, payload);
        bytes = generateProbationPdf(exportData);
        contentType = "application/pdf";
        filename = `probation_report_${slugify(String(exportData.employee.name || exportData.review.employee_id))}_${formatDateForFilename()}.pdf`;
        break;
      }
      default:
        return jsonResponse(400, {
          ok: false,
          error: { code: "unknown_action", message: "Unsupported report export action." },
        });
    }

    const signed = await uploadAndSign({
      admin: context.admin,
      bytes,
      contentType,
      filename,
    });

    return jsonResponse(200, {
      ok: true,
      data: {
        action: payload.action,
        filename,
        content_type: contentType,
        signed_url: signed.signed_url,
        bucket: signed.bucket,
        path: signed.path,
        expires_in_seconds: 300,
      },
    });
  } catch (error) {
    return jsonResponse(/access denied/i.test(String(error)) ? 403 : 500, {
      ok: false,
      error: {
        code: /access denied/i.test(String(error)) ? "forbidden" : "internal_error",
        message: error instanceof Error ? error.message : "Unexpected export failure.",
      },
    });
  }
});

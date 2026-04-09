import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as XLSX from "npm:xlsx";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib";
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
  dataClient: ReturnType<typeof createServiceClient>;
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
    const admin = createServiceClient();
    return {
      mode: "webhook",
      admin,
      dataClient: admin,
      actor: { employee_id: "system", role: "system", name: "System Webhook" },
    };
  }

  const { admin, actorClient, actor } = await requireActor(req);
  if (!canExportRole(actor.role)) {
    throw new Error("Access denied.");
  }

  return { mode: "authenticated", admin, dataClient: actorClient, actor };
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
  const { data, error } = await admin
    .from("probation_attendance_records")
    .select("month_no, event_date, event_type, qty, deduction_points, note")
    .eq("probation_review_id", reviewId)
    .order("month_no")
    .order("event_date");

  if (error) throw new Error(`Failed to fetch probation attendance: ${error.message}`);
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

function wrapText(text: string, maxChars = 110): string[] {
  const source = String(text || "").trim();
  if (!source) return [""];

  const words = source.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [source];
}

async function generateDepartmentExcel(rows: Array<Record<string, unknown>>, department: string, period: string) {
  const avgAchievement = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + safeNumber(row.achievement), 0) / rows.length)
    : 0;
  const employeeCount = new Set(rows.map((row) => String(row.employee_id))).size;
  const worksheetData = [
    ["KPI Department Report"],
    [`Department: ${department}`],
    [`Period: ${period}`],
    [`Generated: ${new Date().toISOString()}`],
    [],
    ["Summary", "Value"],
    ["Total Employees", employeeCount],
    ["Total KPI Records", rows.length],
    ["Average Achievement", `${avgAchievement}%`],
    [],
    ["No", "Employee", "Position", "KPI Metric", "Unit", "Target", "Actual", "Achievement (%)", "Status"],
    ...rows.map((row, index) => ([
      index + 1,
      row.employee_name,
      row.position,
      row.kpi_name,
      row.unit || "-",
      safeNumber(row.target),
      safeNumber(row.actual),
      safeNumber(row.achievement),
      row.status,
    ])),
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(worksheetData);
  sheet["!cols"] = [
    { wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 28 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, slugify(department, "Department").slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Uint8Array(buffer);
}

async function generateProbationExcel(payload: {
  employee: Record<string, unknown>;
  review: Record<string, unknown>;
  monthlyScores: Array<Record<string, unknown>>;
}) {
  const employeeName = String(payload.employee.name || payload.review.employee_id || "Employee");

  const monthlyData = [
    ["Probation Assessment"],
    ["Employee", employeeName, "", "Position", String(payload.employee.position || "-")],
    ["Period", `${payload.review.review_period_start || "-"} to ${payload.review.review_period_end || "-"}`],
    [],
    ["Month", "Window", "Work", "Managing", "Attitude", "Deduction", "Total", "Qualitative"],
    ...payload.monthlyScores.map((row) => ([
      `Month ${row.month_no}`,
      `${row.period_start || "-"} to ${row.period_end || "-"}`,
      safeNumber(row.work_performance_score),
      safeNumber(row.managing_task_score),
      safeNumber(row.attitude_score),
      safeNumber(row.attendance_deduction),
      safeNumber(row.monthly_total),
      String(row.manager_qualitative_text || row.manager_note || ""),
    ])),
  ];

  const recapData = [
    ["Probation Recap"],
    ["Employee", employeeName],
    ["Decision", String(payload.review.decision || "pending")],
    ["Final Score", safeNumber(payload.review.final_score)],
    ["Quantitative Score", safeNumber(payload.review.quantitative_score)],
    ["Qualitative Score", safeNumber(payload.review.qualitative_score)],
    ["Summary", String(payload.review.manager_notes || "-")],
  ];

  const workbook = XLSX.utils.book_new();
  const monthly = XLSX.utils.aoa_to_sheet(monthlyData);
  const recap = XLSX.utils.aoa_to_sheet(recapData);
  monthly["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 40 }];
  recap["!cols"] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, monthly, "Monthly");
  XLSX.utils.book_append_sheet(workbook, recap, "Recap");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Uint8Array(buffer);
}

async function createTextPdf(lines: string[], options?: { title?: string; subtitle?: string }) {
  const pdf = await PDFDocument.create();
  const pageSize: [number, number] = [841.89, 595.28];
  let page = pdf.addPage(pageSize);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 40;
  const lineHeight = 16;
  let y = page.getHeight() - margin;

  const addLine = (text: string, bold = false, size = 10) => {
    if (y < margin) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
    }
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  };

  if (options?.title) addLine(options.title, true, 16);
  if (options?.subtitle) addLine(options.subtitle, false, 11);
  if (options?.title || options?.subtitle) y -= 4;

  lines.forEach((line) => {
    wrapText(line, 125).forEach((part) => addLine(part));
  });

  return await pdf.save();
}

async function generateDepartmentPdf(rows: Array<Record<string, unknown>>, department: string, period: string) {
  const lines = rows.map((row, index) =>
    `${index + 1}. ${row.employee_name} | ${row.position} | ${row.kpi_name} | Target ${row.target} ${row.unit || ""} | Actual ${row.actual} ${row.unit || ""} | ${row.achievement}% | ${row.status}`,
  );
  return await createTextPdf(lines, {
    title: "KPI Department Report",
    subtitle: `Department: ${department} | Period: ${period}`,
  });
}

async function generateEmployeePdf(rows: Array<Record<string, unknown>>, employeeId: string, period: string) {
  const first = rows[0];
  const lines = rows.map((row, index) =>
    `${index + 1}. ${row.kpi_name} | Target ${row.target} ${row.unit || ""} | Actual ${row.actual} ${row.unit || ""} | ${row.achievement}% | ${row.status}`,
  );
  return await createTextPdf(lines, {
    title: "Employee KPI Report",
    subtitle: `Employee: ${first?.employee_name || employeeId} | Position: ${first?.position || "-"} | Period: ${period}`,
  });
}

async function generateProbationPdf(payload: {
  employee: Record<string, unknown>;
  review: Record<string, unknown>;
  monthlyScores: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
}) {
  const lines = [
    `Employee: ${payload.employee.name || payload.review.employee_id}`,
    `Position: ${payload.employee.position || "-"}`,
    `Window: ${payload.review.review_period_start || "-"} to ${payload.review.review_period_end || "-"}`,
    `Decision: ${payload.review.decision || "pending"} | Final Score: ${safeNumber(payload.review.final_score)}`,
    "",
    ...payload.monthlyScores.flatMap((row) => ([
      `Month ${row.month_no}: ${row.period_start || "-"} to ${row.period_end || "-"}`,
      `Work ${safeNumber(row.work_performance_score)} | Managing ${safeNumber(row.managing_task_score)} | Attitude ${safeNumber(row.attitude_score)} | Deduction ${safeNumber(row.attendance_deduction)} | Total ${safeNumber(row.monthly_total)}`,
      `Qualitative: ${String(row.manager_qualitative_text || row.manager_note || "-")}`,
      "",
    ])),
    ...(payload.attendance.length > 0
      ? [
        "Attendance:",
        ...payload.attendance.map((row) =>
          `Month ${row.month_no} | ${row.event_date || "-"} | ${row.event_type || "-"} x${safeNumber(row.qty)} | Deduction ${safeNumber(row.deduction_points)} | ${String(row.note || "")}`,
        ),
      ]
      : []),
  ];

  return await createTextPdf(lines, {
    title: "Probation Assessment Report",
    subtitle: `${payload.employee.name || payload.review.employee_id}`,
  });
}

async function ensureExportBucket(admin: ReturnType<typeof createServiceClient>) {
  const bucket = getOptionalEnv("REPORT_EXPORT_BUCKET", "report-exports");
  const { data, error } = await admin.storage.getBucket(bucket);
  if (data) return bucket;

  if (error && !/not found/i.test(String(error.message || ""))) {
    console.warn("report-exports:getBucket-warning", { bucket, message: error.message });
  }

  const { error: createError } = await admin.storage.createBucket(bucket, { public: false });
  if (createError && !/already exists/i.test(String(createError.message || ""))) {
    throw new Error(`Failed to ensure export bucket: ${createError.message}`);
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
    console.info("report-exports:request", {
      action: payload.action || null,
      department: payload.department || null,
      period: payload.period || null,
      employee_id: payload.employee_id || null,
      review_id: payload.review_id || null,
    });

    const context = await authorizeExport(req);
    let bytes: Uint8Array;
    let contentType = "application/octet-stream";
    let filename = "export.bin";

    switch (String(payload.action || "").trim()) {
      case "department_kpi_excel": {
        const exportData = await buildDepartmentExport(context.dataClient, payload);
        console.info("report-exports:department-export", { action: payload.action, rows: exportData.rows.length, department: exportData.department, period: exportData.period });
        bytes = await generateDepartmentExcel(exportData.rows, exportData.department, exportData.period);
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = `KPI_Report_${slugify(exportData.department)}_${formatDateForFilename()}.xlsx`;
        break;
      }
      case "department_kpi_pdf": {
        const exportData = await buildDepartmentExport(context.dataClient, payload);
        console.info("report-exports:department-export", { action: payload.action, rows: exportData.rows.length, department: exportData.department, period: exportData.period });
        bytes = await generateDepartmentPdf(exportData.rows, exportData.department, exportData.period);
        contentType = "application/pdf";
        filename = `KPI_Report_${slugify(exportData.department)}_${formatDateForFilename()}.pdf`;
        break;
      }
      case "employee_kpi_pdf": {
        const exportData = await buildEmployeeExport(context.dataClient, payload);
        console.info("report-exports:employee-export", { action: payload.action, rows: exportData.rows.length, employee_id: exportData.employeeId, period: exportData.period });
        bytes = await generateEmployeePdf(exportData.rows, exportData.employeeId, exportData.period);
        contentType = "application/pdf";
        filename = `KPI_Employee_${slugify(String(exportData.rows[0]?.employee_name || exportData.employeeId))}_${formatDateForFilename()}.pdf`;
        break;
      }
      case "probation_excel": {
        const exportData = await buildProbationExport(context.dataClient, payload);
        console.info("report-exports:probation-export", { action: payload.action, review_id: payload.review_id, employee_id: exportData.review.employee_id, months: exportData.monthlyScores.length, attendance: exportData.attendance.length });
        bytes = await generateProbationExcel(exportData);
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = `probation_${slugify(String(exportData.employee.name || exportData.review.employee_id))}_${formatDateForFilename()}.xlsx`;
        break;
      }
      case "probation_pdf": {
        const exportData = await buildProbationExport(context.dataClient, payload);
        console.info("report-exports:probation-export", { action: payload.action, review_id: payload.review_id, employee_id: exportData.review.employee_id, months: exportData.monthlyScores.length, attendance: exportData.attendance.length });
        bytes = await generateProbationPdf(exportData);
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
    console.error("report-exports:error", {
      action: payload?.action || null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    return jsonResponse(/access denied/i.test(String(error)) ? 403 : 500, {
      ok: false,
      error: {
        code: /access denied/i.test(String(error)) ? "forbidden" : "internal_error",
        message: error instanceof Error ? error.message : "Unexpected export failure.",
      },
    });
  }
});

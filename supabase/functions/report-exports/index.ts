import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createServiceClient, requireActor } from "../_shared/auth.ts";
import { corsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { getOptionalEnv } from "../_shared/env.ts";

type Payload = {
  action?: string;
  department?: string;
  period?: string;
  employee_id?: string;
  review_id?: string;
  output?: string;
  persist?: boolean;
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

function canExportRole(role: string) {
  return ["superadmin", "hr", "manager", "director"].includes(String(role || "").toLowerCase());
}

async function authorizeExport(req: Request) {
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
    .select("id, employee_id, kpi_id, period, value, notes, target_snapshot, kpi_name_snapshot, kpi_unit_snapshot, kpi_category_snapshot, target_version_id")
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
    .select("id, probation_review_id, month_no, period_start, period_end, work_performance_score, managing_task_score, manager_qualitative_text, manager_note, attendance_deduction, attitude_score, monthly_total")
    .eq("probation_review_id", reviewId)
    .order("month_no");

  if (error) throw new Error(`Failed to fetch probation monthly scores: ${error.message}`);
  return data || [];
}

async function fetchProbationAttendance(admin: ReturnType<typeof createServiceClient>, reviewId: string) {
  const { data, error } = await admin
    .from("probation_attendance_records")
    .select("id, probation_review_id, month_no, event_date, event_type, qty, deduction_points, note")
    .eq("probation_review_id", reviewId)
    .order("month_no")
    .order("event_date");

  if (error) {
    return [];
  }
  return data || [];
}

function buildDeptKpiExportPayload({
  employees,
  records,
  department,
  period,
}: {
  employees: Array<Record<string, unknown>>;
  records: Array<Record<string, unknown>>;
  department: string;
  period: string;
}) {
  const byEmployee = new Map(
    employees.map((employee) => [String(employee.employee_id), employee]),
  );

  const scopedRecords = records
    .filter((record) => {
      const employee = byEmployee.get(String(record.employee_id));
      return employee && String(employee.department || "") === department;
    })
    .map((record) => {
      const employee = byEmployee.get(String(record.employee_id));
      const target = Number(record.target_snapshot || 0);
      const value = Number(record.value || 0);
      const achievement = target > 0 ? Math.round((value / target) * 100) : 0;
      return {
        employee_id: record.employee_id,
        employee_name: employee?.name || record.employee_id,
        position: employee?.position || "-",
        kpi_name: record.kpi_name_snapshot || record.kpi_id,
        unit: record.kpi_unit_snapshot || "",
        category: record.kpi_category_snapshot || "General",
        target,
        actual: value,
        achievement,
        status: achievement >= 100 ? "On Track" : achievement >= 75 ? "Delayed" : "At Risk",
        note: record.notes || "",
      };
    });

  const employeeCount = new Set(scopedRecords.map((row) => row.employee_id)).size;
  const avgAchievement = scopedRecords.length > 0
    ? Math.round(scopedRecords.reduce((sum, row) => sum + row.achievement, 0) / scopedRecords.length)
    : 0;

  return {
    report_type: "department_kpi",
    period,
    department,
    filename_base: `department_kpi_${slugify(department)}_${period}`,
    summary: {
      employee_count: employeeCount,
      record_count: scopedRecords.length,
      avg_achievement: avgAchievement,
      met_target_count: scopedRecords.filter((row) => row.achievement >= 100).length,
      at_risk_count: scopedRecords.filter((row) => row.achievement < 75).length,
    },
    rows: scopedRecords,
  };
}

function buildProbationExportPayload({
  review,
  employee,
  monthlyScores,
  attendance,
}: {
  review: Record<string, unknown>;
  employee: Record<string, unknown> | undefined;
  monthlyScores: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
}) {
  return {
    report_type: "probation_review",
    filename_base: `probation_${slugify(String(employee?.name || review.employee_id || "employee"))}_${String(review.review_period_end || "").slice(0, 10) || "report"}`,
    employee: {
      employee_id: review.employee_id,
      name: employee?.name || review.employee_id,
      position: employee?.position || "-",
      department: employee?.department || "-",
      manager_id: employee?.manager_id || null,
    },
    review: {
      id: review.id,
      review_period_start: review.review_period_start,
      review_period_end: review.review_period_end,
      quantitative_score: Number(review.quantitative_score || 0),
      qualitative_score: Number(review.qualitative_score || 0),
      final_score: Number(review.final_score || 0),
      decision: review.decision || "pending",
      manager_notes: review.manager_notes || "",
      reviewed_by: review.reviewed_by || null,
      reviewed_at: review.reviewed_at || null,
    },
    monthly_scores: monthlyScores.map((row) => ({
      month_no: row.month_no,
      period_start: row.period_start,
      period_end: row.period_end,
      work_performance_score: Number(row.work_performance_score || 0),
      managing_task_score: Number(row.managing_task_score || 0),
      attitude_score: Number(row.attitude_score || 0),
      attendance_deduction: Number(row.attendance_deduction || 0),
      monthly_total: Number(row.monthly_total || 0),
      manager_qualitative_text: row.manager_qualitative_text || "",
      manager_note: row.manager_note || "",
    })),
    attendance_records: attendance.map((row) => ({
      month_no: row.month_no,
      event_date: row.event_date,
      event_type: row.event_type,
      qty: Number(row.qty || 0),
      deduction_points: Number(row.deduction_points || 0),
      note: row.note || "",
    })),
  };
}

async function handleDepartmentKpiExport(admin: ReturnType<typeof createServiceClient>, payload: Payload) {
  const department = String(payload.department || "").trim();
  if (!department) {
    throw new Error("department is required.");
  }

  const period = normalizePeriod(payload.period);
  const [employees, records] = await Promise.all([
    fetchEmployees(admin),
    fetchKpiRecords(admin, period),
  ]);

  return buildDeptKpiExportPayload({ employees, records, department, period });
}

async function handleProbationExport(admin: ReturnType<typeof createServiceClient>, payload: Payload) {
  const reviewId = String(payload.review_id || "").trim();
  if (!reviewId) {
    throw new Error("review_id is required.");
  }

  const review = await fetchProbationReview(admin, reviewId);
  const [employees, monthlyScores, attendance] = await Promise.all([
    fetchEmployees(admin),
    fetchProbationMonthlyScores(admin, reviewId),
    fetchProbationAttendance(admin, reviewId),
  ]);

  const employee = employees.find((row) => String(row.employee_id) === String(review.employee_id));
  return buildProbationExportPayload({ review, employee, monthlyScores, attendance });
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
    let exportPayload;

    switch (String(payload.action || "").trim()) {
      case "department_kpi_excel":
      case "department_kpi_pdf":
        exportPayload = await handleDepartmentKpiExport(context.admin, payload);
        break;
      case "probation_excel":
      case "probation_pdf":
        exportPayload = await handleProbationExport(context.admin, payload);
        break;
      default:
        return jsonResponse(400, {
          ok: false,
          error: { code: "unknown_action", message: "Unsupported report export action." },
        });
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        export_job: {
          action: payload.action,
          output: payload.output || "json_payload",
          mode: "payload_prepared",
          persist: Boolean(payload.persist),
        },
        payload: exportPayload,
        actor: {
          employee_id: context.actor.employee_id,
          role: context.actor.role,
        },
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

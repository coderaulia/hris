import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireSuperadmin } from "../_shared/auth.ts";
import { corsHeaders, withCorsHeaders } from "../_shared/cors.ts";

type JsonRecord = Record<string, unknown>;

type ActionPayload = {
  action?: string;
  employee_id?: string;
  email?: string;
  password?: string;
  role?: string;
  auth_user_id?: string;
  must_change_password?: boolean;
};

const ALLOWED_ROLES = new Set(["employee", "manager", "director", "superadmin", "hr"]);

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({
      "Content-Type": "application/json",
    }),
  });
}

function errorResponse(status: number, code: string, message: string, details?: JsonRecord) {
  return jsonResponse(status, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

function successResponse(data: JsonRecord) {
  return jsonResponse(200, { ok: true, data });
}

async function logAdminAction(
  admin: {
    from: (table: string) => {
      insert: (payload: Record<string, unknown>) => Promise<unknown>;
    };
  },
  actorEmployeeId: string,
  actorRole: string,
  action: string,
  entityId: string,
  details: JsonRecord,
) {
  await admin.from("admin_activity_log").insert({
    actor_employee_id: actorEmployeeId,
    actor_role: actorRole,
    action,
    entity_type: "employee",
    entity_id: entityId,
    details,
  });
}

async function handleCreateManagedUser(payload: ActionPayload, req: Request) {
  const { admin, actor } = await requireSuperadmin(req);
  const employeeId = String(payload.employee_id || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const mustChangePassword = payload.must_change_password !== false;

  if (!employeeId) {
    return errorResponse(400, "invalid_employee_id", "employee_id is required.");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse(400, "invalid_email", "A valid email address is required.");
  }
  if (!password || password.length < 6) {
    return errorResponse(400, "invalid_password", "Password must be at least 6 characters.");
  }

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("employee_id, name, auth_id, auth_email, role")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (employeeError) {
    return errorResponse(500, "employee_lookup_failed", employeeError.message);
  }
  if (!employee) {
    return errorResponse(404, "employee_not_found", "Employee record not found.");
  }
  if (employee.auth_id) {
    return errorResponse(409, "employee_already_linked", "Employee already has a linked auth account.", {
      auth_user_id: employee.auth_id,
      auth_email: employee.auth_email,
    });
  }

  const { data: duplicateEmployee } = await admin
    .from("employees")
    .select("employee_id")
    .ilike("auth_email", email)
    .neq("employee_id", employeeId)
    .maybeSingle();

  if (duplicateEmployee) {
    return errorResponse(409, "email_already_linked", "Email is already linked to another employee profile.");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      employee_id: employeeId,
      managed_by: actor.employee_id,
    },
  });

  if (createError || !created.user) {
    return errorResponse(409, "auth_user_create_failed", createError?.message || "Unable to create auth user.");
  }

  const { error: updateError } = await admin
    .from("employees")
    .update({
      auth_email: email,
      auth_id: created.user.id,
      must_change_password: mustChangePassword,
    })
    .eq("employee_id", employeeId);

  if (updateError) {
    return errorResponse(500, "employee_update_failed", updateError.message);
  }

  await logAdminAction(
    admin,
    actor.employee_id,
    actor.role,
    "user.login.setup",
    employeeId,
    {
      employee_name: employee.name,
      auth_email: email,
      auth_user_id: created.user.id,
      must_change_password: mustChangePassword,
      via: "edge_function",
    },
  );

  return successResponse({
    employee_id: employeeId,
    auth_email: email,
    auth_user_id: created.user.id,
    must_change_password: mustChangePassword,
  });
}

async function handleUpdateEmployeeRole(payload: ActionPayload, req: Request) {
  const { admin, actor } = await requireSuperadmin(req);
  const employeeId = String(payload.employee_id || "").trim();
  const role = String(payload.role || "").trim().toLowerCase();

  if (!employeeId) {
    return errorResponse(400, "invalid_employee_id", "employee_id is required.");
  }
  if (!ALLOWED_ROLES.has(role)) {
    return errorResponse(400, "invalid_role", "Role must be one of employee, manager, director, superadmin, hr.");
  }

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .select("employee_id, name, role")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (employeeError) {
    return errorResponse(500, "employee_lookup_failed", employeeError.message);
  }
  if (!employee) {
    return errorResponse(404, "employee_not_found", "Employee record not found.");
  }

  const previousRole = String(employee.role || "").toLowerCase();
  const { error: updateError } = await admin
    .from("employees")
    .update({ role })
    .eq("employee_id", employeeId);

  if (updateError) {
    return errorResponse(500, "employee_role_update_failed", updateError.message);
  }

  await logAdminAction(
    admin,
    actor.employee_id,
    actor.role,
    "user.role.change",
    employeeId,
    {
      employee_name: employee.name,
      previous_role: previousRole,
      new_role: role,
      via: "edge_function",
    },
  );

  return successResponse({
    employee_id: employeeId,
    previous_role: previousRole,
    role,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return successResponse({
      function: "admin-user-mutations",
      implemented_actions: ["create_managed_user", "update_employee_role"],
    });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Use POST for mutations.");
  }

  let payload: ActionPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  try {
    switch (String(payload.action || "").trim()) {
      case "create_managed_user":
        return await handleCreateManagedUser(payload, req);
      case "update_employee_role":
        return await handleUpdateEmployeeRole(payload, req);
      default:
        return errorResponse(400, "unknown_action", "Unsupported action.", {
          action: payload.action ?? null,
        });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected edge function failure.";
    const code = /superadmin|access denied/i.test(message) ? "forbidden" : "internal_error";
    const status = code === "forbidden" ? 403 : 500;
    return errorResponse(status, code, message);
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createServiceClient, requireActor } from "../_shared/auth.ts";
import { corsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { getOptionalEnv } from "../_shared/env.ts";

type Payload = {
  action?: string;
  version_id?: string;
  review_id?: string;
  pip_plan_id?: string;
  dry_run?: boolean;
};

type Recipient = {
  employee_id: string | null;
  email: string;
  name: string;
};

type DeliveryPayload = {
  to: string[];
  subject: string;
  text: string;
  html: string;
};

type DeliveryResult = {
  delivered: boolean;
  dry_run: boolean;
  provider: string;
  provider_response?: string | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({ "Content-Type": "application/json" }),
  });
}

function uniqueRecipients(items: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getWebhookSecret(req: Request): string {
  return req.headers.get("x-webhook-secret") || req.headers.get("X-Webhook-Secret") || "";
}

async function authorizeRequest(req: Request) {
  const configuredSecret = getOptionalEnv("APPROVAL_NOTIFICATION_WEBHOOK_SECRET");
  const incomingSecret = getWebhookSecret(req).trim();

  if (configuredSecret && incomingSecret && configuredSecret === incomingSecret) {
    const admin = createServiceClient();
    return {
      mode: "webhook",
      admin,
      dataClient: admin,
      logClient: admin,
      actor: {
        employee_id: "system",
        role: "system",
        name: "System Webhook",
      },
    };
  }

  const { admin, actorClient, actor } = await requireActor(req);
  const role = String(actor.role || "").toLowerCase();
  if (!["superadmin", "hr", "manager", "director"].includes(role)) {
    throw new Error("Access denied.");
  }

  return {
    mode: "authenticated",
    admin,
    dataClient: actorClient,
    logClient: actorClient,
    actor,
  };
}

async function sendEmail({
  to,
  subject,
  text,
  html,
}: DeliveryPayload): Promise<DeliveryResult> {
  const provider = getOptionalEnv("EMAIL_PROVIDER", "generic").toLowerCase();
  const emailApiUrl = getOptionalEnv("EMAIL_API_URL");
  const emailApiKey = getOptionalEnv("EMAIL_API_KEY");
  const emailFrom = getOptionalEnv("EMAIL_FROM");
  const emailReplyTo = getOptionalEnv("EMAIL_REPLY_TO");

  if (!emailApiKey || !emailFrom || (provider === "generic" && !emailApiUrl)) {
    return {
      delivered: false,
      dry_run: true,
      provider: "unconfigured",
    };
  }

  if (provider === "resend") {
    const response = await fetch(emailApiUrl || "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        from: emailFrom,
        to,
        reply_to: emailReplyTo || undefined,
        subject,
        text,
        html,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Email provider error (${response.status}): ${bodyText}`);
    }

    return {
      delivered: true,
      dry_run: false,
      provider: "resend",
      provider_response: bodyText || null,
    };
  }

  const response = await fetch(emailApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${emailApiKey}`,
    },
    body: JSON.stringify({
      from: emailFrom,
      to,
      reply_to: emailReplyTo || undefined,
      subject,
      text,
      html,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Email provider error (${response.status}): ${bodyText}`);
  }

  return {
    delivered: true,
    dry_run: false,
    provider: provider || emailApiUrl,
    provider_response: bodyText || null,
  };
}

async function logNotification(client: ReturnType<typeof createServiceClient>, payload: Record<string, unknown>) {
  await client.from("admin_activity_log").insert({
    actor_employee_id: payload.actor_employee_id || null,
    actor_role: payload.actor_role || "system",
    action: "approval.notification.send",
    entity_type: "notification",
    entity_id: String(payload.entity_id || ""),
    details: payload,
  });
}

async function resolveEmployee(admin: ReturnType<typeof createServiceClient>, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  const { data } = await admin
    .from("employees")
    .select("employee_id, name, auth_email, manager_id, department, position")
    .eq("employee_id", employeeId)
    .maybeSingle();
  return data || null;
}

async function buildKpiTargetNotification(admin: ReturnType<typeof createServiceClient>, versionId: string) {
  const { data: version, error } = await admin
    .from("employee_kpi_target_versions")
    .select("id, employee_id, kpi_id, effective_period, target_value, status, approved_at, rejected_at, rejection_reason")
    .eq("id", versionId)
    .maybeSingle();

  if (error || !version) {
    throw new Error(error?.message || "Target version not found.");
  }

  const employee = await resolveEmployee(admin, version.employee_id);
  const manager = await resolveEmployee(admin, employee?.manager_id || null);
  const { data: kpi } = await admin
    .from("kpi_definitions")
    .select("id, name, category, unit")
    .eq("id", version.kpi_id)
    .maybeSingle();

  const recipients = uniqueRecipients([
    employee?.auth_email ? { employee_id: employee.employee_id, email: employee.auth_email, name: employee.name || employee.employee_id } : null,
    manager?.auth_email ? { employee_id: manager.employee_id, email: manager.auth_email, name: manager.name || manager.employee_id } : null,
  ].filter(Boolean) as Recipient[]);

  const status = String(version.status || "").toLowerCase();
  const subject = `[HRIS] KPI target ${status}: ${kpi?.name || "KPI target"} for ${employee?.name || version.employee_id}`;
  const text = [
    `Employee: ${employee?.name || version.employee_id}`,
    `KPI: ${kpi?.name || version.kpi_id}`,
    `Period: ${version.effective_period || "-"}`,
    `Target: ${version.target_value ?? "-"} ${kpi?.unit || ""}`.trim(),
    `Status: ${status || "-"}`,
    version.rejection_reason ? `Reason: ${version.rejection_reason}` : "",
  ].filter(Boolean).join("\n");

  return {
    entity_id: version.id,
    notification_type: "employee_kpi_target_versions",
    recipients,
    subject,
    text,
    html: `<pre>${text}</pre>`,
    meta: {
      employee_id: version.employee_id,
      kpi_id: version.kpi_id,
      status,
    },
  };
}

async function buildKpiDefinitionNotification(admin: ReturnType<typeof createServiceClient>, versionId: string) {
  const { data: version, error } = await admin
    .from("kpi_definition_versions")
    .select("id, name, category, effective_period, status, request_note, rejection_reason")
    .eq("id", versionId)
    .maybeSingle();

  if (error || !version) {
    throw new Error(error?.message || "Definition version not found.");
  }

  const { data: watchers } = await admin
    .from("employees")
    .select("employee_id, name, auth_email, role")
    .in("role", ["superadmin", "hr", "director"]);

  const recipients = uniqueRecipients(
    (watchers || [])
      .filter((row) => row.auth_email)
      .map((row) => ({
        employee_id: row.employee_id,
        email: row.auth_email,
        name: row.name || row.employee_id,
      })),
  );

  const status = String(version.status || "").toLowerCase();
  const subject = `[HRIS] KPI definition ${status}: ${version.name}`;
  const text = [
    `KPI: ${version.name}`,
    `Position Scope: ${version.category || "General"}`,
    `Effective Period: ${version.effective_period || "-"}`,
    `Status: ${status || "-"}`,
    version.request_note ? `Request Note: ${version.request_note}` : "",
    version.rejection_reason ? `Reason: ${version.rejection_reason}` : "",
  ].filter(Boolean).join("\n");

  return {
    entity_id: version.id,
    notification_type: "kpi_definition_versions",
    recipients,
    subject,
    text,
    html: `<pre>${text}</pre>`,
    meta: {
      category: version.category,
      status,
    },
  };
}

async function buildProbationNotification(admin: ReturnType<typeof createServiceClient>, reviewId: string) {
  const { data: review, error } = await admin
    .from("probation_reviews")
    .select("id, employee_id, decision, final_score, review_period_start, review_period_end, manager_notes")
    .eq("id", reviewId)
    .maybeSingle();

  if (error || !review) {
    throw new Error(error?.message || "Probation review not found.");
  }

  const employee = await resolveEmployee(admin, review.employee_id);
  const manager = await resolveEmployee(admin, employee?.manager_id || null);
  const { data: hrRows } = await admin
    .from("employees")
    .select("employee_id, name, auth_email, role")
    .eq("role", "hr");

  const recipients = uniqueRecipients([
    employee?.auth_email ? { employee_id: employee.employee_id, email: employee.auth_email, name: employee.name || employee.employee_id } : null,
    manager?.auth_email ? { employee_id: manager.employee_id, email: manager.auth_email, name: manager.name || manager.employee_id } : null,
    ...(hrRows || []).filter((row) => row.auth_email).map((row) => ({
      employee_id: row.employee_id,
      email: row.auth_email,
      name: row.name || row.employee_id,
    })),
  ].filter(Boolean) as Recipient[]);

  const decision = String(review.decision || "").toLowerCase();
  const subject = `[HRIS] Probation ${decision}: ${employee?.name || review.employee_id}`;
  const text = [
    `Employee: ${employee?.name || review.employee_id}`,
    `Position: ${employee?.position || "-"}`,
    `Decision: ${decision || "-"}`,
    `Final Score: ${review.final_score ?? "-"}`,
    `Period: ${review.review_period_start || "-"} to ${review.review_period_end || "-"}`,
    review.manager_notes ? `Manager Notes: ${review.manager_notes}` : "",
  ].filter(Boolean).join("\n");

  return {
    entity_id: review.id,
    notification_type: "probation_reviews",
    recipients,
    subject,
    text,
    html: `<pre>${text}</pre>`,
    meta: {
      employee_id: review.employee_id,
      decision,
    },
  };
}

async function buildPipNotification(admin: ReturnType<typeof createServiceClient>, pipPlanId: string) {
  const { data: plan, error } = await admin
    .from("pip_plans")
    .select("id, employee_id, status, trigger_reason, trigger_period, owner_manager_id, summary, target_end_date")
    .eq("id", pipPlanId)
    .maybeSingle();

  if (error || !plan) {
    throw new Error(error?.message || "PIP plan not found.");
  }

  const employee = await resolveEmployee(admin, plan.employee_id);
  const manager = await resolveEmployee(admin, plan.owner_manager_id || employee?.manager_id || null);
  const { data: hrRows } = await admin
    .from("employees")
    .select("employee_id, name, auth_email, role")
    .eq("role", "hr");

  const recipients = uniqueRecipients([
    employee?.auth_email ? { employee_id: employee.employee_id, email: employee.auth_email, name: employee.name || employee.employee_id } : null,
    manager?.auth_email ? { employee_id: manager.employee_id, email: manager.auth_email, name: manager.name || manager.employee_id } : null,
    ...(hrRows || []).filter((row) => row.auth_email).map((row) => ({
      employee_id: row.employee_id,
      email: row.auth_email,
      name: row.name || row.employee_id,
    })),
  ].filter(Boolean) as Recipient[]);

  const status = String(plan.status || "").toLowerCase();
  const subject = `[HRIS] PIP ${status}: ${employee?.name || plan.employee_id}`;
  const text = [
    `Employee: ${employee?.name || plan.employee_id}`,
    `Status: ${status || "-"}`,
    `Trigger Period: ${plan.trigger_period || "-"}`,
    `Reason: ${plan.trigger_reason || "-"}`,
    `Target End Date: ${plan.target_end_date || "-"}`,
    plan.summary ? `Summary: ${plan.summary}` : "",
  ].filter(Boolean).join("\n");

  return {
    entity_id: plan.id,
    notification_type: "pip_plans",
    recipients,
    subject,
    text,
    html: `<pre>${text}</pre>`,
    meta: {
      employee_id: plan.employee_id,
      status,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST for approval notifications." },
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

  let context:
    | Awaited<ReturnType<typeof authorizeRequest>>
    | null = null;
  let notificationMeta: Record<string, unknown> | null = null;
  let recipientEmails: string[] = [];

  try {
    context = await authorizeRequest(req);
    const dataClient = context.dataClient;
    const logClient = context.logClient;

    let notification;
    switch (String(payload.action || "").trim()) {
      case "employee_kpi_target_versions":
        notification = await buildKpiTargetNotification(dataClient, String(payload.version_id || "").trim());
        break;
      case "kpi_definition_versions":
        notification = await buildKpiDefinitionNotification(dataClient, String(payload.version_id || "").trim());
        break;
      case "probation_reviews":
        notification = await buildProbationNotification(dataClient, String(payload.review_id || "").trim());
        break;
      case "pip_plans":
        notification = await buildPipNotification(dataClient, String(payload.pip_plan_id || "").trim());
        break;
      default:
        return jsonResponse(400, {
          ok: false,
          error: { code: "unknown_action", message: "Unsupported notification action." },
        });
    }

    recipientEmails = notification.recipients.map((item: Recipient) => item.email);
    notificationMeta = {
      entity_id: notification.entity_id,
      notification_type: notification.notification_type,
      meta: notification.meta,
      subject: notification.subject,
    };

    if (recipientEmails.length === 0) {
      await logNotification(logClient, {
        actor_employee_id: context.actor.employee_id,
        actor_role: context.actor.role,
        entity_id: notification.entity_id,
        action_source: context.mode,
        notification_type: notification.notification_type,
        recipients: [],
        delivered: false,
        dry_run: true,
        skipped: true,
        reason: "no_recipients",
        meta: notification.meta,
      });

      return jsonResponse(200, {
        ok: true,
        data: {
          delivered: false,
          skipped: true,
          reason: "no_recipients",
          notification: {
            entity_id: notification.entity_id,
            notification_type: notification.notification_type,
            recipients: notification.recipients,
            subject: notification.subject,
            meta: notification.meta,
          },
        },
      });
    }

    const delivery = payload.dry_run
      ? { delivered: false, dry_run: true, provider: "manual_dry_run" }
      : await sendEmail({
          to: recipientEmails,
          subject: notification.subject,
          text: notification.text,
          html: notification.html,
        });

    await logNotification(logClient, {
      actor_employee_id: context.actor.employee_id,
      actor_role: context.actor.role,
      entity_id: notification.entity_id,
      action_source: context.mode,
      notification_type: notification.notification_type,
      recipients: recipientEmails,
      delivered: delivery.delivered,
      dry_run: delivery.dry_run,
      provider: delivery.provider,
      meta: notification.meta,
    });

    return jsonResponse(200, {
      ok: true,
      data: {
        ...delivery,
        recipients: recipientEmails,
        subject: notification.subject,
        notification_type: notification.notification_type,
      },
    });
  } catch (error) {
    if (context?.logClient) {
      await logNotification(context.logClient, {
        actor_employee_id: context.actor.employee_id,
        actor_role: context.actor.role,
        entity_id: notificationMeta?.entity_id || null,
        action_source: context.mode,
        notification_type: notificationMeta?.notification_type || String(payload?.action || "unknown"),
        recipients: recipientEmails,
        delivered: false,
        dry_run: false,
        provider: getOptionalEnv("EMAIL_PROVIDER", "generic").toLowerCase() || "generic",
        error_message: error instanceof Error ? error.message : String(error),
        meta: notificationMeta?.meta || null,
      });
    }

    return jsonResponse(/access denied/i.test(String(error)) ? 403 : 500, {
      ok: false,
      error: {
        code: /access denied/i.test(String(error)) ? "forbidden" : "internal_error",
        message: error instanceof Error ? error.message : "Unexpected notification failure.",
      },
    });
  }
});

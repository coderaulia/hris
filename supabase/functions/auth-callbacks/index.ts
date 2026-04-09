import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createServiceClient } from "../_shared/auth.ts";
import { corsHeaders, withCorsHeaders } from "../_shared/cors.ts";

type Payload = {
  current_url?: string;
  next?: string;
  type?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({ "Content-Type": "application/json" }),
  });
}

function getAccessToken(req: Request): string {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing bearer token.");
  }
  return match[1].trim();
}

function normalizePath(input: string | undefined, fallback = "/"): string {
  const raw = String(input || "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("/")) return raw;

  try {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function sanitizeRedirectTarget(currentUrl: string | undefined, next: string | undefined, type: string | undefined): string {
  let basePath = normalizePath(next, "/");

  if (String(type || "").trim().toLowerCase() === "recovery") {
    const divider = basePath.includes("?") ? "&" : "?";
    basePath = `${basePath}${divider}recovery=1`;
  }

  if (currentUrl) {
    try {
      const url = new URL(currentUrl);
      const fallback = `${url.pathname}${url.search}`;
      if (!next && fallback && !/auth_callback=1/.test(fallback)) {
        basePath = fallback;
      }
    } catch {
      // ignore malformed URL payload
    }
  }

  return basePath.replace(/([?&])auth_callback=1(&?)/g, (_m, start, end) => (start === "?" && end ? "?" : "")).replace(/[?&]$/, "") || "/";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: { code: "method_not_allowed", message: "Use POST for auth callback normalization." },
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
    const accessToken = getAccessToken(req);
    const admin = createServiceClient();
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);

    if (authError || !authData.user) {
      return jsonResponse(401, {
        ok: false,
        error: { code: "invalid_session", message: authError?.message || "Unable to resolve auth user." },
      });
    }

    const user = authData.user;
    const authId = String(user.id || "").trim();
    const email = String(user.email || "").trim().toLowerCase();

    let profileQuery = admin
      .from("employees")
      .select("employee_id, name, role, position, department, seniority, auth_id, auth_email, must_change_password")
      .limit(1);

    if (authId && email) {
      profileQuery = profileQuery.or(`auth_id.eq.${authId},auth_email.ilike.${email}`);
    } else if (authId) {
      profileQuery = profileQuery.eq("auth_id", authId);
    } else if (email) {
      profileQuery = profileQuery.ilike("auth_email", email);
    }

    const { data: profile, error: profileError } = await profileQuery.maybeSingle();
    if (profileError) {
      return jsonResponse(500, {
        ok: false,
        error: { code: "profile_lookup_failed", message: profileError.message },
      });
    }

    if (profile && !profile.auth_id && authId) {
      await admin
        .from("employees")
        .update({ auth_id: authId })
        .eq("employee_id", profile.employee_id);
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        redirect_to: sanitizeRedirectTarget(payload.current_url, payload.next, payload.type),
        auth: {
          email,
          auth_id: authId,
          type: String(payload.type || "").trim().toLowerCase() || null,
        },
        profile: profile
          ? {
              employee_id: profile.employee_id,
              name: profile.name,
              role: profile.role,
              position: profile.position,
              department: profile.department,
              seniority: profile.seniority,
              auth_id: profile.auth_id || authId || null,
              auth_email: profile.auth_email || email || null,
              must_change_password: Boolean(profile.must_change_password),
            }
          : null,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: {
        code: "internal_error",
        message: error instanceof Error ? error.message : "Unexpected auth callback failure.",
      },
    });
  }
});

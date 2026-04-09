import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getSupabaseEnv } from "./env.ts";

type ActorProfile = {
  employee_id: string;
  role: string;
  name: string | null;
  auth_id: string | null;
  auth_email: string | null;
};

function getAccessToken(req: Request): string {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing bearer token.");
  }
  return match[1].trim();
}

export function createServiceClient(): SupabaseClient {
  const env = getSupabaseEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireActor(req: Request) {
  const token = getAccessToken(req);
  const admin = createServiceClient();
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid or expired token.");
  }

  const email = String(data.user.email || "").trim().toLowerCase();
  const authId = String(data.user.id || "").trim();

  let query = admin
    .from("employees")
    .select("employee_id, role, name, auth_id, auth_email")
    .limit(1);

  if (authId && email) {
    query = query.or(`auth_id.eq.${authId},auth_email.ilike.${email}`);
  } else if (authId) {
    query = query.eq("auth_id", authId);
  } else if (email) {
    query = query.ilike("auth_email", email);
  }

  const { data: profile, error: profileError } = await query.maybeSingle<ActorProfile>();
  if (profileError) {
    throw new Error(`Failed to resolve actor profile: ${profileError.message}`);
  }
  if (!profile) {
    throw new Error("Authenticated user is not linked to an employee profile.");
  }

  return { admin, authUser: data.user, actor: profile };
}

export async function requireSuperadmin(req: Request) {
  const context = await requireActor(req);
  if (String(context.actor.role || "").toLowerCase() !== "superadmin") {
    throw new Error("Access denied. Superadmin only.");
  }
  return context;
}

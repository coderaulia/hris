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

export function createUserClient(token: string): SupabaseClient {
  const env = getSupabaseEnv();
  return createClient(env.url, env.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireActor(req: Request) {
  const token = getAccessToken(req);
  const admin = createServiceClient();
  const actorClient = createUserClient(token);
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid or expired token.");
  }

  const email = String(data.user.email || "").trim().toLowerCase();
  const authId = String(data.user.id || "").trim();

  let profile: ActorProfile | null = null;

  if (authId) {
    const { data: byAuthId, error: byAuthIdError } = await actorClient
      .from("employees")
      .select("employee_id, role, name, auth_id, auth_email")
      .eq("auth_id", authId)
      .limit(1)
      .maybeSingle<ActorProfile>();

    if (byAuthIdError) {
      throw new Error(`Failed to resolve actor profile by auth_id: ${byAuthIdError.message}`);
    }
    if (byAuthId) {
      profile = byAuthId;
    }
  }

  if (!profile && email) {
    const { data: byEmail, error: byEmailError } = await actorClient
      .from("employees")
      .select("employee_id, role, name, auth_id, auth_email")
      .ilike("auth_email", email)
      .limit(1)
      .maybeSingle<ActorProfile>();

    if (byEmailError) {
      throw new Error(`Failed to resolve actor profile by auth_email: ${byEmailError.message}`);
    }
    if (byEmail) {
      profile = byEmail;
    }
  }

  if (!profile) {
    throw new Error("Authenticated user is not linked to an employee profile.");
  }

  return { admin, actorClient, authUser: data.user, actor: profile };
}

export async function requireSuperadmin(req: Request) {
  const context = await requireActor(req);
  if (String(context.actor.role || "").toLowerCase() !== "superadmin") {
    throw new Error("Access denied. Superadmin only.");
  }
  return context;
}

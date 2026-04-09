function getEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback = ""): string {
  return Deno.env.get(name)?.trim() || fallback;
}

function getFirstEnv(names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim() || "";
    if (value) return value;
  }
  throw new Error(`Missing required environment variable. Tried: ${names.join(", ")}`);
}

export function getSupabaseEnv() {
  return {
    url: getFirstEnv(["URL", "SUPABASE_URL"]),
    anonKey: getFirstEnv(["ANON_KEY", "SUPABASE_ANON_KEY"]),
    serviceRoleKey: getFirstEnv(["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
  };
}

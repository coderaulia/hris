function getEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    url: getEnv("SUPABASE_URL"),
    anonKey: getEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, withCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    ok: false,
    error: {
      code: "not_implemented",
      message: "report-exports is scaffolded but not implemented yet.",
    },
  }), {
    status: 501,
    headers: withCorsHeaders({ "Content-Type": "application/json" }),
  });
});

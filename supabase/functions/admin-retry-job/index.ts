import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map(e => e.trim()).filter(Boolean);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user || (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(user.email ?? ""))) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
    );
  }

  const { job_id } = await req.json();
  if (!job_id) {
    return new Response(
      JSON.stringify({ error: "job_id is required" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { error } = await supabase
    .from("scheduled_jobs")
    .update({
      status:     "pending",
      attempts:   0,
      last_error: null,
      fire_at:    new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job_id)
    .in("status", ["failed", "cancelled"]);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  console.log(`Admin retry: job ${job_id} reset to pending by ${user.email}`);

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});

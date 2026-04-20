import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept job_id from query string (GET) or JSON body (POST)
  let job_id: string | null = null;
  const url = new URL(req.url);
  job_id = url.searchParams.get("job_id");

  if (!job_id && req.method === "POST") {
    try {
      const body = await req.json();
      job_id = body.job_id ?? null;
    } catch { /* ignore */ }
  }

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

  const { data: job, error } = await supabase
    .from("scheduled_jobs")
    .select(
      "id, status, course_name, booking_date, earliest_time, latest_time, " +
      "player_count, booking_platform, attempts, confirmation_code, last_error, " +
      "fire_at, updated_at"
    )
    .eq("id", job_id)
    .single();

  if (error || !job) {
    return new Response(
      JSON.stringify({ error: "Job not found" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
    );
  }

  return new Response(
    JSON.stringify(job),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});

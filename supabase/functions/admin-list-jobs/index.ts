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

  // Verify caller is an admin
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Accept filters from either query string or JSON body
  const url = new URL(req.url);
  let status: string | null = url.searchParams.get("status");
  let limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "50"), 200);
  let offset = parseInt(url.searchParams.get("offset") ?? "0");

  if (req.method === "POST") {
    try {
      const body = await req.json();
      status = body.status ?? status;
      limit  = body.limit  ? Math.min(parseInt(body.limit), 200) : limit;
      offset = body.offset ? parseInt(body.offset) : offset;
    } catch { /* ignore */ }
  }

  let query = supabase
    .from("scheduled_jobs")
    .select(
      "id, status, golfer_email, golfer_name, course_name, booking_date, " +
      "booking_platform, attempts, confirmation_code, last_error, fire_at, updated_at",
      { count: "exact" }
    )
    .order("fire_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  const { data: jobs, error, count } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ jobs, total: count, limit, offset }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});

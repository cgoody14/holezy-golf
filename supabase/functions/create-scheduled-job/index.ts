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

  try {
    const {
      golfer_email,
      golfer_name,
      facility_id,
      course_name,
      booking_date,
      earliest_time,
      latest_time,
      player_count,
      max_price_per_player,
      fire_at,
      // Platform info passed directly from frontend (avoids extra DB lookup)
      booking_platform:     platform_from_frontend,
      platform_course_id:   course_id_from_frontend,
      platform_booking_url: booking_url_from_frontend,
    } = await req.json();

    if (!golfer_email || !course_name || !booking_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: golfer_email, course_name, booking_date" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Resolve platform — use frontend-provided values if present,
    //    otherwise look up from Course_Database ──────────────────────────────
    let platform     = platform_from_frontend  || "chronogolf";
    let platform_id  = course_id_from_frontend || String(facility_id ?? "");
    let course_url   = booking_url_from_frontend || platform_id;

    if ((!platform_from_frontend || !course_id_from_frontend) && facility_id) {
      const { data: courses } = await supabase
        .from("Course_Database")
        .select('"Facility ID", booking_platform, platform_course_id, platform_booking_url')
        .eq('"Facility ID"', facility_id)
        .limit(1);

      const course = courses?.[0];
      if (course) {
        platform    = course.booking_platform    || platform;
        platform_id = course.platform_course_id  || platform_id;
        course_url  = course.platform_booking_url || course_url;
      }
    }

    // ── Resolve platform credentials from Edge Function secrets ────────────
    const PLATFORM_CREDS: Record<string, [string, string]> = {
      chronogolf: ["CHRONOGOLF_EMAIL", "CHRONOGOLF_PASSWORD"],
      golfnow:    ["GOLFNOW_EMAIL",    "GOLFNOW_PASSWORD"],
      teeoff:     ["TEEOFF_EMAIL",     "TEEOFF_PASSWORD"],
      fore:       ["FORE_EMAIL",       "FORE_PASSWORD"],
      supreme:    ["SUPREME_EMAIL",    "SUPREME_PASSWORD"],
    };

    const [emailVar, pwVar] = PLATFORM_CREDS[platform] ?? ["CHRONOGOLF_EMAIL", "CHRONOGOLF_PASSWORD"];
    const platform_email    = Deno.env.get(emailVar) ?? "";
    const platform_password = Deno.env.get(pwVar)    ?? "";

    if (!platform_email || !platform_password) {
      console.error(`Missing credentials: ${emailVar} / ${pwVar}`);
      return new Response(
        JSON.stringify({ error: `Platform credentials not configured for ${platform}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // ── Insert into scheduled_jobs ─────────────────────────────────────────
    const { data: job, error: insertError } = await supabase
      .from("scheduled_jobs")
      .insert({
        golfer_email,
        golfer_name:          golfer_name ?? null,
        chronogolf_email:     platform_email,
        chronogolf_password:  platform_password,
        course_name,
        course_url,
        booking_date,
        earliest_time:        earliest_time ?? "06:00",
        latest_time:          latest_time   ?? "18:00",
        player_count:         player_count  ?? 2,
        max_price_per_player: max_price_per_player ?? null,
        booking_platform:     platform,
        fire_at:              fire_at ?? new Date().toISOString(),
        status:               "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create scheduled job" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`Scheduled job created: ${job.id} for ${golfer_email} @ ${course_name} on ${booking_date} via ${platform}`);

    return new Response(
      JSON.stringify({ success: true, job_id: job.id, platform }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

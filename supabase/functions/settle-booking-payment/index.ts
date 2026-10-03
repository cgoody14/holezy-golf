// Settles a scheduled_jobs row's Stripe authorization once the booking
// worker (Railway) knows the real outcome. Called server-to-server by
// backend/scheduler.py — no end-user session exists at that point, which
// is why this can't reuse cancel-booking's user-auth'd endpoint.
//
//   outcome "booked" → capture the authorized PaymentIntent (charge the card)
//   outcome "failed" → release the hold: cancel if still requires_capture,
//                      refund if it somehow already succeeded
//
// Mirrors the exact Stripe logic already proven in cancel-booking/index.ts.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, outcome } = await req.json();
    if (!job_id || !["booked", "failed"].includes(outcome)) {
      return new Response(
        JSON.stringify({ error: "job_id and outcome ('booked'|'failed') are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: job, error: jobError } = await supabase
      .from("scheduled_jobs")
      .select("id, golfer_email, course_name, booking_date")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Same matching strategy as cancel-booking: scheduled_jobs has no direct
    // FK to Client_Bookings, so we match on email + course + date.
    const { data: booking } = await supabase
      .from("Client_Bookings")
      .select("id, stripe_payment_intent_id, payment_status")
      .eq("email", job.golfer_email)
      .eq("preferred_course", job.course_name)
      .eq("booking_date", job.booking_date)
      .in("payment_status", ["authorized", "pending"])
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!booking?.stripe_payment_intent_id) {
      // A $0 / 100%-off booking (SetupIntent, no charge) has nothing to settle.
      return new Response(
        JSON.stringify({ success: true, settled: "no_payment_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2025-08-27.basil",
    });

    let settled: string;

    if (outcome === "booked") {
      await stripe.paymentIntents.capture(booking.stripe_payment_intent_id);
      settled = "captured";
      await supabase
        .from("Client_Bookings")
        .update({ payment_status: "captured", booking_status: "confirmed" })
        .eq("id", booking.id);
    } else {
      const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        settled = "authorization_cancelled";
      } else if (pi.status === "succeeded") {
        await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
        settled = "refunded";
      } else {
        settled = `no_action_pi_status_${pi.status}`;
      }
      await supabase
        .from("Client_Bookings")
        .update({ payment_status: "cancelled", booking_status: "cancelled" })
        .eq("id", booking.id);
    }

    console.log(`Job ${job_id} outcome=${outcome} → ${settled}`);
    return new Response(
      JSON.stringify({ success: true, settled }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("settle-booking-payment error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

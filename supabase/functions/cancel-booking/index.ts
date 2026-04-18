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

  // Auth — require a logged-in user
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
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

  // Fetch the job — verify it belongs to this user and is still cancellable
  const { data: job, error: fetchError } = await supabase
    .from("scheduled_jobs")
    .select("id, status, golfer_email, course_name, booking_date")
    .eq("id", job_id)
    .single();

  if (fetchError || !job) {
    return new Response(
      JSON.stringify({ error: "Job not found" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
    );
  }

  if (job.golfer_email !== user.email) {
    return new Response(
      JSON.stringify({ error: "You can only cancel your own bookings" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
    );
  }

  if (job.status !== "pending") {
    return new Response(
      JSON.stringify({ error: `Cannot cancel a job with status '${job.status}'. Only pending jobs can be cancelled.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
    );
  }

  // Find the matching Client_Bookings row to get the Stripe payment intent ID
  const { data: booking } = await supabase
    .from("Client_Bookings")
    .select("stripe_payment_intent_id, payment_status")
    .eq("email",        job.golfer_email)
    .eq("preferred_course", job.course_name)
    .eq("booking_date", job.booking_date)
    .in("payment_status", ["authorized", "pending"])
    .order("id", { ascending: false })
    .limit(1)
    .single();

  // Cancel the scheduled job
  const { error: updateError } = await supabase
    .from("scheduled_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", job_id)
    .eq("status", "pending");  // guard against race condition

  if (updateError) {
    return new Response(
      JSON.stringify({ error: "Failed to cancel job" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  // Cancel/refund Stripe payment authorization if present
  let refundResult: string | null = null;
  if (booking?.stripe_payment_intent_id) {
    try {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
        apiVersion: "2023-10-16",
      });

      // PaymentIntent is authorized (requires_capture) → cancel it (no charge)
      // If it was already captured → issue a refund
      const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);

      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        refundResult = "authorization_cancelled";
      } else if (pi.status === "succeeded") {
        await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
        refundResult = "refunded";
      }

      // Update Client_Bookings payment status
      await supabase
        .from("Client_Bookings")
        .update({ payment_status: "cancelled", booking_status: "cancelled" })
        .eq("stripe_payment_intent_id", booking.stripe_payment_intent_id);

    } catch (stripeErr: any) {
      // Non-fatal — job is already cancelled; log the Stripe failure
      console.error("Stripe cancellation error:", stripeErr.message);
      refundResult = "stripe_error";
    }
  }

  console.log(`Job ${job_id} cancelled by ${user.email}. Stripe: ${refundResult ?? "no_payment_found"}`);

  return new Response(
    JSON.stringify({ success: true, refund: refundResult }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});

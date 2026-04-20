import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const { amount, email, name } = await req.json();

    console.log("Creating intent for:", { amount, email, name });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("Found existing customer:", customerId);
    } else {
      const customer = await stripe.customers.create({ email, name });
      customerId = customer.id;
      console.log("Created new customer:", customerId);
    }

    // $0 total (100% coupon etc.) — use SetupIntent to collect card without charging
    if (amount === 0) {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: "off_session",          // card can be charged later, off-session
        payment_method_types: ["card"],
        metadata: { email, name },
      });

      console.log("SetupIntent created:", setupIntent.id);

      return new Response(
        JSON.stringify({
          type: "setup",
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          customerId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Paid flow — authorize card, capture only after tee time confirmed
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency: "usd",
      customer: customerId,
      capture_method: "manual",
      setup_future_usage: "off_session",
      metadata: { email, name },
    });

    console.log("PaymentIntent created:", paymentIntent.id);

    return new Response(
      JSON.stringify({
        type: "payment",
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error creating intent:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

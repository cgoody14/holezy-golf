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

    // Always use a PaymentIntent — even for $0 (coupon) orders — so the card is
    // logged as a transaction in Stripe and saved for future off-session charges.
    // Minimum $1.00 hold (Stripe requires >= $0.50; we use $1 for clarity).
    // If the actual amount due is $0, the worker cancels the hold after booking
    // so the customer is never charged.
    const authorizeAmount = Math.max(100, Math.round(amount * 100)); // cents, min $1.00

    const paymentIntent = await stripe.paymentIntents.create({
      amount: authorizeAmount,
      currency: "usd",
      customer: customerId,
      capture_method: "manual",
      setup_future_usage: "off_session",
      metadata: {
        email,
        name,
        // Preserve the real amount owed so the worker knows what to capture/cancel
        amount_due_cents: String(Math.round(amount * 100)),
      },
    });

    console.log("PaymentIntent created:", paymentIntent.id, "authorize:", authorizeAmount, "cents, amount_due:", Math.round(amount * 100), "cents");

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

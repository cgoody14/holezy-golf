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
    const { promoCode } = await req.json();
    
    if (!promoCode || typeof promoCode !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: "Promo code is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Validating promo code:", promoCode);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Search for promotion codes (these are the codes customers enter)
    const promotionCodes = await stripe.promotionCodes.list({
      code: promoCode,
      active: true,
      limit: 1,
    });

    if (promotionCodes.data.length === 0) {
      console.log("No promotion code found for:", promoCode);
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid promo code" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const promotionCode = promotionCodes.data[0];
    const coupon = promotionCode.coupon;

    console.log("Found coupon:", coupon);

    // Check if coupon is still valid
    if (!coupon.valid) {
      return new Response(
        JSON.stringify({ valid: false, error: "This promo code has expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Return coupon details
    const response = {
      valid: true,
      couponId: coupon.id,
      promotionCodeId: promotionCode.id,
      name: coupon.name || promoCode,
      percentOff: coupon.percent_off,
      amountOff: coupon.amount_off ? coupon.amount_off / 100 : null, // Convert from cents
      currency: coupon.currency,
    };

    console.log("Coupon validated successfully:", response);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error validating coupon:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Failed to validate promo code" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

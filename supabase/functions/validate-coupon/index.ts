import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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
    const { promoCode, email } = await req.json();

    if (!promoCode || typeof promoCode !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: "Promo code is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Validating promo code:", promoCode, "for email:", email);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Promotion codes are matched case-insensitively at redemption, but the
    // list() `code` filter matches what's stored. Try the code as typed, then
    // its upper- and lower-cased forms, so "save10" still finds "SAVE10".
    const tried = Array.from(new Set([
      promoCode,
      promoCode.toUpperCase(),
      promoCode.toLowerCase(),
    ]));

    let promotionCode: Stripe.PromotionCode | undefined;
    for (const code of tried) {
      const list = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
      if (list.data.length > 0) {
        promotionCode = list.data[0];
        break;
      }
    }

    if (!promotionCode) {
      console.log(`No active promotion code found for "${promoCode}" (tried ${tried.join(", ")}).`);
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid promo code" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const coupon = promotionCode.coupon;

    if (!coupon.valid) {
      return new Response(
        JSON.stringify({ valid: false, error: "This promo code has expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check if this email has already used this promo code
    if (email) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: existing } = await supabase
        .from('Client_Bookings')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('promo_code', promoCode)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ valid: false, error: "This promo code has already been used on your account" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    return new Response(
      JSON.stringify({
        valid: true,
        couponId: coupon.id,
        promotionCodeId: promotionCode.id,
        name: coupon.name || promoCode,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off ? coupon.amount_off / 100 : null,
        currency: coupon.currency,
      }),
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

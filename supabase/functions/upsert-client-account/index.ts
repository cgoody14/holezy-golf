import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpsertPayload {
  userId?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  username?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Missing Supabase env vars");
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body: UpsertPayload = await req.json();
    const { userId, email, firstName, lastName, phone, username } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const record = {
      user_id: userId ?? null,
      email,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone: phone ?? null,
      username: username ?? null,
    } as const;

    let result;
    try {
      if (userId) {
        result = await supabase
          .from("Client_Accounts")
          .upsert(record, { onConflict: "user_id" })
          .select("id, user_id")
          .maybeSingle();
      } else {
        result = await supabase
          .from("Client_Accounts")
          .upsert(record, { onConflict: "email" })
          .select("id, user_id")
          .maybeSingle();
      }

      if (result.error) throw result.error;
    } catch (err: any) {
      // If FK violation on user_id, retry without user_id using email as conflict target
      if (err?.code === '23503') {
        const emailOnly = { ...record, user_id: null } as const;
        result = await supabase
          .from("Client_Accounts")
          .upsert(emailOnly, { onConflict: "email" })
          .select("id, user_id")
          .maybeSingle();
        if (result.error) throw result.error;
      } else {
        throw err;
      }
    }

    const { data } = result;

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("upsert-client-account error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AlertRequest {
  type: 'account_created' | 'booking_made';
  userEmail: string;
  userName?: string;
  bookingDetails?: {
    id: string;
    course: string;
    date: string;
    players: number;
    totalPrice: number;
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== ADMIN ALERT FUNCTION START ===");
    console.log("Environment check - RESEND_API_KEY exists:", !!Deno.env.get("RESEND_API_KEY"));
    console.log("Available env vars:", Object.keys(Deno.env.toObject()));
    
    const { type, userEmail, userName, bookingDetails }: AlertRequest = await req.json();
    console.log("Admin alert request:", { type, userEmail, userName, bookingDetails });
    
    // Initialize Resend client with the API key
    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    // Fallback to hardcoded key if environment variable is not set
    if (!resendApiKey) {
      console.log("Using fallback API key for admin alerts");
      resendApiKey = "re_UvtNNEAg_BRoYNCVaKNfZuKgBTdZzotuV";
    }
    
    const resend = new Resend(resendApiKey);
    
    let subject = "";
    let htmlContent = "";
    
    if (type === 'account_created') {
      subject = "🎯 New User Account Created";
      htmlContent = `
        <h2>New Account Alert</h2>
        <p>A new user has created an account on your golf booking platform:</p>
        <ul>
          <li><strong>Email:</strong> ${userEmail}</li>
          <li><strong>Name:</strong> ${userName || 'Not provided'}</li>
          <li><strong>Created:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Check your admin dashboard for more details.</p>
      `;
    } else if (type === 'booking_made') {
      subject = "🏌️ New Golf Booking Made";
      htmlContent = `
        <h2>New Booking Alert</h2>
        <p>A new golf booking has been made:</p>
        <ul>
          <li><strong>Customer:</strong> ${userName || userEmail}</li>
          <li><strong>Email:</strong> ${userEmail}</li>
          <li><strong>Course:</strong> ${bookingDetails?.course}</li>
          <li><strong>Date:</strong> ${bookingDetails?.date}</li>
          <li><strong>Players:</strong> ${bookingDetails?.players}</li>
          <li><strong>Total Price:</strong> $${bookingDetails?.totalPrice}</li>
          <li><strong>Booking ID:</strong> ${bookingDetails?.id}</li>
          <li><strong>Booked:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Check your admin dashboard for more details.</p>
      `;
    }

    console.log("Attempting to send admin email to: support@holezygolf.com");
    console.log("Subject:", subject);

    const emailResponse = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: ["support@holezygolf.com"],
      subject: subject,
      html: htmlContent,
    });

    console.log("Admin alert sent successfully:", JSON.stringify(emailResponse, null, 2));

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-admin-alert function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
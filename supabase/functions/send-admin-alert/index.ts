import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AlertRequest {
  type: 'account_created' | 'booking_made' | 'course_added';
  userEmail?: string;
  userName?: string;
  bookingDetails?: {
    id: string;
    course: string;
    date: string;
    players: number;
    totalPrice: number;
  };
  courseDetails?: {
    name: string;
    city: string;
    state: string;
    facilityId: number;
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
    
    const { type, userEmail, userName, bookingDetails, courseDetails }: AlertRequest = await req.json();
    console.log("Admin alert request:", { type, userEmail, userName, bookingDetails, courseDetails });
    
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
    } else if (type === 'course_added') {
      subject = "⛳ New Custom Golf Course Added";
      htmlContent = `
        <h2>New Course Alert</h2>
        <p>A new custom golf course has been added to the database:</p>
        <ul>
          <li><strong>Course Name:</strong> ${courseDetails?.name}</li>
          <li><strong>Location:</strong> ${courseDetails?.city}, ${courseDetails?.state}</li>
          <li><strong>Facility ID:</strong> ${courseDetails?.facilityId}</li>
          <li><strong>Added:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>You may want to verify this course and add additional details.</p>
      `;
    }

    console.log("Attempting to send admin email to: support@holezygolf.com");
    console.log("Subject:", subject);

    // Retry logic for rate limiting
    let emailResponse;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        emailResponse = await resend.emails.send({
          from: "Holezy Golf <noreply@holezygolf.com>",
          to: ["support@holezygolf.com"],
          subject: subject,
          html: htmlContent,
        });
        
        console.log("Admin alert sent successfully:", JSON.stringify(emailResponse, null, 2));
        break; // Success, exit retry loop
        
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (error.statusCode === 429 || error.name === 'rate_limit_exceeded') {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`Rate limit hit. Retry ${attempt}/${maxRetries} after ${waitTime}ms`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // If not a rate limit error or max retries reached, throw
        throw error;
      }
    }
    
    // If we exhausted retries, log but don't fail the request
    if (!emailResponse && lastError) {
      console.error("Failed to send email after retries:", lastError);
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Email queued for retry",
        error: lastError.message 
      }), {
        status: 202, // Accepted but not processed
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

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
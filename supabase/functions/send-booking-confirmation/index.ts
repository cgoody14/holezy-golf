import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to?: string;
  email?: string;
  firstName: string;
  lastName: string;
  type: 'welcome' | 'booking_confirmation';
  bookingDetails?: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== BOOKING CONFIRMATION EMAIL FUNCTION START ===");
    console.log("Environment check - RESEND_API_KEY exists:", !!Deno.env.get("RESEND_API_KEY"));
    console.log("Available env vars:", Object.keys(Deno.env.toObject()));
    
    const data: EmailRequest = await req.json();
    console.log("Received booking confirmation request:", JSON.stringify(data, null, 2));
    
    const email = data.to || data.email;
    console.log("Extracted email:", email);
    
    if (!email) {
      console.error("No email provided in request");
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if Resend API key is available
    let resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    // Fallback to hardcoded key if environment variable is not set
    if (!resendApiKey) {
      console.log("Using fallback API key");
      resendApiKey = "re_UvtNNEAg_BRoYNCVaKNfZuKgBTdZzotuV";
    }
    
    console.log("Resend API key found:", resendApiKey ? "YES" : "NO");

    // Initialize Resend client with the API key
    const resend = new Resend(resendApiKey);

    let subject: string;
    let html: string;

    if (data.type === 'welcome') {
      subject = "Welcome to GolfBooker!";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to GolfBooker! ⛳</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2 style="color: #374151;">Hello ${data.firstName},</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              Thank you for creating your account with GolfBooker! We're excited to help you discover and book amazing golf experiences.
            </p>
            <p style="color: #6b7280; line-height: 1.6;">
              Your account has been successfully created and you can now:
            </p>
            <ul style="color: #6b7280; line-height: 1.8;">
              <li>Book tee times at premium golf courses</li>
              <li>Manage your bookings and preferences</li>
              <li>Access exclusive member benefits</li>
              <li>Track your golf history</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${req.headers.get('origin') || 'https://app.lovable.dev'}" 
                 style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Start Booking
              </a>
            </div>
            <p style="color: #6b7280; line-height: 1.6;">
              Best regards,<br>
              The GolfBooker Team
            </p>
          </div>
        </div>
      `;
    } else {
      // Booking confirmation
      const bookingData = data.bookingDetails || data;
      subject = "Golf Tee Time Booking Confirmation";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #22c55e; margin-bottom: 10px;">⛳ Booking Confirmed!</h1>
            <p style="color: #666; font-size: 16px;">Your tee time request has been received</p>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">Booking Details</h2>
            <p><strong>Name:</strong> ${data.firstName} ${data.lastName}</p>
            <p><strong>Date:</strong> ${bookingData.date ? new Date(bookingData.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }) : bookingData.booking_date}</p>
            <p><strong>Time Range:</strong> ${bookingData.earliestTime || bookingData.earliest_time} - ${bookingData.latestTime || bookingData.latest_time}</p>
            <p><strong>Players:</strong> ${bookingData.numberOfPlayers || bookingData.number_of_players}</p>
            <p><strong>Course:</strong> ${bookingData.preferredCourse || bookingData.preferred_course}</p>
            <p><strong>Total:</strong> $${bookingData.totalPrice || bookingData.total_price}.00</p>
          </div>
          
          <div style="background: #e0f2fe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #0277bd; margin-top: 0;">What's Next?</h3>
            <ol style="color: #333; line-height: 1.6;">
              <li>We'll contact the golf course to check availability</li>
              <li>You'll receive confirmation with your exact tee time</li>
              <li>Payment will be processed once confirmed</li>
            </ol>
          </div>
          
          <p style="color: #666; text-align: center; margin-top: 30px;">
            Questions? Reply to this email or contact our support team.
          </p>
        </div>
      `;
    }

    console.log(`Attempting to send email to: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log("From address: onboarding@resend.dev");

    // Send email to both the client and admin
    const recipients = [email, "support@holezygolf.com"];
    
    console.log("Sending to recipients:", recipients);

    const emailResponse = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: recipients,
      subject,
      html,
    });

    console.log("Email sent successfully:", JSON.stringify(emailResponse, null, 2));

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending confirmation email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
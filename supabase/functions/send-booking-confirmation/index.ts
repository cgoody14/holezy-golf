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
    const data: EmailRequest = await req.json();

    const email = data.to || data.email;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY environment variable is not set");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

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
      subject = "Holezy Golf Booking Request";
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #22c55e; margin-bottom: 10px;">⛳ Request Received</h1>
            <p style="color: #666; font-size: 16px;">Your tee time request has been received</p>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">Details</h2>
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
            <p><strong>Course Address:</strong> ${bookingData.courseAddress || 'Address pending'}</p>
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
            Questions? Please email support@holezygolf.com for support
          </p>
        </div>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: "Holezy Golf <noreply@holezygolf.com>",
      to: [email],
      subject,
      html,
    });

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
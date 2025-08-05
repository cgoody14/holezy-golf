import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bookingData = await req.json();

    const emailResponse = await resend.emails.send({
      from: "GolfBooker <onboarding@resend.dev>",
      to: [bookingData.email],
      subject: "Golf Tee Time Booking Confirmation",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #22c55e; margin-bottom: 10px;">⛳ Booking Confirmed!</h1>
            <p style="color: #666; font-size: 16px;">Your tee time request has been received</p>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">Booking Details</h2>
            <p><strong>Name:</strong> ${bookingData.firstName} ${bookingData.lastName}</p>
            <p><strong>Date:</strong> ${new Date(bookingData.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
            <p><strong>Time Range:</strong> ${bookingData.earliestTime} - ${bookingData.latestTime}</p>
            <p><strong>Players:</strong> ${bookingData.numberOfPlayers}</p>
            <p><strong>Course:</strong> ${bookingData.preferredCourse}</p>
            <p><strong>Total:</strong> $${bookingData.totalPrice}.00</p>
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
      `,
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
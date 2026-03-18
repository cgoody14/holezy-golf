// ============================================================
// booking-worker/src/notifications.ts
// SMS via Twilio + Email via Resend
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function notifyGolfer(
  pref: any,
  slot: any,
  type: 'booked' | 'failed'
): Promise<void> {
  const { data: golfer } = await supabase
    .from('golfer_profiles')
    .select('full_name, email, phone')
    .eq('id', pref.golfer_id)
    .single()

  if (!golfer) return

  if (type === 'booked') {
    const msg =
      `🏌️ Holezy booked your tee time!\n` +
      `Course: ${slot?.course}\n` +
      `Time: ${new Date(slot?.datetime).toLocaleString()}\n` +
      `Confirmation: ${pref.confirmation_code}\n` +
      `Players: ${pref.player_count}`

    await sendSMS(golfer.phone, msg)
    await sendEmail(golfer.email, golfer.full_name, '⛳ Tee Time Booked!', msg)
  } else {
    const msg =
      `Holezy was unable to book your tee time at the requested course ` +
      `for ${pref.preferred_date}. Please book manually or submit a new request.`

    await sendSMS(golfer.phone, msg)
    await sendEmail(golfer.email, golfer.full_name, 'Booking Failed — Action Required', msg)
  }
}

async function sendSMS(to: string, body: string): Promise<void> {
  if (!process.env.TWILIO_ACCOUNT_SID || !to) return
  try {
    const twilio = (await import('twilio')).default
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await client.messages.create({
      body,
      from: process.env.TWILIO_FROM_NUMBER!,
      to,
    })
  } catch (err) {
    console.error('SMS failed:', err)
  }
}

async function sendEmail(
  to: string,
  name: string,
  subject: string,
  text: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !to) return
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Holezy <bookings@holezy.com>',
      to,
      subject,
      text,
    })
  } catch (err) {
    console.error('Email failed:', err)
  }
}

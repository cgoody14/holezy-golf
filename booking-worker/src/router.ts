// ============================================================
// booking-worker/src/router.ts
// Routes a booking preference to the correct platform adapter
// ============================================================

import { bookChronoGolfWidget } from './adapters/chronogolf'
import { notifyGolfer } from './notifications'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function routeBooking(pref: any, course: any): Promise<void> {
  const adapters: Record<string, Function> = {
    chronogolf: bookChronoGolfWidget,
    // golfnow: bookGolfNow,   ← coming once API access approved
    // foreup:  bookForeUp,    ← coming once API access approved
  }

  const adapter = adapters[course.platform]

  if (!adapter) {
    console.error(`No adapter registered for platform: ${course.platform}`)
    await supabase.from('tee_time_preferences')
      .update({ status: 'failed' }).eq('id', pref.id)
    return
  }

  const result = await adapter(pref, course)

  await supabase.from('booking_attempts').insert({
    preference_id: pref.id,
    platform: course.platform,
    result: result.success ? 'success'
          : result.noAvailability ? 'no_availability'
          : 'error',
    selected_slot: result.slot ?? null,
    confirmation_code: result.confirmationCode ?? null,
    error_message: result.error ?? null,
  })

  if (result.success) {
    await supabase.from('tee_time_preferences').update({
      status: 'booked',
      confirmation_code: result.confirmationCode,
      booked_tee_time: result.slot?.datetime,
    }).eq('id', pref.id)

    await notifyGolfer(pref, result.slot, 'booked')
    console.log(`✅ Booked ${course.name} — ${result.confirmationCode}`)

  } else if (result.noAvailability) {
    console.log(`📭 No availability yet at ${course.name} — scheduler will retry`)

  } else {
    await supabase.from('tee_time_preferences')
      .update({ status: 'failed' }).eq('id', pref.id)
    await notifyGolfer(pref, null, 'failed')
    console.error(`❌ Booking failed: ${result.error}`)
  }
}

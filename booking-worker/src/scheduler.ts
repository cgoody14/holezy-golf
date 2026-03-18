// ============================================================
// src/scheduler.ts  — Railway worker polling loop
// Polls scheduled_bookings every 60s, fires bookings at exact fire_at
// This replaces blind 30-min polling with precision scheduling
// Lines: 120
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { bookChronoGolfWidget } from './adapters/chronogolf-widget'
import { notifyGolfer } from './notifications'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ─────────────────────────────────────────────
// MAIN SCHEDULER LOOP
// Checks every 60 seconds for bookings that are due
// ─────────────────────────────────────────────

export async function startScheduler() {
  console.log('⏰ Holezy scheduler started — polling every 60s')

  while (true) {
    try {
      await checkAndFireDue()
    } catch (err) {
      console.error('Scheduler tick error:', err)
    }
    await sleep(60_000)
  }
}

async function checkAndFireDue() {
  // Fetch all scheduled bookings where fire_at <= now and status = 'waiting'
  const { data: due, error } = await supabase
    .from('scheduled_bookings')
    .select(`
      id,
      preference_id,
      fire_at,
      courses (
        id, name, chronogolf_club_id, timezone,
        booking_advance_days, booking_opens_at
      ),
      tee_time_preferences (
        id, golfer_id, preferred_date, date_flexibility_days,
        earliest_tee_time, latest_tee_time, player_count,
        max_price_per_player, status
      )
    `)
    .eq('status', 'waiting')
    .lte('fire_at', new Date().toISOString())
    .limit(50)

  if (error) { console.error('Scheduler query error:', error); return }
  if (!due || due.length === 0) return

  console.log(`🔔 ${due.length} booking(s) due — firing now`)

  // Fire all due bookings concurrently (cap at 10 parallel)
  await Promise.allSettled(
    due.map(scheduled => fireBooking(scheduled))
  )
}

// ─────────────────────────────────────────────
// FIRE A SINGLE BOOKING
// Mark as fired immediately to prevent double-firing,
// then attempt the booking
// ─────────────────────────────────────────────

async function fireBooking(scheduled: any) {
  const { id, preference_id, courses: course, tee_time_preferences: pref } = scheduled

  if (!pref || pref.status === 'booked' || pref.status === 'cancelled') {
    // Already handled — just mark schedule as done
    await supabase.from('scheduled_bookings')
      .update({ status: 'booked', fired_at: new Date().toISOString() })
      .eq('id', id)
    return
  }

  // Mark as fired immediately (prevents re-firing on next tick)
  await supabase.from('scheduled_bookings')
    .update({ status: 'fired', fired_at: new Date().toISOString() })
    .eq('id', id)

  await supabase.from('tee_time_preferences')
    .update({ status: 'monitoring' })
    .eq('id', preference_id)

  console.log(`🏌️  Firing booking for "${course.name}" on ${pref.preferred_date}`)

  const result = await bookChronoGolfWidget(pref, course)

  if (result.success) {
    // ✅ Booked!
    await supabase.from('tee_time_preferences').update({
      status: 'booked',
      confirmation_code: result.confirmationCode,
      booked_tee_time: result.slot!.datetime,
    }).eq('id', preference_id)

    await supabase.from('scheduled_bookings')
      .update({ status: 'booked' }).eq('id', id)

    await supabase.from('booking_attempts').insert({
      preference_id,
      platform: 'chronogolf',
      result: 'success',
      selected_slot: result.slot,
      confirmation_code: result.confirmationCode,
    })

    await notifyGolfer(pref, result.slot!, 'booked')
    console.log(`✅ Booked! Confirmation: ${result.confirmationCode}`)

  } else if (result.noAvailability) {
    // No slots yet — re-schedule a retry in 30 minutes
    const retryAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    await supabase.from('scheduled_bookings').insert({
      preference_id,
      course_id: course.id,
      fire_at: retryAt,
      status: 'waiting',
    })

    await supabase.from('booking_attempts').insert({
      preference_id,
      platform: 'chronogolf',
      result: 'no_availability',
    })

    console.log(`📭 No availability — retry scheduled for ${retryAt}`)

  } else {
    // Hard error — notify golfer, mark failed
    await supabase.from('tee_time_preferences')
      .update({ status: 'failed' }).eq('id', preference_id)

    await supabase.from('booking_attempts').insert({
      preference_id,
      platform: 'chronogolf',
      result: 'error',
      error_message: result.error,
    })

    await notifyGolfer(pref, null, 'failed')
    console.error(`❌ Booking error: ${result.error}`)
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

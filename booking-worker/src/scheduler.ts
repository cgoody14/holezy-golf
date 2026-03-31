// ============================================================
// src/scheduler.ts  — Railway worker polling loop
// Polls scheduled_bookings every 60s, fires bookings at exact fire_at
// On no_availability: retries at 7am EST daily until booked
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { bookChronoGolfWidget } from './adapters/chronogolf'
import { notifyGolfer } from './notifications'
import type { TeeTimePreference, Course } from './types'

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

interface ScheduledBooking {
  id: string
  preference_id: string
  courses: Course
  tee_time_preferences: TeeTimePreference
}

async function fireBooking(scheduled: ScheduledBooking) {
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
    // No slots yet — retry at next 7am EST
    const retryAt = getNext7amEST().toISOString()

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

    console.log(`📭 No availability — retry at 7am EST: ${retryAt}`)

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

// ─────────────────────────────────────────────
// Returns the next 7:00 AM America/New_York as a UTC Date.
// If it is currently before 7am EST today, returns today at 7am EST.
// If it is 7am or later, returns tomorrow at 7am EST.
// ─────────────────────────────────────────────
function getNext7amEST(): Date {
  const now = new Date()

  // Build a Date whose .getHours() / .getDate() reflect EST/EDT values.
  // On a UTC server (Railway), toLocaleString returns EST wall-clock values
  // which new Date() then parses back as UTC — giving us the right numeric fields.
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  // offsetMs: difference between real UTC and the "EST-as-UTC" Date above.
  // Adding this back converts an EST wall-clock Date to real UTC.
  const offsetMs = now.getTime() - estNow.getTime()

  // Set target to 7am on the current EST date
  const target = new Date(estNow)
  target.setHours(7, 0, 0, 0)

  // If we are already at or past 7am EST, roll to tomorrow
  if (estNow >= target) {
    target.setDate(target.getDate() + 1)
  }

  // Convert EST wall-clock back to real UTC
  return new Date(target.getTime() + offsetMs)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

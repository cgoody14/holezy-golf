// ============================================================
// src/adapters/chronogolf-widget.ts
// Uses ChronoGolf's own widget API endpoints (no partner key needed)
// Intercepts the same calls their booking widget makes in the browser
// ============================================================
// Lines: 310

import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
import type { TeeTimePreference, Course, BookingResult } from '../types'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ─────────────────────────────────────────────
// LOCAL TYPES
// ─────────────────────────────────────────────

interface GolferCredentials {
  email: string
  password: string                // stored encrypted in Supabase vault
}

interface TeeTimeSlot {
  id: string
  start_time: string              // ISO datetime
  green_fee: number
  available_spots: number
  rate_type: string
}

// ─────────────────────────────────────────────
// WIDGET API BASE
// The widget loads from cdn2.chronogolf.com/widgets/v2
// and calls these undocumented-but-stable endpoints
// ─────────────────────────────────────────────

const CHRONO_BASE = 'https://www.chronogolf.com'

// Headers that mimic the widget's own requests
const WIDGET_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': 'https://www.chronogolf.com',
  'Referer': 'https://www.chronogolf.com/',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
}

// ─────────────────────────────────────────────
// STEP 1: Authenticate golfer → get session token
// Widget login endpoint (same one their login modal uses)
// ─────────────────────────────────────────────

async function loginGolfer(creds: GolferCredentials): Promise<string | null> {
  try {
    const res = await fetch(`${CHRONO_BASE}/users/sign_in.json`, {
      method: 'POST',
      headers: WIDGET_HEADERS,
      body: JSON.stringify({
        user: {
          email: creds.email,
          password: creds.password,
          remember_me: true,
        }
      }),
    })

    if (!res.ok) {
      console.error('ChronoGolf login failed:', res.status)
      return null
    }

    const data = await res.json() as any

    // Token is returned in the response body AND as a cookie
    // We store the auth_token for subsequent requests
    const token = data.authentication_token || data.user?.authentication_token
    return token ?? null

  } catch (err) {
    console.error('Login error:', err)
    return null
  }
}

// ─────────────────────────────────────────────
// STEP 2: Fetch available tee times for a date
// This is the same call the widget makes when you pick a date
// ─────────────────────────────────────────────

async function fetchAvailability(
  clubId: string,
  date: string,           // "YYYY-MM-DD"
  players: number,
  authToken: string,
): Promise<TeeTimeSlot[]> {
  const params = new URLSearchParams({
    date,
    nb_holes: '18',
    nb_players: String(players),
  })

  const res = await fetch(
    `${CHRONO_BASE}/api/v1/clubs/${clubId}/tee_times?${params}`,
    {
      headers: {
        ...WIDGET_HEADERS,
        'X-User-Token': authToken,
      },
    }
  )

  if (!res.ok) {
    console.error(`Availability fetch failed for club ${clubId} on ${date}:`, res.status)
    return []
  }

  const data = await res.json() as any[]

  // Normalize the response into our TeeTimeSlot shape
  return data.map((slot: any) => ({
    id: slot.id,
    start_time: slot.start_time,
    green_fee: slot.green_fee_per_player ?? slot.price ?? 0,
    available_spots: slot.available_spots ?? slot.nb_available_spots ?? 4,
    rate_type: slot.rate_type ?? 'standard',
  }))
}

// ─────────────────────────────────────────────
// STEP 3: Filter slots to the golfer's preference window
// ─────────────────────────────────────────────

function filterSlots(
  slots: TeeTimeSlot[],
  pref: TeeTimePreference,
): TeeTimeSlot[] {
  const [eH, eM] = pref.earliest_tee_time.split(':').map(Number)
  const [lH, lM] = pref.latest_tee_time.split(':').map(Number)
  const earliestMins = eH * 60 + eM
  const latestMins = lH * 60 + lM

  return slots.filter(slot => {
    const d = new Date(slot.start_time)
    const slotMins = d.getHours() * 60 + d.getMinutes()

    const inWindow = slotMins >= earliestMins && slotMins <= latestMins
    const hasSpots = slot.available_spots >= pref.player_count
    const withinPrice = pref.max_price_per_player === null
      || slot.green_fee <= pref.max_price_per_player

    return inWindow && hasSpots && withinPrice
  })
}

// ─────────────────────────────────────────────
// STEP 4: Lock/reserve the tee time
// Widget calls this to hold the slot before payment
// ─────────────────────────────────────────────

async function reserveSlot(
  clubId: string,
  slot: TeeTimeSlot,
  pref: TeeTimePreference,
  authToken: string,
): Promise<{ reservationId: string } | null> {
  const res = await fetch(
    `${CHRONO_BASE}/api/v1/clubs/${clubId}/reservations`,
    {
      method: 'POST',
      headers: {
        ...WIDGET_HEADERS,
        'X-User-Token': authToken,
      },
      body: JSON.stringify({
        reservation: {
          tee_time_id: slot.id,
          nb_players: pref.player_count,
          nb_holes: 18,
        }
      })
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('Reserve failed:', err)
    return null
  }

  const data = await res.json() as any
  return { reservationId: data.id ?? data.reservation?.id }
}

// ─────────────────────────────────────────────
// STEP 5: Confirm and pay the reservation
// Golfer's saved payment method on their ChronoGolf account is used
// ─────────────────────────────────────────────

async function confirmReservation(
  clubId: string,
  reservationId: string,
  authToken: string,
): Promise<{ confirmationCode: string } | null> {
  const res = await fetch(
    `${CHRONO_BASE}/api/v1/clubs/${clubId}/reservations/${reservationId}/confirm`,
    {
      method: 'POST',
      headers: {
        ...WIDGET_HEADERS,
        'X-User-Token': authToken,
      },
      body: JSON.stringify({
        payment_method: 'saved_card', // uses card on file in golfer's account
      })
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('Confirm failed:', err)
    return null
  }

  const data = await res.json() as any
  const code = data.confirmation_number
    ?? data.reservation?.confirmation_number
    ?? data.booking_number
    ?? reservationId  // fallback: use reservation ID as reference

  return { confirmationCode: String(code) }
}

// ─────────────────────────────────────────────
// MAIN EXPORTED ADAPTER
// Called by the booking router in Railway worker
// ─────────────────────────────────────────────

export async function bookChronoGolfWidget(
  pref: TeeTimePreference,
  course: Course,
): Promise<BookingResult> {
  // 1. Fetch golfer credentials from Supabase vault
  const { data: golferData } = await supabase
    .from('golfer_profiles')
    .select('chronogolf_email, chronogolf_password_encrypted')
    .eq('id', pref.golfer_id)
    .single()

  if (!golferData?.chronogolf_email) {
    return { success: false, error: 'No ChronoGolf credentials on file for golfer' }
  }

  // 2. Decrypt password (stored via Supabase Vault or pgcrypto)
  const { data: decrypted } = await supabase.rpc('decrypt_credential', {
    encrypted_value: golferData.chronogolf_password_encrypted
  })

  // 3. Login
  const token = await loginGolfer({
    email: golferData.chronogolf_email,
    password: decrypted,
  })

  if (!token) {
    return { success: false, error: 'ChronoGolf login failed — check credentials' }
  }

  // 4. Build list of dates to try (preferred + flexibility window)
  const datesToTry: string[] = []
  for (let i = 0; i <= pref.date_flexibility_days; i++) {
    const d = new Date(pref.preferred_date)
    d.setDate(d.getDate() + i)
    datesToTry.push(d.toISOString().split('T')[0])
  }

  // 5. Check each date
  for (const date of datesToTry) {
    const slots = await fetchAvailability(
      course.chronogolf_club_id,
      date,
      pref.player_count,
      token,
    )

    const eligible = filterSlots(slots, pref)

    if (eligible.length === 0) {
      console.log(`No eligible slots on ${date} at ${course.name}`)
      continue
    }

    // Pick first eligible slot (earliest in window)
    const best = eligible[0]
    console.log(`Found slot: ${best.start_time} @ $${best.green_fee}/player`)

    // 6. Reserve
    const reservation = await reserveSlot(
      course.chronogolf_club_id,
      best,
      pref,
      token,
    )

    if (!reservation) {
      console.log('Reservation failed — slot may have been taken, will retry')
      continue
    }

    // 7. Confirm
    const confirmation = await confirmReservation(
      course.chronogolf_club_id,
      reservation.reservationId,
      token,
    )

    if (!confirmation) {
      return { success: false, error: 'Reservation held but payment confirmation failed' }
    }

    return {
      success: true,
      confirmationCode: confirmation.confirmationCode,
      slot: {
        datetime: best.start_time,
        course: course.name,
        fee: best.green_fee,
      }
    }
  }

  return { success: false, noAvailability: true }
}

// ─────────────────────────────────────────────
// HELPER: Find a course's clubId from their website URL
// ChronoGolf club IDs are embedded in the widget script tag
// Example: window.chronogolfSettings = { clubId: "1234" }
// You can find this by viewing source on any course's booking page
// Store discovered IDs in the courses table: chronogolf_club_id
// ─────────────────────────────────────────────

export async function discoverClubId(courseWebsiteUrl: string): Promise<string | null> {
  // Fetch course website HTML, look for chronogolfSettings clubId
  const res = await fetch(courseWebsiteUrl, {
    headers: { 'User-Agent': WIDGET_HEADERS['User-Agent'] }
  })
  const html = await res.text()

  const match = html.match(/["']?clubId["']?\s*:\s*["']?(\d+)["']?/)
  return match ? match[1] : null
}

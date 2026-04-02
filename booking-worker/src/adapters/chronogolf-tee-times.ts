// ============================================================
// src/adapters/chronogolf-tee-times.ts
//
// Standalone module for fetching tee time availability from
// the ChronoGolf widget API. No Supabase dependency — works
// with just a club ID and optional auth token.
//
// Usage (no auth — public availability):
//   import { fetchTeeTimes } from './chronogolf-tee-times'
//   const slots = await fetchTeeTimes({ clubId: '1234', date: '2026-04-10', players: 2 })
//
// Usage (authenticated — required by some private clubs):
//   import { loginGolfer, fetchTeeTimes } from './chronogolf-tee-times'
//   const token = await loginGolfer({ email: '...', password: '...' })
//   const slots = await fetchTeeTimes({ clubId: '1234', date: '2026-04-10', players: 2, authToken: token })
//
// Run as a script:
//   npx ts-node src/adapters/chronogolf-tee-times.ts
// ============================================================

import fetch from 'node-fetch'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface TeeTimeSlot {
  id: string
  start_time: string        // ISO datetime, e.g. "2026-04-10T08:00:00-05:00"
  green_fee: number         // per-player green fee in dollars
  available_spots: number   // how many spots remain in this group
  nb_holes: number          // 9 or 18
  rate_type: string         // e.g. "standard", "twilight", "senior"
  raw: Record<string, unknown>  // the full original API response object
}

export interface FetchTeeTimesOptions {
  clubId: string            // ChronoGolf club ID (numeric string)
  date: string              // "YYYY-MM-DD"
  players?: number          // default: 1
  nbHoles?: 9 | 18          // default: 18
  authToken?: string | null // optional — some clubs require a logged-in user
}

export interface LoginCredentials {
  email: string
  password: string
}

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const CHRONO_BASE = 'https://www.chronogolf.com'

const BASE_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': 'https://www.chronogolf.com',
  'Referer': 'https://www.chronogolf.com/',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

// ─────────────────────────────────────────────
// AUTHENTICATION
// Logs in to ChronoGolf and returns an auth token.
// Only required for clubs that restrict availability to members,
// or when you need to proceed to booking.
// ─────────────────────────────────────────────

export async function loginGolfer(creds: LoginCredentials): Promise<string | null> {
  const res = await fetch(`${CHRONO_BASE}/users/sign_in.json`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify({
      user: {
        email: creds.email,
        password: creds.password,
        remember_me: true,
      },
    }),
  })

  if (!res.ok) {
    console.error(`ChronoGolf login failed: ${res.status} ${res.statusText}`)
    return null
  }

  const data = await res.json() as Record<string, any>
  const token = data.authentication_token ?? data.user?.authentication_token ?? null

  if (!token) {
    console.error('Login succeeded but no authentication_token in response:', Object.keys(data))
  }

  return token
}

// ─────────────────────────────────────────────
// FETCH TEE TIMES
// Returns normalized tee time slots for a given club, date, and player count.
// Auth token is optional — most public clubs return results without it.
// ─────────────────────────────────────────────

export async function fetchTeeTimes(opts: FetchTeeTimesOptions): Promise<TeeTimeSlot[]> {
  const { clubId, date, players = 1, nbHoles = 18, authToken = null } = opts

  const params = new URLSearchParams({
    date,
    nb_holes: String(nbHoles),
    nb_players: String(players),
  })

  const url = `${CHRONO_BASE}/api/v1/clubs/${clubId}/tee_times?${params}`

  const headers: Record<string, string> = { ...BASE_HEADERS }
  if (authToken) {
    headers['X-User-Token'] = authToken
  }

  const res = await fetch(url, { headers })

  if (!res.ok) {
    const body = await res.text()
    console.error(`fetchTeeTimes failed for club ${clubId} on ${date}: ${res.status}`)
    console.error('Response body:', body.slice(0, 500))
    return []
  }

  const raw = await res.json() as any
  const slots: any[] = Array.isArray(raw) ? raw : (raw.tee_times ?? raw.results ?? [])

  return slots.map((slot: any): TeeTimeSlot => ({
    id: String(slot.id ?? ''),
    start_time: slot.start_time ?? slot.datetime ?? slot.tee_time ?? '',
    green_fee: slot.green_fee_per_player ?? slot.price ?? slot.green_fee ?? 0,
    available_spots: slot.available_spots ?? slot.nb_available_spots ?? 4,
    nb_holes: slot.nb_holes ?? nbHoles,
    rate_type: slot.rate_type ?? slot.rate?.name ?? 'standard',
    raw: slot,
  }))
}

// ─────────────────────────────────────────────
// FETCH TEE TIMES ACROSS MULTIPLE DATES
// Convenience wrapper for fetching a date range at once.
// ─────────────────────────────────────────────

export async function fetchTeeTimesRange(opts: Omit<FetchTeeTimesOptions, 'date'> & {
  startDate: string   // "YYYY-MM-DD"
  days: number        // number of days to look ahead (inclusive)
}): Promise<Map<string, TeeTimeSlot[]>> {
  const { startDate, days, ...rest } = opts
  const results = new Map<string, TeeTimeSlot[]>()

  const start = new Date(startDate)

  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const slots = await fetchTeeTimes({ ...rest, date: dateStr })
    results.set(dateStr, slots)
  }

  return results
}

// ─────────────────────────────────────────────
// FILTER HELPERS
// ─────────────────────────────────────────────

export interface TeeTimeFilter {
  earliestTime?: string   // "HH:MM" — inclusive
  latestTime?: string     // "HH:MM" — inclusive
  minSpots?: number       // minimum available spots needed
  maxFee?: number         // maximum green fee per player
}

export function filterTeeTimes(slots: TeeTimeSlot[], filter: TeeTimeFilter): TeeTimeSlot[] {
  return slots.filter(slot => {
    const d = new Date(slot.start_time)
    const slotMins = d.getHours() * 60 + d.getMinutes()

    if (filter.earliestTime) {
      const [h, m] = filter.earliestTime.split(':').map(Number)
      if (slotMins < h * 60 + m) return false
    }
    if (filter.latestTime) {
      const [h, m] = filter.latestTime.split(':').map(Number)
      if (slotMins > h * 60 + m) return false
    }
    if (filter.minSpots !== undefined && slot.available_spots < filter.minSpots) return false
    if (filter.maxFee !== undefined && slot.green_fee > filter.maxFee) return false

    return true
  })
}

// ─────────────────────────────────────────────
// STANDALONE SCRIPT ENTRYPOINT
// Run with: npx ts-node src/adapters/chronogolf-tee-times.ts
// Override defaults via environment:
//   CLUB_ID=1234 DATE=2026-04-15 PLAYERS=4 ts-node ...
// ─────────────────────────────────────────────

if (require.main === module) {
  ;(async () => {
    const clubId = process.env.CLUB_ID ?? '1'          // use a real club ID
    const players = Number(process.env.PLAYERS ?? '2')
    const date = process.env.DATE ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      return d.toISOString().split('T')[0]
    })()

    console.log(`\nChronoGolf Tee Time Fetch`)
    console.log(`Club: ${clubId}  Date: ${date}  Players: ${players}`)
    console.log('─'.repeat(50))

    // Optional: authenticate first
    let authToken: string | null = null
    if (process.env.CG_EMAIL && process.env.CG_PASSWORD) {
      console.log(`Logging in as ${process.env.CG_EMAIL}...`)
      authToken = await loginGolfer({
        email: process.env.CG_EMAIL,
        password: process.env.CG_PASSWORD,
      })
      console.log(authToken ? 'Authenticated.' : 'Login failed — continuing unauthenticated.')
    }

    const slots = await fetchTeeTimes({ clubId, date, players, authToken })

    if (slots.length === 0) {
      console.log('No tee times returned. The club may require auth, or has no availability.')
      process.exit(0)
    }

    console.log(`\n${slots.length} tee time(s) available:\n`)
    for (const slot of slots) {
      const time = new Date(slot.start_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      const spots = `${slot.available_spots} spot${slot.available_spots !== 1 ? 's' : ''}`
      const fee = slot.green_fee ? `$${slot.green_fee.toFixed(2)}/player` : 'fee unknown'
      console.log(`  ${time}  ${fee}  ${spots}  [${slot.rate_type}]`)
    }

    // Example: filter to morning slots under $80
    const morning = filterTeeTimes(slots, {
      earliestTime: '07:00',
      latestTime: '12:00',
      maxFee: 80,
    })
    if (morning.length && morning.length < slots.length) {
      console.log(`\nFiltered to morning slots (7am–12pm, ≤$80): ${morning.length} match(es)`)
    }
  })().catch(console.error)
}

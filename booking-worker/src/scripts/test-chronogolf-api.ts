// ============================================================
// Quick test — hits ChronoGolf's widget API endpoints and
// prints raw responses so you can verify field shapes.
// Run: npx ts-node src/scripts/test-chronogolf-api.ts
// No Supabase needed.
// ============================================================

import fetch from 'node-fetch'

const CHRONO_BASE = 'https://www.chronogolf.com'
const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.chronogolf.com/',
}

async function testClubList() {
  console.log('\n=== STEP 1: Fetch first page of clubs ===')
  const url = `${CHRONO_BASE}/api/v1/clubs?page=1&per_page=5&online_booking=true`
  console.log(`GET ${url}`)

  const res = await fetch(url, { headers: HEADERS })
  console.log(`Status: ${res.status} ${res.statusText}`)
  console.log(`Content-Type: ${res.headers.get('content-type')}`)

  if (!res.ok) {
    console.error('Failed to fetch club list')
    return null
  }

  const raw = await res.json() as any
  const clubs = Array.isArray(raw) ? raw : (raw.clubs ?? raw.results ?? raw)
  console.log(`\nResponse type: ${Array.isArray(raw) ? 'array' : 'object'}`)
  if (!Array.isArray(raw)) {
    console.log('Top-level keys:', Object.keys(raw))
  }
  console.log(`Clubs returned: ${clubs.length}`)

  if (clubs.length > 0) {
    console.log('\nFirst club (raw):')
    console.log(JSON.stringify(clubs[0], null, 2))
    console.log('\nAll club names:')
    clubs.forEach((c: any) => console.log(`  [${c.id}] ${c.name} — ${c.city}, ${c.state_province}`))
  }

  return clubs
}

async function testClubDetail(clubId: number, clubName: string) {
  console.log(`\n=== STEP 2: Probe club detail for "${clubName}" (id: ${clubId}) ===`)
  const url = `${CHRONO_BASE}/api/v1/clubs/${clubId}`
  console.log(`GET ${url}`)

  const res = await fetch(url, { headers: HEADERS })
  console.log(`Status: ${res.status} ${res.statusText}`)

  if (!res.ok) {
    console.error('Failed to fetch club detail')
    return
  }

  const data = await res.json() as any
  console.log('\nFull response:')
  console.log(JSON.stringify(data, null, 2))

  // Check the specific fields we rely on
  console.log('\n--- Field check ---')
  console.log('booking_advance_days (direct):        ', data.booking_advance_days ?? 'MISSING')
  console.log('days_in_advance (direct):             ', data.days_in_advance ?? 'MISSING')
  console.log('booking_settings.advance_booking_days:', data.booking_settings?.advance_booking_days ?? 'MISSING')
  console.log('online_booking.advance_booking_days:  ', data.online_booking?.advance_booking_days ?? 'MISSING')
  console.log('booking_opens_at (direct):            ', data.booking_opens_at ?? 'MISSING')
  console.log('booking_settings.booking_opens_at:    ', data.booking_settings?.booking_opens_at ?? 'MISSING')
  console.log('cancellation_hours (direct):          ', data.cancellation_hours ?? 'MISSING')
}

async function testTeeTimeAvailability(clubId: number, clubName: string) {
  // Try 7 days from now — likely to have some availability
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const dateStr = date.toISOString().split('T')[0]

  console.log(`\n=== STEP 3: Fetch tee time availability for "${clubName}" on ${dateStr} ===`)
  const params = new URLSearchParams({ date: dateStr, nb_holes: '18', nb_players: '2' })
  const url = `${CHRONO_BASE}/api/v1/clubs/${clubId}/tee_times?${params}`
  console.log(`GET ${url}`)

  const res = await fetch(url, { headers: HEADERS })
  console.log(`Status: ${res.status} ${res.statusText}`)

  if (!res.ok) {
    const body = await res.text()
    console.error('Failed:', body.slice(0, 300))
    return
  }

  const data = await res.json() as any
  const slots = Array.isArray(data) ? data : (data.tee_times ?? data.results ?? [])
  console.log(`Slots returned: ${slots.length}`)

  if (slots.length > 0) {
    console.log('\nFirst slot (raw):')
    console.log(JSON.stringify(slots[0], null, 2))
    console.log('\nAll slots:')
    slots.slice(0, 10).forEach((s: any) => {
      const time = s.start_time ?? s.datetime ?? s.tee_time
      const fee = s.green_fee_per_player ?? s.price ?? s.green_fee ?? '?'
      const spots = s.available_spots ?? s.nb_available_spots ?? '?'
      console.log(`  ${time}  $${fee}/player  ${spots} spots`)
    })
    if (slots.length > 10) console.log(`  ... and ${slots.length - 10} more`)
  } else {
    console.log('No slots available (course may require auth or have no openings)')
  }
}

async function main() {
  console.log('ChronoGolf API Test')
  console.log('===================')

  const clubs = await testClubList()
  if (!clubs || clubs.length === 0) {
    console.error('\nCould not fetch club list — API may be blocked or changed.')
    process.exit(1)
  }

  const first = clubs[0]
  await testClubDetail(first.id, first.name)
  await testTeeTimeAvailability(first.id, first.name)

  console.log('\n=== Done ===')
}

main().catch(console.error)

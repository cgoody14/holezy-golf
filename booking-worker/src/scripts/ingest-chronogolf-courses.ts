// ============================================================
// scripts/ingest-all-chronogolf-courses.ts
// One-time + nightly sync of all ~13,730 ChronoGolf courses
// Crawls their marketplace, probes each club's booking window,
// stores everything in Supabase courses table
// Run: npx ts-node scripts/ingest-all-chronogolf-courses.ts
// Lines: 380
// ============================================================

import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
import pLimit from 'p-limit'   // npm install p-limit
import pRetry from 'p-retry'  // npm install p-retry

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const CHRONO_BASE   = 'https://www.chronogolf.com'
const PAGE_SIZE     = 25       // ChronoGolf returns 25 clubs per page
const TOTAL_COURSES = 13730    // from /en/locations — update if it changes
const TOTAL_PAGES   = Math.ceil(TOTAL_COURSES / PAGE_SIZE)  // 550 pages

const CONCURRENCY   = 5        // parallel requests — stay polite, don't hammer
const DELAY_MS      = 500      // ms between page fetches
const CLUB_DELAY_MS = 200      // ms between individual club probes

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.chronogolf.com/',
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface RawClub {
  id: number
  name: string
  slug: string
  city: string
  state_province: string
  country: string
  latitude: number
  longitude: number
  online_booking_enabled: boolean
  timezone: string
}

interface ClubDetail {
  id: number
  name: string
  slug: string
  city: string
  state_province: string
  country: string
  latitude: number
  longitude: number
  timezone: string
  online_booking_enabled: boolean
  booking_advance_days: number | null
  booking_opens_at: string | null     // "HH:MM" in course local time
  cancellation_hours: number | null
  website_url: string | null
  phone: string | null
  holes: number | null
}

// ─────────────────────────────────────────────
// STEP 1: Fetch one page of clubs from the marketplace
// ChronoGolf's /en/locations page uses this endpoint
// ─────────────────────────────────────────────

async function fetchClubsPage(page: number): Promise<RawClub[]> {
  return pRetry(async () => {
    const res = await fetch(
      `${CHRONO_BASE}/api/v1/clubs?page=${page}&per_page=${PAGE_SIZE}&online_booking=true`,
      { headers: HEADERS }
    )

    if (res.status === 429) {
      // Rate limited — back off and retry
      await sleep(5000)
      throw new Error('Rate limited')
    }

    if (!res.ok) throw new Error(`Page ${page} failed: ${res.status}`)

    const data = await res.json() as any
    // Response is either array directly or { clubs: [...] }
    return Array.isArray(data) ? data : (data.clubs ?? data.results ?? [])
  }, {
    retries: 3,
    onFailedAttempt: (err) => {
      console.warn(`Page ${page} attempt ${err.attemptNumber} failed: ${err.message}`)
    }
  })
}

// ─────────────────────────────────────────────
// STEP 2: Probe a single club for its booking window config
// This is the same call the widget makes on first load
// ─────────────────────────────────────────────

async function probeClubBookingWindow(clubId: number): Promise<{
  booking_advance_days: number | null
  booking_opens_at: string | null
  cancellation_hours: number | null
}> {
  return pRetry(async () => {
    const res = await fetch(
      `${CHRONO_BASE}/api/v1/clubs/${clubId}`,
      { headers: HEADERS }
    )

    if (!res.ok) return {
      booking_advance_days: null,
      booking_opens_at: null,
      cancellation_hours: null,
    }

    const data = await res.json() as any

    // Field names vary — handle multiple possible shapes
    const advanceDays =
      data.booking_settings?.advance_booking_days ??
      data.online_booking?.advance_booking_days ??
      data.advance_booking_days ??
      data.days_in_advance ??
      null

    const opensAt =
      data.booking_settings?.booking_opens_at ??
      data.online_booking?.booking_opens_at ??
      data.booking_opens_at ??
      null

    const cancelHours =
      data.booking_settings?.cancellation_hours_before ??
      data.cancellation_policy?.hours_before ??
      data.cancellation_hours ??
      null

    return {
      booking_advance_days: advanceDays ? Number(advanceDays) : null,
      booking_opens_at: opensAt ?? null,
      cancellation_hours: cancelHours ? Number(cancelHours) : null,
    }
  }, {
    retries: 2,
    onFailedAttempt: () => {} // silent retry for individual clubs
  })
}

// ─────────────────────────────────────────────
// STEP 3: Upsert a batch of clubs into Supabase
// Uses upsert so re-runs are safe (idempotent)
// ─────────────────────────────────────────────

async function upsertCourses(clubs: ClubDetail[]): Promise<void> {
  if (clubs.length === 0) return

  const rows = clubs.map(c => ({
    chronogolf_club_id: String(c.id),
    name: c.name,
    slug: c.slug,
    city: c.city,
    state_province: c.state_province,
    country: c.country,
    latitude: c.latitude,
    longitude: c.longitude,
    timezone: c.timezone || 'America/New_York',
    platform: 'chronogolf',
    online_booking_enabled: c.online_booking_enabled,
    booking_advance_days: c.booking_advance_days,
    booking_opens_at: c.booking_opens_at,
    cancellation_hours: c.cancellation_hours,
    website_url: c.website_url,
    phone: c.phone,
    holes: c.holes,
    last_synced_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('courses')
    .upsert(rows, {
      onConflict: 'chronogolf_club_id',
      ignoreDuplicates: false,  // always update booking window fields
    })

  if (error) {
    console.error('Upsert error:', error.message)
    throw error
  }
}

// ─────────────────────────────────────────────
// STEP 4: Process a full page — fetch list + probe each club
// ─────────────────────────────────────────────

async function processPage(page: number, clubLimit: ReturnType<typeof pLimit>): Promise<number> {
  const rawClubs = await fetchClubsPage(page)
  if (rawClubs.length === 0) return 0

  // Probe all clubs on this page with concurrency limit
  const detailed: ClubDetail[] = await Promise.all(
    rawClubs.map(club =>
      clubLimit(async () => {
        await sleep(CLUB_DELAY_MS)
        const window = await probeClubBookingWindow(club.id)
        return {
          ...club,
          ...window,
          website_url: `https://www.chronogolf.com/club/${club.slug}`,
          phone: null,
          holes: null,
        } as ClubDetail
      })
    )
  )

  await upsertCourses(detailed)
  return detailed.length
}

// ─────────────────────────────────────────────
// MAIN: Full ingestion run
// ─────────────────────────────────────────────

async function ingestAllCourses() {
  console.log(`\n🏌️  Holezy — ChronoGolf Course Ingestion`)
  console.log(`   Target: ~${TOTAL_COURSES} courses across ${TOTAL_PAGES} pages`)
  console.log(`   Concurrency: ${CONCURRENCY} parallel page fetches\n`)

  const pageLimit  = pLimit(CONCURRENCY)
  const clubLimit  = pLimit(10)  // 10 concurrent club probes per page

  let totalIngested = 0
  let errors = 0
  const startTime = Date.now()

  // Process pages in batches to avoid memory pressure
  const BATCH_SIZE = 20
  for (let batchStart = 1; batchStart <= TOTAL_PAGES; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_PAGES)
    const pages = Array.from(
      { length: batchEnd - batchStart + 1 },
      (_, i) => batchStart + i
    )

    const results = await Promise.allSettled(
      pages.map(page =>
        pageLimit(async () => {
          await sleep(DELAY_MS * (page % CONCURRENCY))  // stagger starts
          return processPage(page, clubLimit)
        })
      )
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalIngested += result.value
      } else {
        errors++
        console.error('Page error:', result.reason?.message)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const pagesLeft = TOTAL_PAGES - batchEnd
    const rate = totalIngested / Number(elapsed)
    const eta = pagesLeft > 0 ? Math.round((pagesLeft * PAGE_SIZE) / rate) : 0

    console.log(
      `   ✓ Pages ${batchStart}–${batchEnd} done | ` +
      `${totalIngested} courses | ` +
      `${elapsed}s elapsed | ` +
      `ETA: ~${eta}s remaining`
    )
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n✅ Ingestion complete!`)
  console.log(`   ${totalIngested} courses loaded in ${totalTime}s`)
  console.log(`   ${errors} page errors`)
  console.log(`   Run the scheduler migration to activate booking windows\n`)
}

// ─────────────────────────────────────────────
// NIGHTLY SYNC (partial update — only changed courses)
// Runs every night at 2am via Railway cron
// Only re-probes courses where booking window is null or older than 30 days
// ─────────────────────────────────────────────

export async function nightlySync() {
  console.log('🌙 Nightly ChronoGolf sync starting...')

  // Find courses that need a refresh
  const { data: stale } = await supabase
    .from('courses')
    .select('chronogolf_club_id, name')
    .eq('platform', 'chronogolf')
    .or('booking_advance_days.is.null,last_synced_at.lt.' +
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500)

  if (!stale || stale.length === 0) {
    console.log('✓ All courses up to date')
    return
  }

  console.log(`Re-probing ${stale.length} stale courses...`)

  const limit = pLimit(5)
  const updated = await Promise.all(
    stale.map(course =>
      limit(async () => {
        const clubId = Number(course.chronogolf_club_id)
        const window = await probeClubBookingWindow(clubId)
        return { chronogolf_club_id: course.chronogolf_club_id, ...window,
                 last_synced_at: new Date().toISOString() }
      })
    )
  )

  const { error } = await supabase
    .from('courses')
    .upsert(updated, { onConflict: 'chronogolf_club_id' })

  if (error) console.error('Nightly sync error:', error)
  else console.log(`✓ ${updated.length} courses refreshed`)
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────

ingestAllCourses().catch(console.error)

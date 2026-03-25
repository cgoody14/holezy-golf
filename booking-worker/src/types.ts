// ============================================================
// booking-worker/src/types.ts
// Shared types for the Holezy booking worker
// ============================================================

export interface TeeTimePreference {
  id: string
  golfer_id: string
  course_id?: string
  preferred_date: string            // "YYYY-MM-DD"
  date_flexibility_days: number
  earliest_tee_time: string         // "HH:MM"
  latest_tee_time: string           // "HH:MM"
  player_count: number
  max_price_per_player: number | null
  confirmation_code?: string
  status?: string
}

export interface Course {
  id: string
  name: string
  chronogolf_club_id: string
  timezone: string
  platform?: string
  booking_advance_days?: number
  booking_opens_at?: string
}

export interface BookingSlot {
  datetime: string
  course: string
  fee: number
}

export interface BookingResult {
  success: boolean
  noAvailability?: boolean
  confirmationCode?: string
  slot?: BookingSlot
  error?: string
}

export interface GolferProfile {
  full_name: string
  email: string
  phone: string
}

export type BookingAdapterFn = (
  pref: TeeTimePreference,
  course: Course,
) => Promise<BookingResult>

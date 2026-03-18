// ============================================================
// Custom Playwright adapter registry
// For courses not on ChronoGolf, GolfNow, or foreUP
// Add one-off scripts here keyed by course UUID from Supabase
// ============================================================

// import { bookExampleCourse } from './scripts/example-course'

export const CUSTOM_SCRIPTS: Record<string, Function> = {
  // 'supabase-course-uuid': bookExampleCourse,
}

export async function bookCustom(pref: any, course: any): Promise<any> {
  const script = CUSTOM_SCRIPTS[course.id]
  if (!script) {
    return {
      success: false,
      error: `No custom Playwright script registered for course: ${course.name} (${course.id})`
    }
  }
  return script(pref, course)
}

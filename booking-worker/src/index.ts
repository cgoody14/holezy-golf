// ============================================================
// booking-worker/src/index.ts
// Railway worker entry point — Holezy booking engine
// ============================================================

import { startScheduler } from './scheduler'

console.log('🏌️  Holezy Booking Worker')
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`)
console.log(`   Started: ${new Date().toISOString()}`)

startScheduler().catch((err) => {
  console.error('Fatal worker error:', err)
  process.exit(1)
})

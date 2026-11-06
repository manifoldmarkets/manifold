import { RatingBucket } from 'web/lib/politics/ec-model'

// A diverging ramp, blue to red through a neutral gray: how sure each unit's
// market is, not just who leads.
export const RATING: Record<
  RatingBucket,
  { fill: string; label: string; ink: 'light' | 'dark' }
> = {
  safeD: { fill: '#3b4f94', label: 'Safe D', ink: 'light' },
  likelyD: { fill: '#5671ba', label: 'Likely D', ink: 'light' },
  leanD: { fill: '#9fb3dc', label: 'Lean D', ink: 'dark' },
  tossup: { fill: '#cfcac4', label: 'Toss-up', ink: 'dark' },
  leanR: { fill: '#e3a5a2', label: 'Lean R', ink: 'dark' },
  likelyR: { fill: '#c25555', label: 'Likely R', ink: 'light' },
  safeR: { fill: '#8f2f32', label: 'Safe R', ink: 'light' },
}
export const RATING_ORDER: RatingBucket[] = [
  'safeD',
  'likelyD',
  'leanD',
  'tossup',
  'leanR',
  'likelyR',
  'safeR',
]

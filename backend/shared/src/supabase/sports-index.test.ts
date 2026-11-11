import { CURATED_SPORTS, SPORTS_DEFAULT_GROUP_ID } from 'common/sports-schedule'
import { SupabaseDirectClient } from './init'

jest.mock('./init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))

const failing = {
  manyOrNone: async () => {
    throw new Error('topic tree unavailable')
  },
} as unknown as SupabaseDirectClient
const working = {
  manyOrNone: async () => [
    {
      parent_id: SPORTS_DEFAULT_GROUP_ID,
      child_id: 'cycling',
      slug: 'road-bicycle-racing',
      name: '🚲 Cycling',
      total_members: 10,
    },
  ],
} as unknown as SupabaseDirectClient

// A fresh module per test: the index is cached at module level.
let sportsIndex: typeof import('./sports-index')
beforeEach(async () => {
  jest.resetModules()
  sportsIndex = await import('./sports-index')
})

describe('sports index', () => {
  it('falls back to the curated sports for pages when the tree is unreadable', async () => {
    const index = await sportsIndex.getSportsIndex(failing, 0)
    expect(index.sports.map((s) => s.key)).toEqual(
      CURATED_SPORTS.map((s) => s.key)
    )
  })

  it('errors instead of that partial list when asked to', async () => {
    await expect(
      sportsIndex.getSportsIndex(failing, 0, { curatedFallback: false })
    ).rejects.toThrow('topic tree unavailable')
    await expect(sportsIndex.loadSportsIndex(failing)).rejects.toThrow(
      'topic tree unavailable'
    )
  })

  it('serves the last complete index once the cache has expired and a read fails', async () => {
    await sportsIndex.getSportsIndex(working, 0)
    const later = await sportsIndex.getSportsIndex(failing, 60 * 60 * 1000, {
      curatedFallback: false,
    })
    expect(later.sports.some((s) => s.key === 'road-bicycle-racing')).toBe(true)
  })
})

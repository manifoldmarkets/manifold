import { isSportsBdlEnabled } from './bdl/rollout'
import { formatFeedPrice } from './sports-price'
jest.mock('./bdl/rollout', () => ({ isSportsBdlEnabled: jest.fn(() => true) }))
import {
  compareGameStartTime,
  compareGameVolume,
  scheduleFeedTime,
  selectFeaturedGame,
} from './sports-game-feed'

const kickoff = Date.UTC(2026, 6, 1, 14)
const resume = Date.UTC(2026, 6, 5, 18)
const game = {
  id: 'game',
  status: 'upcoming' as const,
  volume: 20,
  startTime: kickoff,
}
it('uses a valid resumption only while suspended or postponed; original kickoff survives corrections', () => {
  for (const gameState of ['suspended', 'postponed'] as const) {
    const moved = { ...game, gameState, resumptionTime: resume }
    expect(scheduleFeedTime(moved)).toBe(resume)
    expect(moved.startTime).toBe(kickoff)
    for (const invalid of [undefined, NaN, Infinity, -1, 8.64e15 + 1])
      expect(scheduleFeedTime({ ...moved, resumptionTime: invalid })).toBe(
        kickoff
      )
    expect(scheduleFeedTime({ ...moved, resumptionTime: 0 })).toBe(0)
  }
  for (const gameState of [
    undefined,
    'scheduled',
    'live',
    'delayed',
    'settling',
    'final',
    'canceled',
    'unavailable',
  ] as const)
    expect(
      scheduleFeedTime({ ...game, gameState, resumptionTime: resume })
    ).toBe(kickoff)
})
it('orders resumed games with normal games and race sessions and breaks same-slot ties by market id', () => {
  const moved = {
    ...game,
    id: 'b',
    gameState: 'suspended' as const,
    resumptionTime: resume,
  }
  const same = { ...game, id: 'Z', startTime: resume }
  const race = { ...game, id: 'f1', startTime: resume - 1 }
  for (const compare of [compareGameStartTime, compareGameVolume])
    expect([moved, race, same].sort(compare).map((x) => x.id)).toEqual([
      'f1',
      'Z',
      'b',
    ])
  expect(selectFeaturedGame([moved, race], undefined, 'start')?.id).toBe('f1')
  expect(selectFeaturedGame([{ ...race, volume: 100 }, moved])?.id).toBe('f1')
})

it('retains legacy card prices, kickoff and same-time order unless enabled', () => {
  jest.mocked(isSportsBdlEnabled).mockReturnValue(false)
  try {
    expect([0.004, 0.996, 0.5].map(formatFeedPrice)).toEqual([
      '0%',
      '100%',
      '50%',
    ])
    const moved = {
      ...game,
      gameState: 'suspended' as const,
      resumptionTime: resume,
    }
    expect(scheduleFeedTime(moved)).toBe(kickoff)
    const earlier = { ...game, id: 'a' }
    const later = { ...game, id: 'Z' }
    expect(compareGameStartTime(earlier, later)).toBe('a'.localeCompare('Z'))
  } finally {
    jest.mocked(isSportsBdlEnabled).mockReturnValue(true)
  }
  expect([0.004, 0.996].map(formatFeedPrice)).toEqual(['<1%', '>99%'])
})

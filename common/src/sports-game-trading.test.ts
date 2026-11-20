import type { ScheduleGame } from './sports-schedule'
import { canBetOnScheduledGame } from './sports-game-feed'

const game = {
  status: 'upcoming',
  closeTime: 200,
  sportsLeagueKey: 'nba',
  isResolved: false,
} as ScheduleGame

it.each(['settling', 'final', 'canceled'] as const)(
  'disables betting after an observed %s even before the safety close',
  (gameState) => {
    expect(canBetOnScheduledGame({ ...game, gameState }, 100)).toBe(false)
  }
)
it('keeps trading available during live play until the market closes', () => {
  expect(canBetOnScheduledGame({ ...game, gameState: 'live' }, 100)).toBe(true)
  expect(canBetOnScheduledGame(game, 200)).toBe(false)
  expect(canBetOnScheduledGame({ ...game, isResolved: true }, 100)).toBe(false)
  expect(canBetOnScheduledGame({ ...game, status: 'finished' }, 100)).toBe(
    false
  )
})

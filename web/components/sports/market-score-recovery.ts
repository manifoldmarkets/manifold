import type { Contract } from 'common/contract'
import { hasPublicTeamScoreboard } from 'common/sports-league-label'
import { toOfficialGame } from 'common/sports-official-game'
import type { ScheduleGame } from 'common/sports-schedule'

export type MarketScoreSnapshot = {
  id: string
  updated: number
  game: ScheduleGame | null
}

export function marketScoreSnapshot(
  id: string,
  contract: Contract | undefined,
  now: number
): MarketScoreSnapshot {
  const valid = contract?.id === id && hasPublicTeamScoreboard(contract)
  return {
    id,
    updated: contract?.lastUpdatedTime ?? 0,
    game: valid
      ? toOfficialGame(contract, contract.answers, [], undefined, now)
      : null,
  }
}

/** Resolution is a contract change. Score observations are ordered by their committed
 * receipt time; the provider's separate observation time is shown to the reader. */
export function newerMarketScore(
  current: MarketScoreSnapshot,
  next: MarketScoreSnapshot
) {
  const a = current.game,
    b = next.game
  if (next.id !== current.id || !a || !b) return next
  if (a.sportsEventId !== b.sportsEventId)
    return next.updated >= current.updated ? next : current
  if (a.isResolved || b.isResolved) {
    const versionA = Math.max(current.updated, a.resolutionTime ?? 0)
    const versionB = Math.max(next.updated, b.resolutionTime ?? 0)
    if (versionA !== versionB) return versionB > versionA ? next : current
    if (a.isResolved !== b.isResolved) return b.isResolved ? next : current
  }
  return (b.liveUpdatedTime ?? 0) > (a.liveUpdatedTime ?? 0) ? next : current
}

export function recoverMarketScore(
  current: MarketScoreSnapshot,
  read?: MarketScoreSnapshot
): ScheduleGame | null {
  const base = current.game
  if (!base || !read || read.id !== current.id) return base
  if (!read.game) return null
  if (base.isResolved && !read.game.isResolved) return base
  if (
    read.game.sportsEventId !== base.sportsEventId ||
    newerMarketScore(current, read) !== read
  )
    return base
  const s = read.game
  // A replica can have the latest committed score and an old answer snapshot.
  // Reuse only the score and resolution, keeping live contract prices and metadata.
  return {
    ...base,
    status: s.status,
    gameState: s.gameState,
    isResolved: s.isResolved,
    isCanceled: s.isCanceled,
    winnerAnswerId: s.winnerAnswerId,
    resolutionTime: s.resolutionTime,
    liveScore: s.liveScore,
    finalScore: s.finalScore,
    liveUpdatedTime: s.liveUpdatedTime,
    scoreUpdatedTime: s.scoreUpdatedTime,
    clock: s.clock,
    period: s.period,
    finalQualifier: s.finalQualifier,
    resumptionTime: s.resumptionTime,
    scoreboard: s.scoreboard,
  }
}

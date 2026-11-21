import type { Contract, MultiContract, Sports } from 'common/contract'
import { hasPublicTeamScoreboard } from 'common/sports-league-label'
import { toOfficialGame } from 'common/sports-official-game'
import type { ScheduleGame } from 'common/sports-schedule'

export type MarketScoreSnapshot = {
  id: string
  updated: number
  game: ScheduleGame | null
  contract?: MultiContract & Sports
  denied?: true
  checkedVersion?: number
}

export function marketScoreSnapshot(
  id: string,
  contract: Contract | undefined,
  now: number,
  checkedVersion?: number
): MarketScoreSnapshot {
  if (!contract || contract.id !== id)
    return { id, updated: 0, game: null, checkedVersion }
  const updated = contract.lastUpdatedTime ?? 0
  if (!hasPublicTeamScoreboard(contract))
    return { id, updated, game: null, denied: true }
  return {
    id,
    updated,
    contract,
    checkedVersion,
    game: toOfficialGame(contract, contract.answers, [], undefined, now),
  }
}

/** Market edits, bets and score observations have independent versions. A replica
 * can have a newer score alongside older pools or an obsolete kickoff. */
export function newerMarketScore(
  current: MarketScoreSnapshot,
  next: MarketScoreSnapshot
): MarketScoreSnapshot {
  const a = current.game
  const b = next.game
  if (current.id !== next.id) return next
  if (!b)
    return current.denied && (!next.denied || current.updated > next.updated)
      ? current
      : next
  if (!a)
    return current.denied && current.updated >= next.updated ? current : next
  if (a.sportsEventId !== b.sportsEventId)
    return next.updated > current.updated ? next : current
  const versionA = Math.max(current.updated, a.resolutionTime ?? 0)
  const versionB = Math.max(next.updated, b.resolutionTime ?? 0)
  const newer =
    b.isResolved === a.isResolved
      ? versionB > versionA
      : b.isResolved && versionB >= versionA
  const metadata = newer ? next : current
  const meta = newer ? b : a
  const sameTeams =
    a.home.answerId === b.home.answerId &&
    a.away.answerId === b.away.answerId &&
    a.draw?.answerId === b.draw?.answerId
  if (!sameTeams) return metadata
  const useNextPrices =
    (next.contract?.lastBetTime ?? 0) > (current.contract?.lastBetTime ?? 0)
  const prices = useNextPrices ? b : a
  const pricedContract = useNextPrices ? next.contract : current.contract
  const nextScore =
    a.isResolved !== b.isResolved
      ? newer
      : (b.liveUpdatedTime ?? 0) > (a.liveUpdatedTime ?? 0) ||
        (newer &&
          b.isResolved &&
          (b.liveUpdatedTime ?? 0) === (a.liveUpdatedTime ?? 0))
  const score = nextScore ? b : a
  if (!newer && !nextScore && !useNextPrices) return current
  return {
    ...metadata,
    contract:
      metadata.contract && pricedContract
        ? {
            ...metadata.contract,
            answers: metadata.contract.answers.map((answer) => {
              const pool = pricedContract.answers.find(
                (entry) => entry.id === answer.id
              )
              return pool && pool !== answer
                ? {
                    ...answer,
                    prob: pool.prob,
                    poolYes: pool.poolYes,
                    poolNo: pool.poolNo,
                    p: pool.p,
                    totalLiquidity: pool.totalLiquidity,
                    subsidyPool: pool.subsidyPool,
                    volume: pool.volume,
                  }
                : answer
            }),
            lastBetTime: pricedContract.lastBetTime,
          }
        : metadata.contract,
    game: {
      ...meta,
      home: { ...meta.home, prob: prices.home.prob },
      away: { ...meta.away, prob: prices.away.prob },
      draw:
        meta.draw && prices.draw
          ? { ...meta.draw, prob: prices.draw.prob }
          : meta.draw,
      status: score.gameState || score.liveScore ? score.status : meta.status,
      gameState: score.gameState,
      liveScore: score.liveScore,
      finalScore: score.finalScore,
      liveUpdatedTime: score.liveUpdatedTime,
      scoreUpdatedTime: score.scoreUpdatedTime,
      clock: score.clock,
      period: score.period,
      finalQualifier: score.finalQualifier,
      resumptionTime: score.resumptionTime,
      scoreboard: score.scoreboard,
    },
  }
}

export function recoverMarketSnapshot(
  current: MarketScoreSnapshot,
  read?: MarketScoreSnapshot
): MarketScoreSnapshot {
  if (!current.game || !read || read.id !== current.id) return current
  if (!read.game) {
    // A missing row has no server version. A newer public contract edit or a
    // successful eligible read can restore a scoreboard hidden by that lookup.
    const version = read.denied ? read.updated : read.checkedVersion
    if (version != null && current.updated > Math.max(version, read.updated))
      return current
    return read
  }
  if (current.game.sportsEventId !== read.game.sportsEventId)
    return read.updated > current.updated ? { ...read, game: null } : current
  return newerMarketScore(current, read)
}

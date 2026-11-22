import type { MajorLeague } from 'common/bdl/major-leagues'
import {
  BDL_CANCELLATION_HOLD_MS,
  BDL_FINAL_SETTLEMENT_DELAY_MS,
} from 'common/bdl/constants'
import {
  isSportsContract,
  type Contract,
  type CPMMMultiContract,
  type Sports,
} from 'common/contract'
import { isLinkedCpmmMulti2 } from 'common/sports-kickoff-interface'
import type { SportsFinalQualifier } from 'common/sports-scoreboard'
import { bdlEventId } from 'common/sports-ids'
import { providerOf } from 'common/sports-provider'
import { normalizeTeam } from 'common/sports-team-colors'
import { hasConfirmedEntrants, type MajorObservation } from './major-games'
import type { ResolutionParams } from '../resolve-market-helpers'

export type MajorResult = {
  eventId: string
  status: 'final' | 'canceled'
  // Sorted by provider ID. Listing-order changes do not create a correction.
  firstId: number
  secondId: number
  firstScore: number | null
  secondScore: number | null
  winnerId: number | null
  qualifier: SportsFinalQualifier | null
}

export type MajorMarket = CPMMMultiContract &
  Sports & {
    sportsRecordedResult?: MajorResult
    sportsLiveUpdatedTime?: number
    sportsLastCheckedTime?: number
    sportsLastSyncTime?: number
    sportsStandingsTeamIds?: string[]
    sportsScoreUpdatedTime?: number | null
    sportsLastWatchWarning?: number
    sportsPostponedSince?: number
    sportsFirstFinalHash?: string
    sportsRevisionWatermark?: number
    sportsObservationStartedAt?: number
    sportsLastObservationKey?: string
    sportsIncidentKey?: string | null
    sportsAttentionNotified?: boolean
  }

export type MajorIncident =
  | 'unconfirmed observation order'
  | 'malformed game'
  | 'unexpected entrants'
  | 'unidentifiable entrants'
  | 'invalid final scores'
  | 'unexpected level final'
  | 'irregular result'
  | 'unknown game status'
  | 'abandoned game'
  | 'missing game'
  | 'possible-reid'
  | 'result corrected'
  | 'unexpected market answers'
  | 'overdue final'
  | 'unconfirmed resumption'
  | 'conflicting sibling results'

export function isMajorMarket(
  c: Contract,
  creatorId: string,
  league: MajorLeague
): c is MajorMarket {
  return (
    c.creatorId === creatorId &&
    c.token === 'MANA' &&
    c.visibility === 'public' &&
    !c.deleted &&
    isSportsContract(c) &&
    !c.sportsFixture &&
    providerOf(c) === 'bdl' &&
    c.sportsLeagueKey === league &&
    c.sportsMarketType === 'moneyline' &&
    isLinkedCpmmMulti2(c) &&
    c.addAnswersMode === 'DISABLED'
  )
}

export function matchesMajorEntrantIds(
  market: Pick<Sports, 'sportsHomeTeamId' | 'sportsAwayTeamId'>,
  game: MajorObservation
) {
  if (!hasConfirmedEntrants(game) || game.home.id === game.away.id) return false
  const h = String(game.home.id),
    a = String(game.away.id)
  return (
    (market.sportsHomeTeamId === h && market.sportsAwayTeamId === a) ||
    (market.sportsHomeTeamId === a && market.sportsAwayTeamId === h)
  )
}

export function matchesEntrants(
  market: Pick<
    Sports,
    | 'sportsHomeTeamId'
    | 'sportsAwayTeamId'
    | 'sportsHomeTeam'
    | 'sportsAwayTeam'
  >,
  game: MajorObservation
) {
  if (!hasConfirmedEntrants(game) || !matchesMajorEntrantIds(market, game))
    return false
  const homeFirst = market.sportsHomeTeamId === String(game.home.id)
  const home = homeFirst ? game.home : game.away
  const away = homeFirst ? game.away : game.home
  return (
    market.sportsHomeTeamId === String(home.id) &&
    market.sportsAwayTeamId === String(away.id) &&
    !!market.sportsHomeTeam &&
    !!market.sportsAwayTeam &&
    normalizeTeam(market.sportsHomeTeam) === normalizeTeam(home.name) &&
    normalizeTeam(market.sportsAwayTeam) === normalizeTeam(away.name) &&
    normalizeTeam(home.name) !== normalizeTeam(away.name)
  )
}

const validScore = (n: number | null): n is number =>
  n !== null && Number.isSafeInteger(n) && n >= 0

export function reviewedResult(
  league: MajorLeague,
  game: MajorObservation
): { record?: MajorResult; incident?: MajorIncident } {
  if (!hasConfirmedEntrants(game)) return { incident: game.entrantIssue }
  if (
    !game.eligible ||
    game.irregular ||
    (league === 'nfl' && game.season < 2027)
  )
    return { incident: 'irregular result' }
  if (game.status === 'unknown') return { incident: 'unknown game status' }
  if (game.status === 'abandoned') return { incident: 'abandoned game' }
  if (game.status !== 'final' && game.status !== 'canceled') return {}
  const { home, away, homeScore, awayScore } = game
  if (
    ![home.id, away.id].every((v) => Number.isSafeInteger(v) && v > 0) ||
    home.id === away.id
  )
    return { incident: 'unexpected entrants' }
  let winnerId: number | null = null
  if (game.status === 'final') {
    if (!validScore(homeScore) || !validScore(awayScore))
      return { incident: 'invalid final scores' }
    if (
      homeScore === awayScore &&
      (league !== 'nfl' || game.postseason !== false)
    )
      return { incident: 'unexpected level final' }
    if (homeScore !== awayScore)
      winnerId = homeScore > awayScore ? home.id : away.id
  }
  const firstHome = home.id < away.id
  return {
    record: {
      eventId: bdlEventId(league, game.id),
      status: game.status,
      firstId: firstHome ? home.id : away.id,
      secondId: firstHome ? away.id : home.id,
      firstScore:
        game.status === 'final' ? (firstHome ? homeScore : awayScore) : null,
      secondScore:
        game.status === 'final' ? (firstHome ? awayScore : homeScore) : null,
      winnerId,
      qualifier: game.status === 'final' ? game.finalQualifier ?? null : null,
    },
  }
}

export const majorResultHash = (r: MajorResult) =>
  JSON.stringify([
    r.eventId,
    r.status,
    r.firstId,
    r.secondId,
    r.firstScore,
    r.secondScore,
    r.winnerId,
    r.qualifier,
  ])

/** Called again on the transaction's authoritative answers and contract, before any payout. */
export function majorPayout(
  c: MajorMarket,
  record: MajorResult,
  now: number
): ResolutionParams | undefined {
  if (
    !Number.isSafeInteger(now) ||
    !Array.isArray(c.answers) ||
    c.isResolved ||
    c.resolution ||
    c.sportsAttentionReason ||
    c.sportsEventId !== record.eventId ||
    !c.sportsRecordedResult ||
    majorResultHash(c.sportsRecordedResult) !== majorResultHash(record) ||
    c.sportsResultHash !== majorResultHash(record)
  )
    return
  const since =
    record.status === 'canceled' ? c.sportsCanceledSince : c.sportsFinalSince
  const delay =
    record.status === 'canceled'
      ? BDL_CANCELLATION_HOLD_MS
      : BDL_FINAL_SETTLEMENT_DELAY_MS
  if (!Number.isSafeInteger(since) || since! <= 0 || now - since! < delay)
    return
  const away = c.answers.find((a) => a.index === 0)
  const home = c.answers.find((a) => a.index === 1)
  if (
    c.answers.length !== 2 ||
    !away ||
    !home ||
    !away.id ||
    !home.id ||
    away.id === home.id ||
    c.answers.some(
      (a) =>
        a.contractId !== c.id || a.isOther || a.resolution || a.resolutionTime
    )
  )
    return
  const awayId = c.sportsAwayTeamId,
    homeId = c.sportsHomeTeamId
  if (
    record.firstId === record.secondId ||
    !awayId ||
    !homeId ||
    awayId === homeId ||
    ![awayId, homeId].includes(String(record.firstId)) ||
    ![awayId, homeId].includes(String(record.secondId)) ||
    !away.text ||
    !home.text ||
    away.text === home.text ||
    away.text !== c.sportsAwayTeam ||
    home.text !== c.sportsHomeTeam ||
    (c.sportsEntrantIds &&
      (c.sportsEntrantIds.length !== 2 ||
        String(c.sportsEntrantIds[0]) !== awayId ||
        String(c.sportsEntrantIds[1]) !== homeId)) ||
    (c.sportsNativeAnswerIds &&
      (c.sportsNativeAnswerIds.length !== 2 ||
        c.sportsNativeAnswerIds[0] !== away.id ||
        c.sportsNativeAnswerIds[1] !== home.id))
  )
    return
  if (record.status === 'canceled') return { outcome: 'CANCEL' }
  if (
    record.status !== 'final' ||
    !validScore(record.firstScore) ||
    !validScore(record.secondScore)
  )
    return
  const winnerId =
    record.firstScore === record.secondScore
      ? null
      : record.firstScore > record.secondScore
      ? record.firstId
      : record.secondId
  if (record.winnerId !== winnerId) return
  if (record.winnerId === null) {
    if (c.sportsLeagueKey !== 'nfl') return
    return {
      outcome: 'CHOOSE_MULTIPLE',
      resolutions: { [away.id]: 50, [home.id]: 50 },
    }
  }
  const winner =
    String(record.winnerId) === homeId
      ? home
      : String(record.winnerId) === awayId
      ? away
      : undefined
  return winner
    ? { outcome: winner.id, resolutions: { [winner.id]: 100 } }
    : undefined
}

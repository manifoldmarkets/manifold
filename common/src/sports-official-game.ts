import { sortBy } from 'lodash'
import type { Answer } from './answer'
import { BDL_LEAGUES, BdlLeagueKey } from './bdl/leagues'
import { Contract, isMultiCpmm, isSportsContract, Sports } from './contract'
import { canBetOnScheduledGame } from './sports-game-feed'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'
import { officialBdlLeagueKey } from './sports-league-label'
import { recordedTeamCode } from './bdl/team-codes'
import { parseBdlEventId } from './sports-ids'
import { providerOf } from './sports-provider'
import { scheduleScoreFields, ScheduleScoreFields } from './sports-scoreboard'
import {
  gameStatus,
  atSportsObservationTime,
  isDrawAnswer,
  parseSportsStart,
  ScheduleGame,
  ScheduleTeam,
  sportsGameBinding,
  sportForMarket,
  SportsIndex,
  SportsLiveScore,
  splitFlag,
} from './sports-schedule'
import { teamCodeForLeague } from './sports-team-codes'
import { HOUR_MS } from './util/time'

// A game market is multiple choice: home, away, and Draw for soccer. Binary
// game markets from an early build (dev only) don't get a row.
export function toOfficialGame(
  c: Contract,
  answers: Answer[],
  groupIds: string[],
  index: SportsIndex | undefined,
  now: number,
  bdlEnabled = true
): ScheduleGame | null {
  if (!isSportsContract(c) || !c.sportsEventId || !isMultiCpmm(c)) return null
  const d = c as typeof c & Partial<SportsLiveScore>
  const sportsEventId = d.sportsEventId
  const leagueKey = bdlEnabled ? officialBdlLeagueKey(c) : undefined
  const provider = providerOf(c)
  if (bdlEnabled && (d.sportsFixture || provider === 'fixture')) return null
  const league = leagueKey ? BDL_LEAGUES[leagueKey] : undefined
  if (
    bdlEnabled &&
    (provider === 'bdl' || parseBdlEventId(sportsEventId)) &&
    (!league ||
      !['team-2way', 'team-3way'].includes(league.archetype) ||
      d.sportsMarketType !== 'moneyline')
  )
    return null
  const isResolved = !!c.resolution
  const isCanceled = bdlEnabled && c.resolution === 'CANCEL'
  const label = league?.shortLabel || d.sportsLeague || ''
  const kickoff =
    bdlEnabled && d.sportsStartKnown === false
      ? null
      : parseSportsStart(d.sportsStartTimestamp)
  const observedStatus =
    typeof d.sportsLiveStatus === 'string'
      ? d.sportsLiveStatus.toUpperCase()
      : undefined
  const terminalObservation =
    observedStatus === 'FINAL' ||
    observedStatus === 'FINISHED' ||
    observedStatus === 'AWARDED'
  const fields = bdlEnabled ? scheduleScoreFields(d, isResolved) : undefined
  let details: ScheduleScoreFields | undefined = isCanceled
    ? { gameState: 'canceled' }
    : league || fields?.gameState
    ? fields
    : undefined

  if (league && !details?.gameState) {
    const gameState = isResolved
      ? 'final'
      : terminalObservation
      ? 'settling'
      : observedStatus === 'IN_PLAY' || observedStatus === 'PAUSED'
      ? 'live'
      : !observedStatus && kickoff != null && kickoff > now
      ? 'scheduled'
      : 'unavailable'
    details = { ...details, gameState }
  }

  if (bdlEnabled && answers.some((a) => typeof a.text !== 'string')) return null
  const ordered = sortBy(answers, 'index')
  const binding = league
    ? bdlGameAnswers(ordered, league.archetype === 'team-3way', d)
    : legacyGameAnswers(ordered, d.sportsHomeTeam, d.sportsAwayTeam)
  if (!binding) return null
  const { homeAnswer, awayAnswer, drawAnswer } = binding
  const bettingSidesUnverified =
    bdlEnabled &&
    ((d.sportsMarketType != null && d.sportsMarketType !== 'moneyline') ||
      c.outcomeType !== 'MULTIPLE_CHOICE' ||
      c.addAnswersMode !== 'DISABLED' ||
      !c.shouldAnswersSumToOne ||
      ordered.some((a) => a.contractId !== c.id || a.resolution != null) ||
      ordered.some((a) => !a.id || !a.text.trim()) ||
      new Set(ordered.map((a) => a.id)).size !== ordered.length ||
      normalizedName(homeAnswer.text) === normalizedName(awayAnswer.text) ||
      isDrawAnswer(homeAnswer.text) ||
      isDrawAnswer(awayAnswer.text) ||
      !sameTeamName(homeAnswer.text, d.sportsHomeTeam) ||
      !sameTeamName(awayAnswer.text, d.sportsAwayTeam) ||
      (drawAnswer && !isDrawAnswer(drawAnswer.text)))
  const home = toTeam(
    homeAnswer,
    label,
    leagueKey,
    bdlEnabled ? d.sportsHomeTeamId : undefined,
    bdlEnabled ? d.sportsHomeTeam : undefined
  )
  const away = toTeam(
    awayAnswer,
    label,
    leagueKey,
    bdlEnabled ? d.sportsAwayTeamId : undefined,
    bdlEnabled ? d.sportsAwayTeam : undefined
  )
  const draw = drawAnswer
    ? { answerId: drawAnswer.id, prob: drawAnswer.prob }
    : null
  const winnerAnswerId =
    isResolved && !isCanceled
      ? ordered.find((a) => a.id === c.resolution)?.id ??
        ordered.find((a) => a.resolution === 'YES')?.id ??
        null
      : null

  // Without a parseable kickoff the close time is the only deadline we have
  // (the row then says "Closes").
  const closeTime = c.closeTime ?? (kickoff ?? now) + 3 * HOUR_MS
  const startTime = kickoff ?? closeTime
  const liveStatus: string | null = d.sportsLiveStatus ?? null
  const liveUpdatedTime: number | null = d.sportsLiveUpdatedTime ?? null
  const status = gameStatus({
    startTime,
    closeTime,
    isResolved,
    gameState: details?.gameState,
    kickoffKnown: bdlEnabled ? kickoff != null : undefined,
    liveStatus,
    liveUpdatedTime,
    now,
  })

  const homeScore = bdlEnabled
    ? validScore(d.sportsHomeScore)
    : d.sportsHomeScore ?? null
  const awayScore = bdlEnabled
    ? validScore(d.sportsAwayScore)
    : d.sportsAwayScore ?? null
  const terminalScore = !league || terminalObservation
  const liveScore =
    (status === 'live' ||
      details?.gameState === 'settling' ||
      details?.gameState === 'suspended') &&
    liveStatus
      ? {
          home: homeScore,
          away: awayScore,
          minute: d.sportsLiveMinute ?? null,
          ...(details?.period != null && { period: details.period }),
          ...(details?.clock != null && { clock: details.clock }),
          status: liveStatus,
        }
      : null
  const finalScore =
    !isCanceled &&
    terminalScore &&
    (isResolved || details?.gameState === 'settling') &&
    homeScore != null &&
    awayScore != null
      ? { home: homeScore, away: awayScore }
      : null

  const game: ScheduleGame = {
    id: c.id,
    ...(bettingSidesUnverified && { bettingSidesUnverified: true as const }),
    ...(league &&
      !isCanceled &&
      terminalObservation && { observedFinal: true as const }),
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    question: c.question,
    sport:
      league?.sportKey ??
      sportForMarket({ sportsLeague: label, groupIds }, index),
    groupSlugs: c.groupSlugs ?? [],
    league: label,
    ...(leagueKey && { sportsLeagueKey: leagueKey }),
    ...details,
    sportsEventId,
    startTime,
    kickoffKnown: kickoff != null,
    closeTime,
    status,
    isResolved,
    ...(isCanceled && { isCanceled: true as const }),
    winnerAnswerId,
    resolutionTime: c.resolutionTime ?? null,
    home,
    away,
    draw,
    volume: c.volume ?? 0,
    uniqueBettorCount: c.uniqueBettorCount ?? 0,
    liveScore,
    liveUpdatedTime: isCanceled ? null : liveUpdatedTime,
    scoreUpdatedTime: isCanceled ? null : d.sportsScoreUpdatedTime ?? null,
    finalScore,
    related: [],
    relatedCount: 0,
  }
  return bdlEnabled ? atSportsObservationTime(game, now) : game
}

function sameTeamName(answer: string, stored?: string) {
  return (
    typeof stored === 'string' &&
    !!stored.trim() &&
    normalizedName(stored) === normalizedName(answer)
  )
}

function legacyGameAnswers(ordered: Answer[], home?: string, away?: string) {
  const drawAnswer = ordered.find((a) => isDrawAnswer(a.text))
  const teams = ordered.filter((a) => a !== drawAnswer)
  if (teams.length !== 2) return
  const [homeAnswer, awayAnswer] = homeAndAway(teams, home, away)
  return { homeAnswer, awayAnswer, drawAnswer }
}

function bdlGameAnswers(
  ordered: Answer[],
  threeWay: boolean,
  market: Pick<
    Sports,
    'sportsHomeTeamId' | 'sportsAwayTeamId' | 'sportsEntrantIds'
  >
) {
  if (
    ordered.length !== (threeWay ? 3 : 2) ||
    ordered.some(
      (a, i) =>
        a.index !== i || !a.id || typeof a.text !== 'string' || !a.text.trim()
    ) ||
    new Set(ordered.map((a) => a.id)).size !== ordered.length
  )
    return
  // Two-way versus markets were created away/home. Three-way soccer markets
  // were created home/away/draw. Mutable answer text never binds a BDL side.
  let homeIndex = threeWay ? 0 : 1
  const ids = market.sportsEntrantIds
  if (ids != null) {
    if (
      !Array.isArray(ids) ||
      ids.length !== ordered.length ||
      (threeWay && ids[2] !== null)
    )
      return
    const teamIds = ids.slice(0, 2)
    if (
      teamIds.some(
        (id) => id == null || !Number.isSafeInteger(id) || id <= 0
      ) ||
      teamIds[0] === teamIds[1]
    )
      return
    homeIndex = teamIds.findIndex(
      (id) => String(id) === market.sportsHomeTeamId
    )
    if (
      homeIndex < 0 ||
      String(teamIds[1 - homeIndex]) !== market.sportsAwayTeamId
    )
      return
  }
  return {
    homeAnswer: ordered[homeIndex],
    awayAnswer: ordered[1 - homeIndex],
    drawAnswer: threeWay ? ordered[2] : undefined,
  }
}

function validScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function normalizedName(value: string) {
  return splitFlag(value).name.trim().toLowerCase()
}

/**
 * A legacy game market's two team answers as [home, away]. Versus markets list away
 * first and soccer lists home first, so the stored team names decide; markets
 * without them (or whose answers were renamed) were created home first.
 */
export function homeAndAway(
  teams: Answer[],
  homeTeam: string | undefined,
  awayTeam: string | undefined,
  awayFirst = false
): [Answer, Answer] {
  const byName = (name: string | undefined) =>
    name
      ? teams.find((a) => normalizedName(a.text) === normalizedName(name))
      : undefined
  const home = byName(homeTeam)
  const away = byName(awayTeam)
  if (home && home !== teams[0] && away !== home) return [teams[1], teams[0]]
  if (!home && away === teams[0]) return [teams[1], teams[0]]
  if (!home && !away && awayFirst) return [teams[1], teams[0]]
  return [teams[0], teams[1]]
}

// Markets made before every league had team codes fall back to the code for
// the market's league.
function toTeam(
  answer: Answer,
  league: string,
  leagueKey?: BdlLeagueKey,
  entrantId?: string,
  storedName?: string
): ScheduleTeam {
  const { flag, name } = splitFlag(
    storedName && !sameTeamName(answer.text, storedName)
      ? storedName
      : answer.text
  )
  const short =
    (leagueKey && recordedTeamCode(leagueKey, entrantId)) ??
    (answer.shortText &&
    (!storedName || normalizedName(storedName) === normalizedName(answer.text))
      ? splitFlag(answer.shortText).name
      : teamCodeForLeague(league, name))
  return {
    answerId: answer.id,
    ...(typeof entrantId === 'string' && entrantId.trim() && { entrantId }),
    name,
    shortName: short || name,
    flag,
    imageUrl: answer.imageUrl ?? null,
    color: answer.color ?? null,
    prob: answer.prob,
  }
}

export type SportsTicket = { binding: string; closeTime: number }

/** Prices and scores can move while a ticket is open. The event, participants
 * and offered answers define the user's selection. */
export const sportsTicketBinding = (g: ScheduleGame) =>
  JSON.stringify([
    sportsGameBinding(g),
    normalizedName(g.home.name),
    normalizedName(g.away.name),
  ])

export function verifiedSportsTicket(
  expected: SportsTicket,
  contract: Contract,
  answers: Answer[],
  now: number
): ScheduleGame | undefined {
  if (
    !MANIFOLD_SPORTS_USER_IDS.includes(contract.creatorId) ||
    contract.deleted ||
    contract.visibility !== 'public' ||
    contract.token !== 'MANA' ||
    contract.isResolved ||
    !Number.isFinite(contract.closeTime) ||
    !Number.isFinite(expected.closeTime) ||
    expected.closeTime <= now
  )
    return
  const game = toOfficialGame(contract, answers, [], undefined, now, true)
  return game &&
    canBetOnScheduledGame(game, now) &&
    sportsTicketBinding(game) === expected.binding
    ? game
    : undefined
}

/** Revalidate a feed selection against the separately fetched native market and answers. */
export function matchesSportsTicket(
  expected: ScheduleGame,
  contract: Contract,
  answers: Answer[],
  now: number
) {
  return (
    canBetOnScheduledGame(expected, now) &&
    !!verifiedSportsTicket(
      { binding: sportsTicketBinding(expected), closeTime: expected.closeTime },
      contract,
      answers,
      now
    )
  )
}

import { sortBy } from 'lodash'
import type { Answer } from './answer'
import { BDL_LEAGUES, BdlLeagueKey } from './bdl/leagues'
import { Contract, isMultiCpmm, isSportsContract } from './contract'
import { marketLeagueKey } from './bdl/league-navigation'
import { officialBdlLeagueKey } from './sports-league-label'
import { recordedTeamCode } from './bdl/team-codes'
import { parseBdlEventId } from './sports-ids'
import { providerOf } from './sports-provider'
import { scheduleScoreFields, ScheduleScoreFields } from './sports-scoreboard'
import {
  gameStatus,
  isDrawAnswer,
  parseSportsStart,
  ScheduleGame,
  ScheduleTeam,
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
  if (
    bdlEnabled &&
    d.sportsMarketType != null &&
    d.sportsMarketType !== 'moneyline'
  )
    return null
  const navigationKey = bdlEnabled ? marketLeagueKey(c) : undefined
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
  const label =
    league?.shortLabel ||
    (bdlEnabled && typeof d.sportsLeague !== 'string'
      ? ''
      : d.sportsLeague || '')
  const details: ScheduleScoreFields | undefined = isCanceled
    ? { gameState: 'canceled' as const }
    : league
    ? scheduleScoreFields(d, isResolved)
    : undefined

  const ordered = sortBy(answers, 'index')
  const drawAnswer = ordered.find((a) => isDrawAnswer(a.text))
  const teams = ordered.filter((a) => a !== drawAnswer)
  if (teams.length !== 2) return null
  const [homeAnswer, awayAnswer] = homeAndAway(
    teams,
    d.sportsHomeTeam,
    d.sportsAwayTeam,
    !!league
  )
  const home = toTeam(homeAnswer, label, leagueKey, d.sportsHomeTeamId)
  const away = toTeam(awayAnswer, label, leagueKey, d.sportsAwayTeamId)
  const draw = drawAnswer
    ? { answerId: drawAnswer.id, prob: drawAnswer.prob }
    : null
  const winnerAnswerId =
    isResolved && !isCanceled
      ? ordered.find((a) => a.id === c.resolution)?.id ??
        ordered.find((a) => a.resolution === 'YES')?.id ??
        null
      : null

  const kickoff =
    bdlEnabled && d.sportsStartKnown === false
      ? null
      : parseSportsStart(d.sportsStartTimestamp)
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
  const terminalScore =
    !league || /^(FINAL|FINISHED|AWARDED)$/i.test(liveStatus ?? '')
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

  return {
    id: c.id,
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    question: c.question,
    sport:
      (navigationKey && BDL_LEAGUES[navigationKey].sportKey) ??
      league?.sportKey ??
      sportForMarket({ sportsLeague: label, groupIds }, index),
    groupSlugs: c.groupSlugs ?? [],
    league: label,
    ...(bdlEnabled && { navigationLeagueKey: navigationKey ?? null }),
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
}

function validScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}

/**
 * A game market's two team answers as [home, away]. Versus markets list away
 * first and soccer lists home first, so the stored team names decide; markets
 * without them (or whose answers were renamed) were created home first.
 */
export function homeAndAway(
  teams: Answer[],
  homeTeam: string | undefined,
  awayTeam: string | undefined,
  awayFirst = false
): [Answer, Answer] {
  const norm = (s: string) => splitFlag(s).name.trim().toLowerCase()
  const byName = (name: string | undefined) =>
    name ? teams.find((a) => norm(a.text) === norm(name)) : undefined
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
  entrantId?: string
): ScheduleTeam {
  const { flag, name } = splitFlag(answer.text)
  const short =
    (leagueKey && recordedTeamCode(leagueKey, entrantId)) ??
    (answer.shortText
      ? splitFlag(answer.shortText).name
      : teamCodeForLeague(league, name))
  return {
    answerId: answer.id,
    ...(leagueKey && entrantId && { entrantId }),
    name,
    shortName: short || name,
    flag,
    imageUrl: answer.imageUrl ?? null,
    color: answer.color ?? null,
    prob: answer.prob,
  }
}

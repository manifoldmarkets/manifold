import { answerP, type Answer } from '../answer'
import { getCpmmProbability } from '../calculate-cpmm'
import { isMultiCpmmMechanism, MAX_CPMM_PROB, type Sports } from '../contract'
import { MANIFOLD_SPORTS_USER_IDS } from '../sports'
import { bdlEventId } from '../sports-ids'
import type { ProviderOdds } from '../sports-provider'
import { LIVE_STALE_MS } from '../sports-schedule'
import {
  nbaRegulationMs,
  nbaSeriesEventId,
  type NbaPlayoffBracket,
  type NbaPlayoffSeries,
  type NbaPlayoffTeam,
} from './nba-playoff-series'
import { selectOpeningLine } from './opening-line'

/** Estimates the first team's probability, conditional on the observed series
 * score. Each remaining possible game needs its own current, identified line.
 * Game outcomes are independent given these probabilities. */
export function nbaSeriesOpeningEstimate(
  bracket: NbaPlayoffBracket,
  seriesId: string,
  rows: readonly ProviderOdds[],
  now: number
) {
  const s = bracket.series.find((x) => x.eventId === seriesId)
  if (
    !bracket.complete ||
    bracket.review.length ||
    !s ||
    s.review.length ||
    s.winnerId !== null ||
    !Number.isSafeInteger(now) ||
    !s.wins.every((n) => Number.isInteger(n) && n >= 0 && n < 4)
  )
    return null
  const [first, second] = s.teams
  if (s.eventId !== nbaSeriesEventId(bracket.season, first.id, second.id))
    return null
  if (
    s.games.some(
      (g) =>
        !['final', 'scheduled', 'canceled', 'postponed'].includes(g.status) ||
        (g.status === 'final' &&
          (g.startTime === null || now - g.startTime < nbaRegulationMs))
    )
  )
    return null
  const remaining = 7 - s.wins[0] - s.wins[1]
  const games = s.games
    .filter((g) => g.status === 'scheduled')
    .sort((a, b) => (a.startTime ?? Infinity) - (b.startTime ?? Infinity))
  const lastStart = games[games.length - 1]?.startTime
  if (
    games.length !== remaining ||
    new Set(games.map((g) => g.id)).size !== remaining ||
    lastStart == null ||
    s.games.some(
      (g) =>
        g.status === 'postponed' &&
        (g.startTime === null || g.startTime <= lastStart)
    )
  )
    return null
  const probabilities: number[] = []
  let previousStart: number | undefined
  for (const game of games) {
    if (
      game.startTime === null ||
      game.startTime <= now ||
      (previousStart !== undefined &&
        game.startTime - previousStart < nbaRegulationMs) ||
      !(
        (game.homeId === first.id && game.awayId === second.id) ||
        (game.homeId === second.id && game.awayId === first.id)
      )
    )
      return null
    const line = selectOpeningLine(
      rows,
      {
        league: 'nba',
        eventId: bdlEventId('nba', game.id),
        entrantIds: [String(first.id), String(second.id)],
      },
      now
    )
    if (
      line.source === 'none' ||
      line.probs.length !== 2 ||
      !line.probs.every((p) => Number.isFinite(p) && p > 0 && p < 1)
    )
      return null
    previousStart = game.startTime
    probabilities.push(line.probs[0])
  }
  function chance(a: number, b: number, i: number): number {
    if (a === 4) return 1
    if (b === 4) return 0
    const p = probabilities[i]
    return p * chance(a + 1, b, i + 1) + (1 - p) * chance(a, b + 1, i + 1)
  }
  return {
    teamId: first.id,
    probability: chance(s.wins[0], s.wins[1], 0),
    gameIds: games.map((g) => g.id),
  }
}

type QuoteAnswer = Pick<
  Answer,
  | 'id'
  | 'contractId'
  | 'index'
  | 'text'
  | 'poolYes'
  | 'poolNo'
  | 'p'
  | 'isOther'
  | 'resolution'
  | 'resolutionTime'
>
export type PlayoffMarket = Pick<
  Sports,
  | 'sportsEventId'
  | 'sportsLeagueKey'
  | 'sportsProvider'
  | 'sportsFixture'
  | 'sportsEntrantIds'
  | 'sportsAttentionReason'
  | 'sportsMarketType'
> & {
  id: string
  creatorId: string
  visibility: string
  token: string
  mechanism: string
  outcomeType: string
  shouldAnswersSumToOne: boolean
  addAnswersMode: string
  closeTime?: number
  isResolved: boolean
  resolution?: string
  deleted?: boolean
  answers: readonly QuoteAnswer[]
}
export type PlayoffPick = {
  contractId: string
  eventId: string
  answerId: string
  teamId: number
  name: string
  probability: number
  buyable: boolean
  eliminated: boolean
  marketLabel: string
  scoreEvidence: string
}
const cleanName = (s: string) =>
  s.trim().replace(/\s+/gu, ' ').normalize('NFC').toLowerCase()

/** Produce only linked Manifold pool prices, ordered by the supplied teams'
 * stable identities. Winner markets have two teams; this first champion view
 * requires the complete sixteen-team field verified in the opening round. */
export function playoffMarketPicks(
  bracket: NbaPlayoffBracket,
  eventId: string,
  market: PlayoffMarket | undefined,
  readAt: number,
  now: number
): PlayoffPick[] {
  if (
    !market ||
    market.sportsEventId !== eventId ||
    market.sportsProvider !== 'bdl' ||
    market.sportsLeagueKey !== 'nba' ||
    market.sportsFixture ||
    !MANIFOLD_SPORTS_USER_IDS.includes(market.creatorId) ||
    !market.id ||
    market.visibility !== 'public' ||
    market.token !== 'MANA' ||
    market.deleted ||
    !isMultiCpmmMechanism(market.mechanism) ||
    market.outcomeType !== 'MULTIPLE_CHOICE' ||
    !market.shouldAnswersSumToOne ||
    market.addAnswersMode !== 'DISABLED'
  )
    return []
  let teams: NbaPlayoffTeam[], series: NbaPlayoffSeries | undefined
  const champion = eventId === bracket.championEventId
  if (champion) {
    if (
      market.sportsMarketType !== 'champion' ||
      eventId !== 'bdl:nba-champion:' + bracket.season
    )
      return []
    const firstRound = bracket.series.filter((s) => s.round === 1)
    if (firstRound.length !== 8) return []
    teams = firstRound.flatMap((s) => s.teams)
  } else {
    series = bracket.series.find((s) => s.eventId === eventId)
    if (
      market.sportsMarketType !== 'series' ||
      !series ||
      eventId !==
        nbaSeriesEventId(bracket.season, series.teams[0].id, series.teams[1].id)
    )
      return []
    teams = series.teams
  }
  const entrants = market.sportsEntrantIds,
    answers = market.answers
  if (
    !entrants ||
    entrants.length !== teams.length ||
    answers.length !== teams.length ||
    new Set(entrants).size !== teams.length ||
    new Set(teams.map((t) => t.id)).size !== teams.length ||
    new Set(teams.map((t) => cleanName(t.name))).size !== teams.length ||
    new Set(answers.map((a) => a.index)).size !== teams.length ||
    new Set(answers.map((a) => a.id)).size !== teams.length
  )
    return []
  const fresh =
    Number.isSafeInteger(readAt) &&
    readAt > 0 &&
    Number.isSafeInteger(now) &&
    now >= readAt &&
    now - readAt < LIVE_STALE_MS
  const eliminated = new Set(
    bracket.series.flatMap((s) =>
      s.winnerId === null || s.review.length
        ? []
        : s.teams.filter((t) => t.id !== s.winnerId).map((t) => t.id)
    )
  )
  // Store the sporting evidence on which the user selected this market.
  // The reader can reconcile a score without changing either pool price.
  const scoreEvidence = JSON.stringify(
    [...(series ? [series] : bracket.series)]
      .sort((a, b) => a.eventId.localeCompare(b.eventId))
      .map((s) => [
        s.eventId,
        s.wins,
        s.winnerId,
        s.games
          .filter(
            (g) =>
              g.status === 'final' ||
              g.status === 'in_progress' ||
              g.status === 'suspended'
          )
          .sort((a, b) => a.id - b.id)
          .map((g) => [g.id, g.homeId, g.awayId, g.status, g.scores]),
      ])
  )
  const open =
    bracket.complete &&
    !bracket.review.length &&
    fresh &&
    !(series && teams.some((t) => eliminated.has(t.id))) &&
    !(champion
      ? bracket.champion || bracket.series.some((s) => s.review.length)
      : series?.winnerId || series?.review.length) &&
    !market.sportsAttentionReason &&
    !market.isResolved &&
    !market.resolution &&
    Number.isFinite(market.closeTime) &&
    market.closeTime! > now &&
    answers.every((a) => !a.resolution && !a.resolutionTime)
  const picks: PlayoffPick[] = []
  for (const team of teams) {
    const index = entrants.indexOf(team.id),
      answer = answers.find((a) => a.index === index)
    if (
      index < 0 ||
      !answer ||
      !answer.id ||
      answer.contractId !== market.id ||
      answer.isOther ||
      !cleanName(team.name) ||
      cleanName(answer.text) !== cleanName(team.name) ||
      !Number.isFinite(answer.poolYes) ||
      answer.poolYes <= 0 ||
      !Number.isFinite(answer.poolNo) ||
      answer.poolNo <= 0
    )
      return []
    const p = answerP(answer)
    if (!Number.isFinite(p) || p <= 0 || p >= 1) return []
    const probability = getCpmmProbability(
      { YES: answer.poolYes, NO: answer.poolNo },
      p
    )
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1)
      return []
    picks.push({
      contractId: market.id,
      eventId,
      answerId: answer.id,
      teamId: team.id,
      name: answer.text,
      probability,
      eliminated: eliminated.has(team.id),
      marketLabel: series
        ? 'Series winner vs ' +
          (series.teams[0].id === team.id ? series.teams[1] : series.teams[0])
            .name
        : 'NBA champion',
      scoreEvidence,
      buyable: open && !eliminated.has(team.id) && probability < MAX_CPMM_PROB,
    })
  }
  return Math.abs(picks.reduce((sum, p) => sum + p.probability, 0) - 1) <=
    0.000001
    ? picks
    : []
}

export function currentPlayoffPick(
  bracket: NbaPlayoffBracket,
  market: PlayoffMarket | undefined,
  readAt: number,
  selected: PlayoffPick,
  now: number
) {
  return playoffMarketPicks(
    bracket,
    selected.eventId,
    market,
    readAt,
    now
  ).find(
    (p) =>
      p.buyable &&
      p.contractId === selected.contractId &&
      p.answerId === selected.answerId &&
      p.teamId === selected.teamId &&
      p.name === selected.name &&
      p.scoreEvidence === selected.scoreEvidence &&
      p.marketLabel === selected.marketLabel &&
      p.probability === selected.probability
  )
}

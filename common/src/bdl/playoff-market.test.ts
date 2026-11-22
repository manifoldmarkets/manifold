import { MANIFOLD_SPORTS_USER_IDS } from '../sports'
import { LIVE_STALE_MS } from '../sports-schedule'
import type { ProviderOdds } from '../sports-provider'
import { BDL_ODDS_MAX_AGE_MS } from './constants'
import {
  projectNbaPlayoffSeries,
  type NbaPlayoffBracket,
  type NbaPlayoffSeries,
} from './nba-playoff-series'
import {
  currentPlayoffPick,
  nbaSeriesOpeningEstimate,
  playoffMarketPicks,
  type PlayoffMarket,
} from './playoff-market'
import { DAY_MS } from '../util/time'
const now = Date.UTC(2026, 4, 1)
function raw(
  id: number,
  home: number,
  away: number,
  offset: number,
  final = false
) {
  const team = (i: number) => ({
    id: i,
    full_name: 'Team ' + i,
    abbreviation: 'T' + i,
    conference: i % 2 ? 'East' : 'West',
  })
  return {
    id,
    season: 2025,
    postseason: true,
    home_team: team(home),
    visitor_team: team(away),
    home_team_score: final ? 100 : null,
    visitor_team_score: final ? 99 : null,
    status_state: final ? 'final' : 'scheduled',
    datetime: new Date(now + offset * DAY_MS).toISOString(),
  }
}
function setup(aWins = 0, bWins = 0) {
  const played = Array.from({ length: aWins + bWins }, (_, i) =>
    raw(i + 1, i < aWins ? 1 : 2, i < aWins ? 2 : 1, i - 8, true)
  )
  const remaining = Array.from({ length: 7 - played.length }, (_, i) =>
    raw(i + 10, i % 2 ? 2 : 1, i % 2 ? 1 : 2, i + 1)
  )
  const bracket = projectNbaPlayoffSeries(2025, [...played, ...remaining], true)
  const series = bracket.series[0]
  const odds = remaining.map(
    (g): ProviderOdds => ({
      eventId: 'bdl:nba:' + g.id,
      updatedAtMs: now - 1,
      vendor: 'qa-book',
      outcomes: [
        {
          outcome: { entrantId: String(g.visitor_team.id) },
          americanOdds: g.visitor_team.id === 1 ? -150 : 150,
        },
        {
          outcome: { entrantId: String(g.home_team.id) },
          americanOdds: g.home_team.id === 1 ? -150 : 150,
        },
      ],
    })
  )
  return { bracket, series, odds }
}
const answer = (id: string, team: number, index: number, q: number) => ({
  id: 'answer-' + team,
  contractId: id,
  index,
  text: 'Team ' + team,
  p: 0.5,
  poolYes: 100 * (1 - q),
  poolNo: 100 * q,
})
function market(
  event: string,
  ids = [2, 1],
  probs = [0.4, 0.6]
): PlayoffMarket {
  return {
    id: 'market',
    creatorId: MANIFOLD_SPORTS_USER_IDS[0],
    sportsProvider: 'bdl',
    sportsLeagueKey: 'nba',
    sportsEventId: event,
    sportsMarketType: 'series',
    token: 'MANA',
    visibility: 'public',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    isResolved: false,
    closeTime: now + 1000,
    sportsEntrantIds: ids,
    answers: ids.map((v, i) => answer('market', v, i, probs[i])).reverse(),
  }
}
test('0–0 derives the exact binomial best-of-seven series, independent of home orientation and row ordering', () => {
  const { bracket, series, odds } = setup()
  const actual = nbaSeriesOpeningEstimate(
    bracket,
    series.eventId,
    [...odds].reverse(),
    now
  )!
  expect(actual.teamId).toBe(1)
  expect(actual.gameIds).toEqual([10, 11, 12, 13, 14, 15, 16])
  expect(actual.probability).toBeCloseTo(
    35 * 0.6 ** 4 * 0.4 ** 3 +
      21 * 0.6 ** 5 * 0.4 ** 2 +
      7 * 0.6 ** 6 * 0.4 +
      0.6 ** 7,
    12
  )
})
test('3–2 uses the two individually identified conditional games and 3–3 uses only game seven', () => {
  const { bracket, series, odds } = setup(3, 2)
  odds[1] = {
    ...odds[1],
    outcomes: odds[1].outcomes.map((o) => ({
      ...o,
      americanOdds: -o.americanOdds,
    })),
  }
  expect(
    nbaSeriesOpeningEstimate(bracket, series.eventId, odds, now)?.probability
  ).toBeCloseTo(0.6 + 0.4 * 0.4, 12)
  const end = setup(3, 3)
  expect(
    nbaSeriesOpeningEstimate(end.bracket, end.series.eventId, end.odds, now)
      ?.probability
  ).toBeCloseTo(0.6, 12)
})
test('withholds an estimate on missing, stale, wrong-team, wrong-game, conflicting, live or incomplete inputs', () => {
  const { bracket, series, odds } = setup()
  const estimate = (b: NbaPlayoffBracket, lines: ProviderOdds[]) =>
    nbaSeriesOpeningEstimate(b, series.eventId, lines, now)
  for (const bad of [
    odds.slice(1),
    odds.map((o) => ({ ...o, updatedAtMs: now - BDL_ODDS_MAX_AGE_MS - 1 })),
    odds.map((o) => ({ ...o, updatedAtMs: now + 1 })),
    odds.map((o) => ({ ...o, eventId: 'bdl:nhl:1' })),
    odds.map((o) => ({
      ...o,
      outcomes: o.outcomes.map((v) => ({ ...v, outcome: { entrantId: '99' } })),
    })),
    [...odds, { ...odds[0], outcomes: [] }],
  ]) {
    expect(estimate(bracket, bad)).toBeNull()
  }
  const first = series.games[0]
  for (const v of [
    { games: series.games.slice(1) },
    { games: [first, ...series.games.slice(0, -1)] },
    {
      games: [
        { ...first, status: 'in_progress' as const },
        ...series.games.slice(1),
      ],
    },
    { games: [{ ...first, startTime: now }, ...series.games.slice(1)] },
    { review: ['conflict'] },
    { winnerId: 2 },
  ]) {
    expect(
      estimate({ ...bracket, series: [{ ...series, ...v }] }, odds)
    ).toBeNull()
  }
  expect(estimate({ ...bracket, complete: false }, odds)).toBeNull()
  expect(estimate({ ...bracket, review: ['identity'] }, odds)).toBeNull()
})
test('native outcome, team, visible label and current quote are bound independently of row order', () => {
  const { bracket, series } = setup()
  const m = market(series.eventId)
  const fn = (value: PlayoffMarket) =>
    playoffMarketPicks(bracket, series.eventId, value, now, now)
  const picks = fn(m)
  expect(
    picks.map((x) => [x.teamId, x.answerId, x.probability, x.buyable])
  ).toEqual([
    [1, 'answer-1', 0.6, true],
    [2, 'answer-2', 0.4, true],
  ])
  expect(fn({ ...m, answers: [...m.answers].reverse() })).toEqual(picks)
  for (const change of [
    { sportsFixture: true as const },
    { visibility: 'private' },
    { token: 'CASH' },
    { deleted: true },
    { creatorId: 'somebody' },
    { sportsProvider: 'odds' as const },
    { sportsLeagueKey: 'nhl' as const },
    { sportsEventId: bracket.championEventId },
    { sportsMarketType: 'champion' as const },
    { addAnswersMode: 'ANYONE' },
    { shouldAnswersSumToOne: false },
    { sportsEntrantIds: [1, 2] },
    { answers: [m.answers[0], m.answers[0]] },
    { answers: m.answers.map((a) => ({ ...a, poolYes: NaN })) },
    { answers: m.answers.map((a) => ({ ...a, contractId: 'copied' })) },
  ])
    expect(fn({ ...m, ...change })).toEqual([])
  for (const change of [
    { isResolved: true },
    { sportsAttentionReason: 'check' },
    { closeTime: now },
    {
      answers: m.answers.map((a, i) => ({
        ...a,
        resolutionTime: i === 0 ? now : undefined,
      })),
    },
  ])
    expect(fn({ ...m, ...change }).every((p) => !p.buyable)).toBe(true)
  for (const invalid of [
    { answerId: 'other' },
    { teamId: 2 },
    { name: 'Team 2' },
    { probability: 0.61 },
    { contractId: 'other' },
    { eventId: 'other' },
  ])
    expect(
      currentPlayoffPick(bracket, m, now, { ...picks[0], ...invalid }, now)
    ).toBeUndefined()
  expect(currentPlayoffPick(bracket, m, now, picks[0], now + 999)).toEqual(
    picks[0]
  )
  expect(
    currentPlayoffPick(bracket, m, now, picks[0], now + 1000)
  ).toBeUndefined()
  expect(
    currentPlayoffPick(bracket, m, now - LIVE_STALE_MS, picks[0], now)
  ).toBeUndefined()
  expect(currentPlayoffPick(bracket, m, now + 1, picks[0], now)).toBeUndefined()
  expect(
    fn({
      ...m,
      answers: [answer('market', 1, 1, 0.995), answer('market', 2, 0, 0.005)],
    })[0].buyable
  ).toBe(false)
})
test('champion pools require all sixteen verified entrants, and confirmed elimination or a terminal champion keeps the row informational', () => {
  const { bracket, series } = setup()
  const teams = Array.from({ length: 16 }, (_, i) => ({
    ...series.teams[0],
    id: i + 1,
    name: 'Team ' + (i + 1),
  }))
  const rounds: NbaPlayoffSeries[] = Array.from({ length: 8 }, (_, i) => ({
    ...series,
    eventId: 'bdl:nba-series:2025:' + (i * 2 + 1) + '-' + (i * 2 + 2),
    round: 1,
    teams: [teams[i * 2], teams[i * 2 + 1]],
    winnerId: i === 0 ? 1 : null,
  }))
  const all = { ...bracket, series: rounds }
  const title = {
    ...market(
      bracket.championEventId,
      teams.map((t) => t.id),
      teams.map(() => 1 / 16)
    ),
    sportsMarketType: 'champion' as const,
  }
  const view = (b: NbaPlayoffBracket, m = title) =>
    playoffMarketPicks(b, bracket.championEventId, m, now, now)
  const picks = view(all)
  expect(picks).toHaveLength(16)
  expect(picks.filter((p) => !p.buyable).map((p) => p.teamId)).toEqual([2])
  expect(view({ ...all, series: rounds.slice(1) })).toEqual([])
  expect(view(all, { ...title, sportsEntrantIds: teams.map(() => 1) })).toEqual(
    []
  )
  expect(
    view({
      ...all,
      champion: { teamId: 1, seriesId: rounds[0].eventId, clinchingGameId: 8 },
    }).every((p) => !p.buyable)
  ).toBe(true)
})

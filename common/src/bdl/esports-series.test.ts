import {
  esportsEventId,
  readEsportsSeries,
  readEsportsStageMeta,
} from './esports-series'
import { RECORDED, providerRows } from '../esports/structure.fixtures'
import type { EsportsGame } from '../esports/types'

const a = { id: 10, name: 'First' },
  b = { id: 30, name: 'Second' },
  tournament = { id: 7, name: 'Summer Cup', tier: 'S' }
const raw = {
  id: 42,
  tournament,
  team1: a,
  team2: b,
  team1_score: 1,
  team2_score: 2,
  winner: b,
  status: 'finished',
  status_state: 'final',
  best_of: 3,
  bo_type: 3,
  start_date: '2026-11-22T15:00:00Z',
  start_time: '2026-11-22T16:00:00Z',
  start_at: '2026-11-22T17:00:00Z',
}
function series(
  game: EsportsGame = 'cs',
  changes: Record<string, unknown> = {}
) {
  const s = readEsportsSeries(game, { ...raw, ...changes })
  if (!s) throw Error('test fixture')
  return s
}

test.each(['cs', 'dota', 'lol'] as const)(
  '%s keeps a stable series key, its own start field and a winner by team ID',
  (game) => {
    const s = series(game)
    expect(esportsEventId(s)).toBe('bdl:' + game + ':42')
    expect(s).toMatchObject({
      game,
      id: 42,
      tournament: { id: 7, name: 'Summer Cup', tier: 's' },
      team1: { ...a, code: null },
      team2: { ...b, code: null },
      winnerId: b.id,
      review: null,
      bestOf: 3,
      status: 'final',
      score: { team1: 1, team2: 2 },
      startTimeMs: Date.parse(game === 'cs' ? raw.start_time : raw.start_date),
    })
    // Swapping the sides keeps the winner on the same team.
    expect(
      series(game, { team1: b, team2: a, team1_score: 2, team2_score: 1 })
    ).toMatchObject({ winnerId: b.id, score: { team1: 2, team2: 1 } })
  }
)

test('Valorant keeps stage, position and acronym, and never infers a best-of', () => {
  const s = series('valorant', {
    stage: { id: 1, name: 'Playoffs' },
    round: 'Semifinal',
    position: 3,
    team1: { ...a, acronym: 'ONE' },
    loser: a,
  })
  expect(s).toMatchObject({
    startTimeMs: Date.parse(raw.start_at),
    stage: { id: 1, name: 'Playoffs' },
    round: null,
    position: 3,
    team1: { ...a, code: 'ONE' },
    bestOf: null,
    review: 'format',
    winnerId: null,
  })
  // Every recorded Valorant result is held the same way.
  const recorded = providerRows(RECORDED.vctEuropeSwiss).map((row) =>
    readEsportsSeries('valorant', row)
  )
  expect(recorded).toHaveLength(16)
  expect(recorded.every((r) => r?.review === 'format' && !r.winnerId)).toBe(
    true
  )
})

test('CS2 reads the stage signals, round and short names; LoL and Dota have none', () => {
  const stage = {
    id: 9,
    name: ' Cup Swiss ',
    stage_type: 'Swiss',
    stage_order: 2,
    rounds_count: 5,
    best_of: 3,
  }
  expect(
    series('cs', {
      stage,
      round: ' Round 1 ',
      best_of: null,
      team1: { ...a, short_name: 'ONE' },
      position: 4,
    })
  ).toMatchObject({
    stage: {
      id: 9,
      name: 'Cup Swiss',
      type: 'swiss',
      order: 2,
      roundsCount: 5,
    },
    round: 'Round 1',
    position: null,
    bestOf: 3,
    team1: { ...a, code: 'ONE' },
  })
  for (const game of ['lol', 'dota'] as const)
    expect(series(game, { stage, round: 'Final' })).toMatchObject({
      stage: null,
      round: null,
    })
  // A stage without an ID is no stage, so its round and best-of don't count.
  expect(
    series('cs', { stage: { name: 'Playoffs' }, round: 'Final', best_of: null })
  ).toMatchObject({ stage: null, round: null, bestOf: null, review: 'format' })
  expect(series('cs', {}).observedAtMs).toBeNull()
  expect(readEsportsSeries('cs', raw, 1795609713046)?.observedAtMs).toBe(
    1795609713046
  )
})

test.each([
  [1, 1, null],
  [2, 0, a],
  [0, 2, b],
])('a best of 2 never has a two-sided result (%s-%s)', (x, y, winner) => {
  expect(
    series('dota', { bo_type: 2, team1_score: x, team2_score: y, winner })
  ).toMatchObject({
    bestOf: 2,
    status: 'final',
    winnerId: null,
    review: null,
    score: { team1: x, team2: y },
  })
})

test('recorded Dota best-of-2 series: a 1-1 tie, a 2-0 and a 0-2', () => {
  const [tie, sweep, swept] = providerRows(RECORDED.ewcDota).map((row) =>
    readEsportsSeries('dota', row)
  )
  expect(tie).toMatchObject({
    id: 701208,
    bestOf: 2,
    score: { team1: 1, team2: 1 },
    winnerId: null,
    review: null,
  })
  expect(sweep).toMatchObject({ score: { team1: 2, team2: 0 }, winnerId: null })
  expect(swept).toMatchObject({ score: { team1: 0, team2: 2 }, winnerId: null })
})

test.each([
  [{ team2: null }, 'entrants'],
  [{ team2: a }, 'entrants'],
  [{ team2: { id: 32, name: '  FIRST ' } }, 'entrants'],
  [{ winner: { id: b.id, name: a.name } }, 'winner'],
  [{ status: 'upcoming' }, 'status'],
  [
    {
      status: 'upcoming',
      status_state: 'scheduled',
      winner: null,
      team1_score: 1,
      team2_score: null,
    },
    'status',
  ],
  [{ team1: { id: 44, name: 'TBD' } }, 'entrants'],
  [{ team1: { id: 44, name: 'Winner of earlier series' } }, 'entrants'],
  [{ status: 'walkover' }, 'forfeit'],
  [{ is_forfeit: true }, 'forfeit'],
  [{ status: 'lost_by_forfeit' }, 'forfeit'],
  [{ status: 'canceled' }, 'status'],
  [{ status: 'Cancelled' }, 'status'],
  [{ status: 'postponed' }, 'status'],
  [{ team1_score: 0, team2_score: 1 }, 'score'],
  [{ team1_score: 0, team2_score: 3 }, 'score'],
  [{ team1_score: 2, team2_score: 2 }, 'score'],
  [{ team1_score: 1.5 }, 'score'],
  [{ team2_score: null }, 'score'],
  [{ winner: a }, 'winner'],
  [{ winner: null }, 'winner'],
  [{ winner: { id: 77, name: 'Other' } }, 'winner'],
  [{ loser: b }, 'winner'],
  [{ best_of: 7 }, 'format'],
  [{ status_state: 'scheduled' }, 'status'],
  [{ status_state: 'in_progress' }, 'status'],
] as const)('holds contradictory or unknown evidence %#', (changes, review) => {
  expect(series('cs', changes)).toMatchObject({ review, winnerId: null })
})

test.each([
  [{ id: 0 }],
  [{ id: 4.5 }],
  [{ tournament: null }],
  [{ tournament: { id: 7 } }],
  [{ status_state: 'canceled' }],
  [{ status_state: 'postponed' }],
  [{ status_state: 'unknown' }],
  [{ status: 'finished', status_state: null }],
])('a row that cannot be a series in a view is not read %#', (changes) => {
  expect(readEsportsSeries('cs', { ...raw, ...changes })).toBeNull()
  expect(readEsportsSeries('cs', null)).toBeNull()
})

test.each(['cs', 'dota', 'valorant', 'lol'] as const)(
  '%s forfeits keep the reported score but never a winner',
  (game) => {
    const received = {
      ...raw,
      best_of: 1,
      bo_type: 1,
      team1_score: 1,
      team2_score: 0,
      winner: a,
      loser: b,
      status: 'defwin',
    }
    expect(readEsportsSeries(game, received)).toMatchObject({
      score: { team1: 1, team2: 0 },
      status: 'final',
      review: 'forfeit',
      winnerId: null,
    })
    expect(
      readEsportsSeries(game, { ...received, status: ' DEFWIN ' })?.review
    ).toBe('forfeit')
    if (game !== 'valorant')
      expect(
        readEsportsSeries(game, { ...received, status: 'finished' })
      ).toMatchObject({ review: null, winnerId: a.id })
  }
)

test('a recorded forfeit is held: CYBERSHOKE advanced without a result', () => {
  const [, forfeit] = providerRows(RECORDED.provingGrounds).map((row) =>
    readEsportsSeries('cs', row)
  )
  expect(forfeit).toMatchObject({
    id: 61876,
    status: 'final',
    score: { team1: 0, team2: 1 },
    review: 'forfeit',
    winnerId: null,
  })
})

test.each([1, 3, 5])('a Bo%s only counts a clinched score', (bo) => {
  const needed = (bo + 1) / 2
  expect(
    series('lol', { bo_type: bo, team1_score: 0, team2_score: needed })
  ).toMatchObject({ review: null, winnerId: b.id })
  expect(
    series('lol', { bo_type: bo, team1_score: 0, team2_score: needed - 1 })
  ).toMatchObject({ review: 'score', winnerId: null })
})

test('unplayed and in-progress series never have a winner', () => {
  const scheduled = {
    status: 'upcoming',
    status_state: 'scheduled',
    winner: null,
    team1_score: null,
    team2_score: null,
  }
  expect(series('cs', scheduled)).toMatchObject({
    status: 'scheduled',
    rawStatus: 'upcoming',
    review: null,
    score: null,
    winnerId: null,
  })
  expect(
    series('cs', { ...scheduled, start_time: '2026-02-30T16:00:00Z' })
  ).toMatchObject({ startTimeMs: null, review: 'start' })
  expect(
    series('cs', {
      ...scheduled,
      status: 'current',
      status_state: 'in_progress',
      team1_score: 0,
      team2_score: 1,
    })
  ).toMatchObject({
    status: 'in_progress',
    rawStatus: 'current',
    review: null,
    score: { team1: 0, team2: 1 },
    winnerId: null,
  })
})

test.each(['canceled', 'postponed', 'current', 'unknown', '', null, undefined])(
  'a final counts only with the raw status "finished" (raw %p)',
  (status) => {
    expect(series('dota', { status })).toMatchObject({
      status: 'final',
      rawStatus: status || null,
      winnerId: null,
      review: 'status',
    })
  }
)

test('the raw status word is kept as sent, and compared without case or padding', () => {
  expect(series('cs')).toMatchObject({ rawStatus: 'finished', winnerId: b.id })
  expect(series('cs', { status: ' Finished ' })).toMatchObject({
    rawStatus: 'Finished',
    review: null,
    winnerId: b.id,
  })
  expect(series('cs', { status: 7 })).toMatchObject({
    rawStatus: null,
    review: 'status',
    winnerId: null,
  })
})

test.each([
  ['finished', 'in_progress', 1, 0],
  ['canceled', 'scheduled', 0, 0],
  ['current', 'scheduled', 0, 0],
  ['upcoming', 'in_progress', 1, 0],
  ['live', 'in_progress', 1, 0],
  ['scheduled', 'scheduled', 0, 0],
  ['rescheduled', 'final', 1, 2],
] as const)(
  'raw %s cannot back a %s series',
  (status, state, team1_score, team2_score) => {
    expect(
      series('cs', {
        status,
        status_state: state,
        team1_score,
        team2_score,
        winner: state === 'final' ? b : null,
      })
    ).toMatchObject({
      rawStatus: status,
      status: state,
      review: 'status',
      winnerId: null,
    })
  }
)

test.each([
  { winner: { id: b.id } },
  { winner: { id: b.id, name: 'Unrelated' } },
  { winner: { id: b.id, name: '  ' } },
  { winner: { id: 77, name: b.name } },
  { loser: { id: a.id } },
  { loser: { id: a.id, name: 'Second' } },
  { loser: { id: 77, name: a.name } },
])('a winner or loser must match its team by ID and name %#', (changes) => {
  expect(series('cs', changes)).toMatchObject({
    winnerId: null,
    review: 'winner',
  })
})

test('names are normalized the same way on both sides, placeholders included', () => {
  const team = { id: a.id, name: 'First Team' }
  expect(
    series('cs', {
      team1: team,
      loser: { id: a.id, name: '  FIRST\u00a0 Team  ' },
      winner: { id: b.id, name: 'Ｓecond' },
    })
  ).toMatchObject({ review: null, winnerId: b.id })
  for (const name of [
    'Winner  of Semifinal',
    'LOSER\u00a0of Final',
    ' ＴＢＤ ',
    'To be\u00a0announced',
  ]) {
    expect(series('cs', { team2: { id: b.id, name } })).toMatchObject({
      review: 'entrants',
      team2: null,
      winnerId: null,
    })
  }
})

test.each([
  [2, null],
  [null, 2],
  [null, 3],
  [2, 0],
  [1, null],
  [null, 0],
])('a partial live score %p-%p cannot hide a clinch', (first, second) => {
  const s = series('cs', {
    status: 'current',
    status_state: 'in_progress',
    team1_score: first,
    team2_score: second,
    winner: null,
  })
  expect(s.review).toBe(
    (first ?? 0) >= 2 || (second ?? 0) >= 2 ? 'status' : null
  )
  expect(s.winnerId).toBeNull()
  if (first === null || second === null) expect(s.score).toBeNull()
})

test.each(['scheduled', 'in_progress'] as const)(
  '%s holds a malformed score but not a missing one',
  (status) => {
    const sample = {
      status_state: status,
      status: status === 'scheduled' ? 'upcoming' : 'current',
      winner: null,
      loser: null,
      team1_score: null,
      team2_score: null,
    }
    for (const side of ['team1_score', 'team2_score'] as const) {
      for (const value of [
        -1,
        0.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
        '0',
        false,
        {},
      ]) {
        expect(series('cs', { ...sample, [side]: value })).toMatchObject({
          review: 'score',
          score: null,
          winnerId: null,
        })
      }
      for (const value of [undefined, null, 0]) {
        expect(series('cs', { ...sample, [side]: value })).toMatchObject({
          review: null,
          score: null,
          winnerId: null,
        })
      }
      expect(series('cs', { ...sample, [side]: 1 }).review).toBe(
        status === 'scheduled' ? 'status' : null
      )
    }
    expect(
      series('cs', { ...sample, team1_score: 0, team2_score: 0 })
    ).toMatchObject({ review: null, score: { team1: 0, team2: 0 } })
    // The wrong raw word doesn't change the reason: the score is checked first.
    expect(
      series('cs', { ...sample, status: 'finished', team1_score: -1 }).review
    ).toBe('score')
  }
)

test('reads a Valorant tournament_stages row', () => {
  const row = {
    id: 97960,
    tournament_id: 1427202,
    format: 'Playoff',
    sequence: 1,
    subgroup: 2,
    promotion_team_count: null,
  }
  expect(readEsportsStageMeta('valorant', row)).toEqual({
    game: 'valorant',
    stageId: 97960,
    tournamentId: 1427202,
    format: 'playoff',
    sequence: 1,
    promotionCount: null,
  })
  expect(
    readEsportsStageMeta('valorant', { ...row, promotion_team_count: 8 })
  ).toMatchObject({ promotionCount: 8 })
  expect(readEsportsStageMeta('valorant', { ...row, id: null })).toBeNull()
})

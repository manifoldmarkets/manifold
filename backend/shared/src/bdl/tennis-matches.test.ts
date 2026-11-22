import { readFileSync } from 'fs'
import { join } from 'path'
type Fixture = {
  tournament: Record<string, unknown>
  player1: { id: number; full_name: string }
  player2: { id: number; full_name: string }
  set_scores: Record<string, number | null>[]
}
const fixture = (path: string): Fixture =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/bdl', path + '.json'),
      'utf8'
    )
  )
const good = fixture('atp/matches__completed')
const conflicting = fixture('atp/matches__conflicting-set-ownership')
const live = fixture('wta/matches__live-outside-scope')
const wtaFinal = fixture('wta/matches__slam-final')
const qualifying = fixture('wta/matches__before-main-draw')
import { parseTennisMatch } from './tennis-matches'
import { tennisDraw, tennisMatchTitle } from 'common/bdl/tennis'
import { tennisTiming, tennisVenueZone } from 'common/bdl/tennis-time'

const parsed = (raw: unknown = good) => {
  const m = parseTennisMatch('atp', raw)
  if (!m) throw Error('Missing test match')
  return m
}
const observedLive = () => {
  const m = parseTennisMatch('wta', live)
  if (!m) throw Error('Missing live test match')
  return m
}
it('accepts recorded Masters and Australian Open finals with winning set scores bound to the paid entrant', () => {
  const m = parsed()
  expect(m).toMatchObject({
    round: 'F',
    eligibleRound: true,
    bestOf: 3,
    status: 'final',
    winnerId: 2,
    attention: null,
    timing: null,
  })
  expect(m.sides[0].sets).toEqual([
    { games: 6, tiebreak: null },
    { games: 7, tiebreak: 7 },
  ])
  expect(tennisMatchTitle(m)).toBe(
    'Jannik Sinner vs Felix Auger-Aliassime, Rolex Paris Masters F'
  )
  expect(parseTennisMatch('wta', wtaFinal)).toMatchObject({
    round: 'F',
    eligibleRound: true,
    winnerId: 9,
  })
})
it('suppresses the recorded Indian Wells player-slot contradiction and never guesses the inverse', () => {
  const m = parsed(conflicting)
  expect(m).toMatchObject({
    status: 'final',
    winnerId: null,
    attention: 'scores',
  })
  expect(m.sides.map((p) => p.sets)).toEqual([[], []])
  expect(parsed().sides[0].sets).toHaveLength(2)
})
it('rejects mislabeled qualifying matches and unestablished round or tournament data', () => {
  expect(parseTennisMatch('wta', qualifying)).toMatchObject({
    eligibleRound: false,
  })
  for (const round of ['M1', 'M2', 'Qualifying Round 1', 'unknown'])
    expect(parseTennisMatch('wta', { ...wtaFinal, round })?.eligibleRound).toBe(
      false
    )
  for (const round of ['M3', 'M4', 'MQ', 'MS', 'MF'])
    expect(parseTennisMatch('wta', { ...wtaFinal, round })?.eligibleRound).toBe(
      true
    )
  expect(
    parseTennisMatch('wta', { ...qualifying, scheduled_time: null })
      ?.eligibleRound
  ).toBe(false)
  for (const round of [
    'Round of 16',
    'Round of 32',
    'Qualifying',
    'Round Robin',
  ])
    expect(parsed({ ...good, round }).eligibleRound).toBe(false)
  expect(
    parsed({
      ...good,
      tournament: { ...good.tournament, category: 'ATP Finals' },
    }).eligibleRound
  ).toBe(false)
  expect(
    parsed({
      ...good,
      tournament: { ...good.tournament, end_date: '2025-02-30' },
    }).eligibleRound
  ).toBe(false)
  expect(parseTennisMatch('atp', { ...good, season: 2023 })).toBeNull()
})
it('keeps ranking order separate from point, server, winner, and set ownership', () => {
  const m = parseTennisMatch(
    'wta',
    live,
    new Map([
      [302, 99],
      [93, 9],
    ])
  )!
  expect(m).toMatchObject({
    eligibleRound: false,
    status: 'live',
    winnerId: null,
  })
  expect(m.sides[0]).toMatchObject({
    id: 93,
    points: '0',
    serving: true,
    sets: [{ games: 3 }, { games: 6 }, { games: 5 }],
  })
  expect(m.sides[1]).toMatchObject({
    id: 302,
    points: '0',
    serving: false,
    sets: [{ games: 6 }, { games: 3 }, { games: 6 }],
  })
  expect(observedLive().eventId).toBe(m.eventId)
  expect(parseTennisMatch('wta', live, new Map([[93, 1]]))?.sides[0].id).toBe(
    302
  )
  expect(
    parseTennisMatch('wta', {
      ...live,
      player2_game_score: '15script',
    })?.sides.map((s) => s.points)
  ).toEqual([null, null])
})
it('uses an order-independent market identity but changes the identity after a substitution', () => {
  const m = parsed()
  expect(
    parsed({ ...good, player1: good.player2, player2: good.player1 }).eventId
  ).toBe(m.eventId)
  expect(
    parsed({ ...good, player2: { id: 99, full_name: 'New Player' } }).eventId
  ).not.toBe(m.eventId)
  for (const other of [
    null,
    good.player1,
    { ...good.player2, full_name: 'Jannik   Sinner' },
  ])
    expect(parseTennisMatch('atp', { ...good, player2: other })).toBeNull()
})
it.each(['walkover', 'retired', 'defaulted'] as const)(
  'routes %s to a person even when the recorded score would otherwise confirm a winner',
  (match_status) => {
    expect(parsed({ ...good, match_status })).toMatchObject({
      winnerId: null,
      attention: match_status,
      sides: [{ sets: [] }, { sets: [] }],
    })
  }
)
it.each([
  { set_scores: [] },
  {
    set_scores: [{ ...good.set_scores[0], player2_games: 1, player1_games: 3 }],
  },
  { set_scores: [good.set_scores[1], good.set_scores[0]] },
  {
    set_scores: [...good.set_scores, { ...good.set_scores[0], set_number: 3 }],
  },
  {
    set_scores: [
      good.set_scores[0],
      { ...good.set_scores[1], player1_tiebreak: 2, player2_tiebreak: 7 },
    ],
  },
  { winner: null },
  { winner: { id: 998 } },
  { status_state: 'in_progress' },
  { match_status: 'unexpected' },
])(
  'withholds the final winner when the terminal proof is incomplete or inconsistent',
  (patch) => {
    const m = parsed({ ...good, ...patch })
    expect(m.winnerId).toBeNull()
    expect(m.attention).not.toBeNull()
    expect(m.sides[0].sets).toEqual([])
  }
)
it('derives the needed winning set count from tour/category, independently of number_of_sets', () => {
  expect(parsed({ ...good, number_of_sets: 1 }).winnerId).toBe(2)
  const slam = {
    ...good,
    tournament: { ...good.tournament, category: 'Grand Slam' },
  }
  expect(parsed(slam)).toMatchObject({
    bestOf: 5,
    winnerId: null,
    attention: 'scores',
  })
  expect(
    parsed({
      ...slam,
      set_scores: [
        ...good.set_scores,
        { ...good.set_scores[0], set_number: 3 },
      ],
    })
  ).toMatchObject({ bestOf: 5, winnerId: 2 })
})
it('groups only observed matches in this tour, tournament and season and holds duplicate match IDs', () => {
  const m = parsed(),
    sf = { ...m, id: 10, round: 'SF' as const }
  const other = { ...m, tournament: { ...m.tournament, id: 10 } }
  const get = (rows: (typeof m)[]) => tennisDraw(rows, 'atp', 325, 2025)
  expect(
    get([
      sf,
      m,
      other,
      { ...m, tour: 'wta' },
      { ...m, eligibleRound: false },
      { ...sf, tournament: { ...m.tournament, season: 2024 } },
    ]).map((r) => [r.round, r.matches.map((x) => x.id)])
  ).toEqual([
    ['SF', [10]],
    ['F', [15451]],
  ])
  expect(get([m, { ...m, eventId: 'bdl:atp:15451:2-50' }])).toEqual([])
})
it('interprets midnight as the venue calendar day, including both daylight transitions', () => {
  const zone = tennisVenueZone('MIAMI, USA')
  expect(tennisTiming('2026-03-08T00:00:00.000Z', zone, 3)).toEqual({
    venueDay: '2026-03-08',
    startKnown: false,
    earliestStart: Date.parse('2026-03-08T05:00Z'),
    safetyClose: Date.parse('2026-03-09T07:00Z'),
  })
  expect(tennisTiming('2026-11-01', zone, 5)).toEqual({
    venueDay: '2026-11-01',
    startKnown: false,
    earliestStart: Date.parse('2026-11-01T04:00Z'),
    safetyClose: Date.parse('2026-11-02T10:00Z'),
  })
  expect(
    tennisTiming('2026-01-24T23:30:00Z', tennisVenueZone('MELBOURNE, AUS'), 3)
  ).toEqual({
    venueDay: '2026-01-25',
    startKnown: true,
    earliestStart: Date.parse('2026-01-24T23:30Z'),
    safetyClose: Date.parse('2026-01-25T02:30Z'),
  })
  for (const raw of [null, '2026-02-30', '2026-01-25T13:00', '16 Jan'])
    expect(tennisTiming(raw, zone, 3)).toBeNull()
  expect(
    tennisTiming('2026-01-16', tennisVenueZone('unverified venue'), 3)
  ).toBeNull()
})

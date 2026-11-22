import { collegeGame, collegeTeam } from './college-games'
import {
  collegeTournamentSeason,
  projectCollegeBracket,
} from './college-bracket'

const season = 2025,
  stamp = '2026-03-19T19:00:00.000Z'
const entrant = (
  id: number,
  seed: string,
  score: number,
  winner: boolean | null
) => ({
  id,
  full_name: 'School ' + id,
  abbreviation: 'S' + id,
  seed,
  score,
  winner,
})
const row = (round: number, slot: number, gameId: number, h = 10, a = 12) => ({
  season,
  round,
  bracket_location: slot,
  game_id: String(gameId),
  date: stamp,
  status_state: 'final',
  home_team: entrant(h, '16', 60, true),
  away_team: entrant(a, '11', 55, null),
})
const ordinary = (gameId: number, h = 10, a = 12) =>
  collegeGame('ncaab', {
    id: gameId,
    season,
    date: stamp,
    status_state: 'final',
    home_score: 60,
    away_score: 55,
    home_team: entrant(h, '16', 60, true),
    visitor_team: entrant(a, '11', 55, null),
  })
it('accepts both round conventions and distinguishes evidence-based First Four from the main bracket geometry', () => {
  for (const base of [0, 1]) {
    const rows = [
      row(base, 3, 1),
      row(base + 1, 29, 2, 10, 25),
      row(base + 2, 15, 3, 10, 30),
      row(base + 6, 1, 5, 56, 59),
    ]
    const bracket = projectCollegeBracket(
      'ncaab',
      collegeTournamentSeason(2026),
      rows,
      [ordinary(1)]
    )
    expect(bracket.issues).toEqual([])
    expect(bracket.rounds.map((r) => r.slots.length)).toEqual([
      4, 32, 16, 8, 4, 2, 1,
    ])
    const first = bracket.rounds[0].slots[2],
      main = bracket.rounds[1].slots[28]
    expect(first).toMatchObject({
      eventId: 'bdl:ncaab:1',
      winnerId: 10,
      home: { seed: 16 },
      away: { seed: 11 },
      region: null,
      advancesTo: main.slotKey,
    })
    expect(main).toMatchObject({
      eventId: null,
      advancesTo: bracket.rounds[2].slots[14].slotKey,
    })
    expect(bracket.rounds[4].slots[2]).toMatchObject({
      status: 'unknown',
      home: { team: null, score: null },
      sourcePresent: false,
      eventId: null,
    })
  }
})
it('does not guess a missing bracket, ambiguous numbering, unsupported format or future opponents', () => {
  expect(collegeTournamentSeason(2026)).toBe(2025)
  expect(() => collegeTournamentSeason(0)).toThrow()
  expect(projectCollegeBracket('ncaaw', season, []).rounds).toEqual([])
  expect(
    projectCollegeBracket('ncaaw', season, [row(2, 1, 1)]).issues
  ).toContain('Unverified round numbering')
  expect(
    projectCollegeBracket('ncaaw', season, [row(0, 1, 1), row(7, 1, 7)]).rounds
  ).toEqual([])
  expect(
    projectCollegeBracket('ncaaw', season, [row(0, 1, 1), row(9, 1, 9)]).rounds
  ).toEqual([])
  expect(projectCollegeBracket('ncaaw', season, [row(0, 5, 1)]).rounds).toEqual(
    []
  )
  expect(
    projectCollegeBracket('ncaaw', season + 1, [row(0, 1, 1)]).rounds
  ).toEqual([])
  const r = {
    ...row(0, 1, 1),
    status_state: 'scheduled',
    home_team: null,
    away_team: { full_name: 'TBD', id: 99, score: 0, seed: '17' },
  }
  const b = projectCollegeBracket('ncaaw', season, [r, row(1, 19, 17)])
  expect(b.rounds[0].slots[0]).toMatchObject({
    status: 'scheduled',
    sourcePresent: true,
    home: { team: null, score: null },
    away: { team: null, seed: null, score: null },
    winnerId: null,
    advancesTo: null,
    eventId: null,
  })
})
it('verifies actual IDs, ordered entrants, timestamps and terminal scores before linking a bracket slot', () => {
  const g = ordinary(4),
    r = row(0, 1, 4),
    sample = (games = [g]) =>
      projectCollegeBracket('ncaab', season, [r], games).rounds[0].slots[0]
  for (const games of [
    [],
    [{ ...g, league: 'ncaaw' as const }],
    [{ ...g, season: season + 1 }],
    [{ ...g, gameId: 9 }],
    [{ ...g, startTime: null }],
    [{ ...g, home: g.away, away: g.home }],
    [{ ...g, awayScore: 0 }],
    [{ ...g, status: 'scheduled' as const }],
    [g, { ...g, home: collegeTeam(entrant(88, '2', 3, null)) }],
  ])
    expect(sample(games).eventId).toBeNull()
  expect(sample().eventId).toBe('bdl:ncaab:4')
  const duplicate = projectCollegeBracket(
    'ncaab',
    season,
    [r, { ...row(1, 2, 4), home_team: null }],
    [g]
  )
  expect(duplicate.rounds[0].slots[0].eventId).toBeNull()
  expect(
    projectCollegeBracket('ncaab', season, [r, { ...r, game_id: '44' }], [g])
      .rounds[0].slots[0].sourcePresent
  ).toBe(false)
  expect(
    projectCollegeBracket(
      'ncaab',
      season,
      [{ ...r, home_team: r.away_team }],
      [g]
    ).rounds[0].slots[0]
  ).toMatchObject({
    home: { team: null },
    away: { team: null },
    winnerId: null,
    eventId: null,
  })
})
it('requires a unique, corroborated winner and a unique destination containing the same entrant', () => {
  const r = row(0, 1, 4)
  for (const row of [
    { ...r, away_team: { ...r.away_team, winner: true } },
    { ...r, away_team: { ...r.away_team, winner: 'false' } },
    { ...r, away_team: { ...r.away_team, score: 60 } },
    { ...r, home_team: { ...r.home_team, winner: null } },
    { ...r, status_state: 'unrecognized' },
  ]) {
    const s = projectCollegeBracket('ncaab', season, [row]).rounds[0].slots[0]
    expect(s.winnerId).toBeNull()
    expect(s.advancesTo).toBeNull()
  }
  const conflict = projectCollegeBracket('ncaab', season, [
    r,
    row(1, 7, 2),
    row(1, 12, 3),
  ])
  expect(conflict.rounds[0].slots[0].advancesTo).toBeNull()
  expect(
    projectCollegeBracket('ncaab', season, [r, row(1, 4, 2), row(2, 7, 3)])
      .rounds[1].slots[3].advancesTo
  ).toBeNull()
})

it('withholds disputed final results and advancement while preserving bracket-only winners', () => {
  const rows = [row(0, 1, 4), row(1, 5, 6, 10, 33)]
  const project = (games: ReturnType<typeof ordinary>[]) =>
    projectCollegeBracket('ncaab', season, rows, games)
  expect(project([]).rounds[0].slots[0]).toMatchObject({
    winnerId: 10,
    advancesTo: expect.any(String),
  })
  const g = ordinary(4)
  for (const missing of [
    { ...g, homeScore: null, awayScore: null },
    { ...g, status: 'unknown' as const },
  ])
    expect(project([missing]).rounds[0].slots[0]).toMatchObject({
      eventId: null,
      winnerId: 10,
      advancesTo: expect.any(String),
    })
  for (const disagree of [
    { ...g, homeScore: 55, awayScore: 60 },
    { ...g, status: 'scheduled' as const },
  ]) {
    for (const independent of [[disagree], [disagree, g], [g, disagree]]) {
      const b = project(independent)
      expect(b.rounds[0].slots[0]).toMatchObject({
        winnerId: null,
        advancesTo: null,
        eventId: null,
      })
      expect(b.issues.length).toBeGreaterThan(0)
    }
  }
})
it('collapses equivalent rows and holds conflicting identities, even when unplaced', () => {
  const r = row(0, 1, 4),
    next = row(1, 4, 6, 10, 33)
  const project = (rows: unknown[]) =>
    projectCollegeBracket('ncaab', season, rows, [ordinary(4)])
  const equivalent = {
    ...r,
    game_id: 4,
    home_team: { ...r.home_team, seed: 16 },
    provider_note: 'updated',
  }
  expect(project([r, equivalent, next])).toEqual(project([r, next]))
  for (const rows of [
    [
      r,
      { ...r, bracket_location: null, away_team: entrant(52, '1', 55, false) },
    ],
    [{ ...r, bracket_location: null, home_team: null }, r],
  ]) {
    expect(project(rows).rounds[0].slots[0]).toMatchObject({
      eventId: null,
      winnerId: null,
      advancesTo: null,
    })
  }
  const changed = { ...r, home_team: { ...r.home_team, score: 80 } }
  for (const rows of [
    [r, changed],
    [changed, r],
  ])
    expect(project(rows).rounds[0].slots[0].sourcePresent).toBe(false)
})
it('never advances a repeated source entrant, including an unplaced occurrence', () => {
  const first = row(0, 1, 4),
    second = row(0, 2, 6, 10, 16),
    dest = row(1, 1, 8, 10, 18)
  for (const other of [
    second,
    { ...second, bracket_location: null },
    { ...second, home_team: second.away_team, away_team: first.home_team },
  ]) {
    const b = projectCollegeBracket('ncaab', season, [first, other, dest])
    expect(b.rounds[0].slots[0].advancesTo).toBeNull()
    expect(b.rounds[0].slots[1].advancesTo).toBeNull()
    expect(b.issues).toContain(
      'Ambiguous advancement for ' + b.rounds[0].slots[0].slotKey
    )
  }
})

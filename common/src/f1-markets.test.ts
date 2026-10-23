import { range, sum } from 'lodash'
import { MAX_ANSWER_PROB, MIN_ANSWER_PROB } from './new-contract'
import {
  buildF1MarketParams,
  F1Driver,
  F1DriverStanding,
  f1EventId,
  f1PodiumPrior,
  f1SessionKind,
  f1SessionResolution,
  F1SessionResult,
  f1WinnerPrior,
  MAX_F1_FIELD,
  OTHER_DRIVER_ANSWER,
  parseF1EventId,
} from './f1-markets'

const driver = (
  id: number,
  first: string,
  last: string,
  short: string,
  team: { name: string; color: string | null }
): F1Driver => ({
  id,
  first_name: first,
  last_name: last,
  display_name: `${first} ${last}`,
  short_name: short,
  country_code: null,
  racing_number: id,
  team: { id, name: team.name, display_name: team.name, color: team.color },
})

const redBull = { name: 'Red Bull', color: '3671C6' }
const mcLaren = { name: 'McLaren', color: '#FF8000' }
const ferrari = { name: 'Ferrari', color: 'E80020' }
const noColor = { name: 'Haas', color: null }

const verstappen = driver(1, 'Max', 'Verstappen', 'VER', redBull)
const norris = driver(4, 'Lando', 'Norris', 'NOR', mcLaren)
const piastri = driver(81, 'Oscar', 'Piastri', 'PIA', mcLaren)
const leclerc = driver(16, 'Charles', 'Leclerc', 'LEC', ferrari)
const perez = driver(11, 'Sergio', 'Pérez', 'PER', redBull)
const field = [leclerc, norris, piastri, verstappen, perez]

const standing = (d: F1Driver, points: number): F1DriverStanding => ({
  id: d.id,
  season: 2026,
  driver: d,
  position: 0,
  points,
})
const standings = [
  standing(norris, 300),
  standing(verstappen, 250),
  standing(piastri, 200),
  standing(leclerc, 100),
  standing(perez, 0),
]

const event = { id: 42, name: 'Singapore Grand Prix', season: 2026 }
const race = {
  id: 420,
  type: 'Race',
  name: 'Race',
  date: '2026-10-04T12:00:00Z',
}
const qualifying = { ...race, id: 419, type: 'Qualifying', name: 'Qual' }
const sprint = { ...race, id: 418, type: 'Sprint', name: 'Sprint' }

describe('f1SessionKind', () => {
  it('names the sessions that get markets and skips the rest', () => {
    expect(f1SessionKind(race)).toBe('race')
    expect(f1SessionKind(qualifying)).toBe('qualifying')
    expect(f1SessionKind(sprint)).toBe('sprint')
    expect(f1SessionKind({ type: 'Sprint Qualifying', name: 'SQ' })).toBeNull()
    expect(f1SessionKind({ type: 'Sprint Shootout', name: 'SS' })).toBeNull()
    expect(f1SessionKind({ type: 'Practice', name: 'FP1' })).toBeNull()
    expect(f1SessionKind({ type: 'Unknown', name: '?' })).toBeNull()
  })
})

describe('event ids', () => {
  it('round-trips and rejects anything else', () => {
    expect(f1EventId(42, 420)).toBe('bdl-f1:42:420')
    expect(parseF1EventId('bdl-f1:42:420')).toEqual({
      eventId: 42,
      sessionId: 420,
    })
    for (const bad of [
      'odds:americanfootball_nfl:abc',
      'bdl-f1:42',
      'bdl-f1:42:420:1',
      'bdl-f1:0:420',
      'bdl-f1:42:x',
      null,
      undefined,
    ])
      expect(parseF1EventId(bad)).toBeNull()
  })
})

describe('f1WinnerPrior', () => {
  it('favours the standings leader, sums to one and keeps every answer tradeable', () => {
    const percents = f1WinnerPrior(field, standings)
    expect(percents).toHaveLength(field.length + 1)
    expect(sum(percents)).toBeCloseTo(100, 6)
    const by = Object.fromEntries(
      field.map((d, i) => [d.last_name, percents[i]])
    )
    expect(by.Norris).toBeGreaterThan(by.Verstappen)
    expect(by.Verstappen).toBeGreaterThan(by.Piastri)
    expect(by.Piastri).toBeGreaterThan(by.Leclerc)
    expect(by.Leclerc).toBeGreaterThan(by['Pérez'])
    for (const p of percents) {
      expect(p).toBeGreaterThanOrEqual(MIN_ANSWER_PROB)
      expect(p).toBeLessThanOrEqual(MAX_ANSWER_PROB)
    }
    // The stand-in opens near the floor.
    expect(percents[field.length]).toBeLessThan(3)
  })

  it('opens the first race of a season level', () => {
    const percents = f1WinnerPrior(field, [])
    const drivers = percents.slice(0, field.length)
    expect(Math.max(...drivers) - Math.min(...drivers)).toBeLessThan(1e-9)
  })

  it('treats a missing or broken points total as zero', () => {
    const broken = [
      standing(norris, 300),
      { ...standing(verstappen, 0), points: NaN },
      { ...standing(piastri, 0), points: -5 },
    ]
    const percents = f1WinnerPrior(field, broken)
    expect(percents[field.indexOf(verstappen)]).toBeCloseTo(
      percents[field.indexOf(perez)],
      9
    )
    expect(percents[field.indexOf(piastri)]).toBeCloseTo(
      percents[field.indexOf(perez)],
      9
    )
  })
})

describe('f1PodiumPrior', () => {
  it('hands out exactly three podium places across the field', () => {
    const winner = f1WinnerPrior(field, standings)
    const podium = f1PodiumPrior(winner)
    expect(podium).toHaveLength(winner.length)
    for (let i = 0; i < podium.length; i++) {
      expect(podium[i]).toBeGreaterThan(winner[i])
      expect(podium[i]).toBeLessThanOrEqual(MAX_ANSWER_PROB)
      expect(podium[i]).toBeGreaterThanOrEqual(MIN_ANSWER_PROB)
    }
    // Three places; the clamp can only trim the top.
    expect(sum(podium)).toBeLessThanOrEqual(300 + 1e-6)
    expect(sum(podium)).toBeGreaterThan(290)
    // The reviewer's grid: four scorers and eighteen on nothing.
    const grid = range(22).map((i) => ({ id: i + 1 }))
    const points = [300, 250, 200, 100].map((p, i) => ({
      driver: grid[i],
      points: p,
    }))
    const gridPodium = f1PodiumPrior(f1WinnerPrior(grid, points))
    expect(sum(gridPodium)).toBeCloseTo(300, 3)
    expect(gridPodium[0]).toBeGreaterThan(gridPodium[1])
    expect(gridPodium[3]).toBeGreaterThan(gridPodium[4])
  })

  it('puts everyone on the podium when the field is three or fewer', () => {
    expect(f1PodiumPrior([50, 50])).toEqual([MAX_ANSWER_PROB, MAX_ANSWER_PROB])
    expect(f1PodiumPrior([10, 30, 60])).toEqual([
      MAX_ANSWER_PROB,
      MAX_ANSWER_PROB,
      MAX_ANSWER_PROB,
    ])
  })

  it('ignores broken inputs and keeps the rest tradeable', () => {
    const podium = f1PodiumPrior([NaN, -5, 40, 30, 30])
    expect(podium[0]).toBe(MIN_ANSWER_PROB)
    expect(podium[1]).toBe(MIN_ANSWER_PROB)
    expect(sum(podium.slice(2))).toBeCloseTo(297, 6)
  })
})

describe('buildF1MarketParams', () => {
  it('builds a race-winner market, favourites first, with the stand-in last', () => {
    const params = buildF1MarketParams(event, race, field, standings, 'winner')!
    expect(params.question).toBe('2026 Singapore Grand Prix: race winner')
    expect(params.answers).toEqual([
      'Lando Norris',
      'Max Verstappen',
      'Oscar Piastri',
      'Charles Leclerc',
      'Sergio Pérez',
      OTHER_DRIVER_ANSWER,
    ])
    expect(params.answerShortTexts).toEqual([
      'NOR',
      'VER',
      'PIA',
      'LEC',
      'PER',
      'OTHER',
    ])
    expect(params.sportsEntrantIds).toEqual([4, 1, 81, 16, 11, null])
    expect(params.shouldAnswersSumToOne).toBe(true)
    expect(sum(params.answerProbs)).toBeCloseTo(100, 6)
    expect(params.answerProbs[0]).toBeGreaterThan(params.answerProbs[1])
    expect(params.sportsEventId).toBe('bdl-f1:42:420')
    expect(params.sportsLeague).toBe('Formula 1')
    expect(params.sportsMarketType).toBe('winner')
    expect(params.sportsStartTimestamp).toBe(race.date)
    expect(params.closeTime).toBe(Date.parse(race.date) + 3 * 60 * 60 * 1000)
    expect(params.description).toContain('classified first in the race')
    expect(params.description).toContain(OTHER_DRIVER_ANSWER)
  })

  it('normalises team colours and drops them if any driver has none', () => {
    const params = buildF1MarketParams(event, race, field, standings, 'winner')!
    expect(params.answerColors).toEqual([
      '#FF8000',
      '#3671C6',
      '#FF8000',
      '#E80020',
      '#3671C6',
      '#9CA3AF',
    ])
    const withHaas = [
      ...field,
      driver(20, 'Kevin', 'Magnussen', 'MAG', noColor),
    ]
    expect(
      buildF1MarketParams(event, race, withHaas, standings, 'winner')!
        .answerColors
    ).toBeUndefined()
  })

  it('builds pole and sprint markets with their own titles and close times', () => {
    const pole = buildF1MarketParams(
      event,
      qualifying,
      field,
      standings,
      'winner'
    )!
    expect(pole.question).toBe('2026 Singapore Grand Prix: pole position')
    expect(pole.description).toContain('Grid penalties')
    expect(pole.closeTime).toBe(Date.parse(race.date) + 1.5 * 60 * 60 * 1000)
    const sprintWinner = buildF1MarketParams(
      event,
      sprint,
      field,
      standings,
      'winner'
    )!
    expect(sprintWinner.question).toBe(
      '2026 Singapore Grand Prix: sprint winner'
    )
    expect(sprintWinner.closeTime).toBe(Date.parse(race.date) + 60 * 60 * 1000)
  })

  it('builds an independent podium market for the race only', () => {
    const podium = buildF1MarketParams(event, race, field, standings, 'podium')!
    expect(podium.question).toBe('2026 Singapore Grand Prix: podium')
    expect(podium.shouldAnswersSumToOne).toBe(false)
    expect(podium.answers).not.toContain(OTHER_DRIVER_ANSWER)
    expect(podium.answers).toHaveLength(field.length)
    expect(podium.answerProbs).toHaveLength(field.length)
    expect(podium.sportsEntrantIds).toEqual([4, 1, 81, 16, 11])
    // Three places less the stand-in's share, which has no answer.
    expect(sum(podium.answerProbs)).toBeGreaterThan(280)
    expect(sum(podium.answerProbs)).toBeLessThan(300)
    expect(podium.sportsMarketType).toBe('podium')
    expect(
      buildF1MarketParams(event, qualifying, field, standings, 'podium')
    ).toBeNull()
    expect(
      buildF1MarketParams(event, sprint, field, standings, 'podium')
    ).toBeNull()
  })

  it('makes nothing for practice or a field that is not an entry list', () => {
    const practice = { ...race, type: 'Practice', name: 'FP2' }
    expect(
      buildF1MarketParams(event, practice, field, standings, 'winner')
    ).toBeNull()
    expect(buildF1MarketParams(event, race, [], standings, 'winner')).toBeNull()
    const everyone = range(MAX_F1_FIELD + 1).map((i) =>
      driver(100 + i, 'Driver', String(i), `D${i}`, redBull)
    )
    expect(
      buildF1MarketParams(event, race, everyone, standings, 'winner')
    ).toBeNull()
  })

  it('counts a driver listed twice once', () => {
    const params = buildF1MarketParams(
      event,
      race,
      [...field, norris, { ...verstappen, display_name: 'M. Verstappen' }],
      standings,
      'winner'
    )!
    expect(params.answers).toHaveLength(field.length + 1)
    expect(params.sportsEntrantIds).toEqual([4, 1, 81, 16, 11, null])
  })
})

describe('f1SessionResolution', () => {
  // Answers as the contract stores them, in the builder's order, with the
  // entrant ids the builder stamped. Texts are irrelevant to resolution.
  const answers = [
    { id: 'a-nor', index: 0 },
    { id: 'a-ver', index: 1 },
    { id: 'a-pia', index: 2 },
    { id: 'a-lec', index: 3 },
    { id: 'a-per', index: 4 },
    { id: 'a-other', index: 5 },
  ]
  const entrantIds = [4, 1, 81, 16, 11, null]
  const podiumAnswers = answers.slice(0, 5)
  const podiumIds = entrantIds.slice(0, 5)
  const result = (
    d: F1Driver,
    position: number | null,
    extra: Partial<F1SessionResult> = {}
  ): Pick<F1SessionResult, 'driver' | 'position' | 'is_winner'> => ({
    driver: d,
    position,
    is_winner: position === 1,
    ...extra,
  })
  const final = { status_state: 'final' as const }
  const classification = [
    result(piastri, 3),
    result(verstappen, 1),
    result(perez, 2),
    result(norris, null),
    result(leclerc, 4),
  ]
  const winner = (results: typeof classification) =>
    f1SessionResolution(final, results, answers, entrantIds, 'winner')
  const podium = (results: typeof classification) =>
    f1SessionResolution(final, results, podiumAnswers, podiumIds, 'podium')

  it('resolves the winner market to the driver classified first', () => {
    expect(winner(classification)).toEqual({
      kind: 'sum-to-one',
      outcome: 'a-ver',
      resolutions: { 'a-ver': 100 },
    })
  })

  it('matches by driver id, whatever the names say', () => {
    const renamed = { ...verstappen, display_name: 'M. Verstappen' }
    expect(winner([result(renamed, 1)])).toMatchObject({ outcome: 'a-ver' })
    // A different driver with the same name is not the same driver.
    const impostor = { ...verstappen, id: 999 }
    expect(winner([result(impostor, 1)])).toMatchObject({
      outcome: 'a-other',
    })
    expect(
      podium([result(renamed, 1), result(perez, 2), result(impostor, 3)])
    ).toMatchObject({
      resolutions: { 'a-ver': 'YES', 'a-per': 'YES', 'a-pia': 'NO' },
    })
  })

  it('sends a stand-in winner to the other answer, and asks a human without one', () => {
    const standIn = driver(99, 'Liam', 'Lawson', 'LAW', redBull)
    expect(winner([result(standIn, 1)])).toMatchObject({ outcome: 'a-other' })
    expect(
      f1SessionResolution(
        final,
        [result(standIn, 1)],
        podiumAnswers,
        podiumIds,
        'winner'
      )
    ).toBeNull()
  })

  it('resolves every podium answer YES or NO from the top three', () => {
    expect(podium(classification)).toEqual({
      kind: 'independent',
      resolutions: {
        'a-ver': 'YES',
        'a-per': 'YES',
        'a-pia': 'YES',
        'a-nor': 'NO',
        'a-lec': 'NO',
      },
    })
  })

  it('waits for a final session and a complete classification', () => {
    for (const state of [
      'scheduled',
      'in_progress',
      'suspended',
      'canceled',
    ] as const) {
      expect(
        f1SessionResolution(
          { status_state: state },
          classification,
          answers,
          entrantIds,
          'winner'
        )
      ).toBeNull()
    }
    expect(winner([])).toBeNull()
    expect(winner([result(verstappen, 2), result(perez, 3)])).toBeNull()
    expect(podium([result(verstappen, 1), result(perez, 2)])).toBeNull()
    expect(
      podium([result(verstappen, 1), result(perez, 2), result(piastri, 4)])
    ).toBeNull()
  })

  it('refuses a classification that contradicts itself', () => {
    // A winner flag on a driver who isn't classified first: a stale flag
    // after a disqualification, or a provider bug.
    expect(
      winner([
        { driver: norris, position: null, is_winner: true },
        result(verstappen, 1, { is_winner: true }),
      ])
    ).toBeNull()
    expect(
      winner([
        result(verstappen, 1, { is_winner: false }),
        result(norris, 4, { is_winner: true }),
      ])
    ).toBeNull()
    // The flag alone, without a classified first place, isn't a result.
    expect(
      winner([{ driver: norris, position: null, is_winner: true }])
    ).toBeNull()
    // Two first places, or one driver twice.
    expect(
      winner([result(verstappen, 1), result(norris, 1, { is_winner: false })])
    ).toBeNull()
    expect(
      podium([result(verstappen, 1), result(perez, 2), result(piastri, 2)])
    ).toBeNull()
    expect(
      podium([
        result(verstappen, 1),
        result(verstappen, 2, { is_winner: false }),
        result(piastri, 3),
      ])
    ).toBeNull()
    // Without any flag the classification alone decides.
    expect(
      winner(classification.map((r) => ({ ...r, is_winner: false })))
    ).toMatchObject({ outcome: 'a-ver' })
  })

  it('refuses a market whose entrant ids do not line up with its answers', () => {
    expect(
      f1SessionResolution(final, classification, answers, [4, 1, 81], 'winner')
    ).toBeNull()
    expect(
      f1SessionResolution(
        final,
        classification,
        answers,
        [4, 4, 81, 16, 11, null],
        'winner'
      )
    ).toBeNull()
    expect(
      f1SessionResolution(
        final,
        classification,
        answers,
        [4, 1, 81, 16, null, null],
        'winner'
      )
    ).toBeNull()
    // A listed driver whose answer is missing (deleted) must not pay the
    // stand-in: the market no longer matches its field.
    expect(
      f1SessionResolution(
        final,
        [result(verstappen, 1)],
        answers.filter((a) => a.id !== 'a-ver'),
        entrantIds,
        'winner'
      )
    ).toBeNull()
    // Indices must be whole, in range and unique.
    expect(
      f1SessionResolution(
        final,
        [result(verstappen, 1)],
        [...answers.slice(0, 5), { id: 'a-other', index: 4.5 }],
        entrantIds,
        'winner'
      )
    ).toBeNull()
    expect(
      f1SessionResolution(
        final,
        [result(verstappen, 1)],
        [...answers.slice(0, 5), { id: 'a-other', index: 1 }],
        entrantIds,
        'winner'
      )
    ).toBeNull()
    // A podium market has no stand-in.
    expect(
      f1SessionResolution(final, classification, answers, entrantIds, 'podium')
    ).toBeNull()
  })
})

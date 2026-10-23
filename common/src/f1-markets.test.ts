import { sum } from 'lodash'
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
  it('turns win chances into podium chances that add up to about three places', () => {
    const winner = f1WinnerPrior(field, standings).slice(0, field.length)
    const podium = f1PodiumPrior(winner)
    for (let i = 0; i < podium.length; i++) {
      expect(podium[i]).toBeGreaterThan(winner[i])
      expect(podium[i]).toBeLessThanOrEqual(MAX_ANSWER_PROB)
    }
    expect(f1PodiumPrior([50])[0]).toBeCloseTo(87.5, 6)
    expect(f1PodiumPrior([0, 100, 250])).toEqual([
      MIN_ANSWER_PROB,
      MAX_ANSWER_PROB,
      MAX_ANSWER_PROB,
    ])
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
    expect(sum(podium.answerProbs)).toBeGreaterThan(100)
    expect(podium.sportsMarketType).toBe('podium')
    expect(
      buildF1MarketParams(event, qualifying, field, standings, 'podium')
    ).toBeNull()
    expect(
      buildF1MarketParams(event, sprint, field, standings, 'podium')
    ).toBeNull()
  })

  it('makes nothing for practice or an empty field', () => {
    const practice = { ...race, type: 'Practice', name: 'FP2' }
    expect(
      buildF1MarketParams(event, practice, field, standings, 'winner')
    ).toBeNull()
    expect(buildF1MarketParams(event, race, [], standings, 'winner')).toBeNull()
  })
})

describe('f1SessionResolution', () => {
  const answers = [
    { id: 'a-nor', text: 'Lando Norris' },
    { id: 'a-ver', text: 'Max Verstappen' },
    { id: 'a-pia', text: 'Oscar Piastri' },
    { id: 'a-lec', text: 'Charles Leclerc' },
    { id: 'a-per', text: 'Sergio Perez' },
    { id: 'a-other', text: OTHER_DRIVER_ANSWER },
  ]
  const podiumAnswers = answers.filter((a) => a.id !== 'a-other')
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

  it('resolves the winner market to the driver classified first', () => {
    expect(
      f1SessionResolution(final, classification, answers, 'winner')
    ).toEqual({
      kind: 'sum-to-one',
      outcome: 'a-ver',
      resolutions: { 'a-ver': 100 },
    })
  })

  it('matches names across accents and the first-last form', () => {
    expect(
      f1SessionResolution(final, [result(perez, 1)], answers, 'winner')
    ).toMatchObject({ outcome: 'a-per' })
    const byParts = { ...perez, display_name: 'S. Pérez' }
    expect(
      f1SessionResolution(final, [result(byParts, 1)], answers, 'winner')
    ).toMatchObject({ outcome: 'a-per' })
  })

  it('sends a stand-in winner to the other answer, and asks a human without one', () => {
    const standIn = driver(99, 'Liam', 'Lawson', 'LAW', redBull)
    expect(
      f1SessionResolution(final, [result(standIn, 1)], answers, 'winner')
    ).toMatchObject({ outcome: 'a-other' })
    expect(
      f1SessionResolution(final, [result(standIn, 1)], podiumAnswers, 'winner')
    ).toBeNull()
  })

  it('resolves every podium answer YES or NO from the top three', () => {
    expect(
      f1SessionResolution(final, classification, podiumAnswers, 'podium')
    ).toEqual({
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
          'winner'
        )
      ).toBeNull()
    }
    expect(f1SessionResolution(final, [], answers, 'winner')).toBeNull()
    expect(
      f1SessionResolution(
        final,
        [result(verstappen, 1), result(perez, 2)],
        podiumAnswers,
        'podium'
      )
    ).toBeNull()
    // A winner flag without a position still resolves; a position without
    // the flag does too.
    expect(
      f1SessionResolution(
        final,
        [{ driver: norris, position: null, is_winner: true }],
        answers,
        'winner'
      )
    ).toMatchObject({ outcome: 'a-nor' })
  })
})

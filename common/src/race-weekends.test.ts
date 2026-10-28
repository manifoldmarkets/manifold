import { Answer } from './answer'
import {
  buildRaceWeekends,
  featuredRaceWeekends,
  RaceContract,
} from './race-weekends'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-10-31T12:00:00Z')
// Mexico City: qualifying Sat 21:00Z, the race Sun 20:00Z.
const QUALI = Date.parse('2026-10-31T21:00:00Z')
const RACE = Date.parse('2026-11-01T20:00:00Z')

const market = (
  id: string,
  session: number,
  tail: string,
  type: 'winner' | 'podium',
  start: number,
  extra: Partial<RaceContract> = {}
): RaceContract => ({
  id,
  slug: id,
  creatorUsername: 'ManifoldSports',
  question: `2026 Mexico City Grand Prix: ${tail}`,
  closeTime: start + 3 * HOUR,
  sportsEventId: `bdl-f1:374:${session}`,
  sportsMarketType: type,
  sportsStartTimestamp: new Date(start).toISOString(),
  ...extra,
})

const answers = (
  contractId: string,
  rows: [string, number, Partial<Answer>?][]
): Answer[] =>
  rows.map(
    ([text, prob, extra], index) =>
      ({
        id: `${contractId}-${index}`,
        index,
        contractId,
        text,
        shortText: text.split(' ').pop(),
        prob,
        color: '#00D2BE',
        ...extra,
      } as Answer)
  )

const pole = market('pole', 1869, 'pole position', 'winner', QUALI)
const race = market('race', 1870, 'race winner', 'winner', RACE)
const podium = market('podium', 1870, 'podium', 'podium', RACE)
const byContract = {
  pole: answers('pole', [
    ['George Russell', 0.2],
    ['Kimi Antonelli', 0.3],
    ['Max Verstappen', 0.15],
    ['Another driver', 0.01],
  ]),
  race: answers('race', [
    ['Kimi Antonelli', 0.25],
    ['George Russell', 0.11],
    ['Lewis Hamilton', 0.12],
    ['Another driver', 0.01],
  ]),
  podium: answers('podium', [
    ['Kimi Antonelli', 0.61],
    ['George Russell', 0.34],
    ['Lewis Hamilton', 0.35],
  ]),
}

describe('buildRaceWeekends', () => {
  it('makes one card per weekend with its sessions in start order', () => {
    const [w, ...rest] = buildRaceWeekends(
      [podium, race, pole],
      byContract,
      NOW
    )
    expect(rest).toEqual([])
    expect(w.id).toBe('bdl-f1:374')
    expect(w.name).toBe('2026 Mexico City Grand Prix')
    expect(w.startTime).toBe(QUALI)
    expect(w.status).toBe('upcoming')
    expect(w.sessions.map((s) => s.label)).toEqual(['Qualifying', 'Race'])
    // The winner market, then the podium.
    expect(w.sessions[1].markets.map((m) => m.label)).toEqual([
      'Race winner',
      'Podium',
    ])
    expect(w.sessions[0].markets[0].label).toBe('Pole position')
  })

  it('shows the three likeliest answers, most likely first', () => {
    const [w] = buildRaceWeekends([race], byContract, NOW)
    const m = w.sessions[0].markets[0]
    expect(m.leaders.map((l) => [l.name, l.shortName, l.prob])).toEqual([
      ['Kimi Antonelli', 'Antonelli', 0.25],
      ['Lewis Hamilton', 'Hamilton', 0.12],
      ['George Russell', 'Russell', 0.11],
    ])
    expect(m.answerCount).toBe(4)
    expect(m.leaders.every((l) => !l.won)).toBe(true)
  })

  it('moves a session from upcoming to live to finished', () => {
    const status = (now: number) =>
      buildRaceWeekends([pole, race], byContract, now).map((w) => [
        w.status,
        ...w.sessions.map((s) => s.status),
      ])[0]
    expect(status(NOW)).toEqual(['upcoming', 'upcoming', 'upcoming'])
    expect(status(QUALI + HOUR)).toEqual(['live', 'live', 'upcoming'])
    // Qualifying's markets closed; the race is still to come.
    expect(status(QUALI + 4 * HOUR)).toEqual([
      'upcoming',
      'finished',
      'upcoming',
    ])
    expect(status(RACE + 4 * HOUR)).toEqual([
      'finished',
      'finished',
      'finished',
    ])
  })

  it('puts the winners first once a market resolves', () => {
    const resolvedRace = { ...race, isResolved: true, resolution: 'race-1' }
    const podiumAnswers = answers('podium', [
      ['Kimi Antonelli', 0.61, { resolution: 'NO' }],
      ['George Russell', 0.34, { resolution: 'YES' }],
      ['Lewis Hamilton', 0.35, { resolution: 'YES' }],
    ])
    const [w] = buildRaceWeekends(
      [resolvedRace, { ...podium, isResolved: true }],
      { ...byContract, podium: podiumAnswers },
      RACE + HOUR
    )
    const [winner, top3] = w.sessions[0].markets
    expect(winner.leaders[0]).toMatchObject({
      name: 'George Russell',
      won: true,
    })
    expect(top3.leaders.filter((l) => l.won).map((l) => l.name)).toEqual([
      'Lewis Hamilton',
      'George Russell',
    ])
    expect(w.sessions[0].status).toBe('finished')
  })

  it('ignores markets that are not F1 sessions, and puts a live weekend first', () => {
    const game = { ...race, id: 'game', sportsEventId: 'odds:nfl:abc' }
    const brazil = market(
      'brazil',
      1875,
      'race winner',
      'winner',
      RACE + 7 * 24 * HOUR,
      {
        sportsEventId: 'bdl-f1:375:1875',
        question: '2026 São Paulo Grand Prix: race winner',
      }
    )
    const weekends = buildRaceWeekends(
      [brazil, game, race],
      byContract,
      RACE + HOUR
    )
    expect(weekends.map((w) => [w.name, w.status])).toEqual([
      ['2026 Mexico City Grand Prix', 'live'],
      ['2026 São Paulo Grand Prix', 'upcoming'],
    ])
  })
})

describe('featuredRaceWeekends', () => {
  it('features a weekend that is on or a few days away', () => {
    const weekends = buildRaceWeekends([pole, race], byContract, NOW)
    expect(featuredRaceWeekends(weekends, NOW)).toHaveLength(1)
    expect(featuredRaceWeekends(weekends, QUALI - 5 * 24 * HOUR)).toEqual([])
    const live = buildRaceWeekends([race], byContract, RACE + HOUR)
    expect(featuredRaceWeekends(live, RACE + HOUR)).toHaveLength(1)
  })
})

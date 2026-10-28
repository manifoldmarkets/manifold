import { Answer } from './answer'
import {
  buildRaceWeekends,
  raceWeekendSearchText,
  raceWeekendTime,
  withoutRaceMarkets,
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

describe('a weekend in the game feed', () => {
  it("files under its live session's day, else its next session's", () => {
    const at = (now: number) =>
      raceWeekendTime(buildRaceWeekends([pole, race], byContract, now)[0])
    expect(at(NOW)).toBe(QUALI)
    expect(at(QUALI + HOUR)).toBe(QUALI)
    // Qualifying is over: Sunday's race is what's next.
    expect(at(QUALI + 4 * HOUR)).toBe(RACE)
  })

  it('is found by its name, sessions and drivers', () => {
    const [w] = buildRaceWeekends([pole, race], byContract, NOW)
    const text = raceWeekendSearchText(w)
    for (const q of ['mexico', 'grand prix', 'f1', 'qualifying', 'antonelli'])
      expect(text).toContain(q)
    expect(text).not.toContain('nfl')
  })
})

describe('review fixes', () => {
  it('starts a session at any market that has a start (F4213-02)', () => {
    const noStart = { ...race, sportsStartTimestamp: undefined }
    const [w] = buildRaceWeekends([noStart, podium], byContract, RACE + HOUR)
    expect(w.sessions[0].startTime).toBe(RACE)
    expect(w.sessions[0].status).toBe('live')
  })

  it('names a session whose title was edited from how long its market stays open (F4213-03)', () => {
    const renamed = {
      ...pole,
      question: 'Who takes pole at the 2026 Mexico City Grand Prix?',
      closeTime: QUALI + 1.5 * HOUR,
    }
    const [w] = buildRaceWeekends([renamed, race], byContract, NOW)
    expect(w.sessions.map((s) => s.label)).toEqual(['Qualifying', 'Race'])
    expect(w.sessions[0].markets[0].label).toBe('Pole position')
    // The weekend's name comes from a title the pipeline wrote.
    expect(w.name).toBe('2026 Mexico City Grand Prix')

    const odd = { ...renamed, closeTime: QUALI + 2 * HOUR }
    const [alone] = buildRaceWeekends([odd], byContract, NOW)
    expect(alone.name).toBe('Formula 1 weekend')
    expect(alone.sessions[0].label).toBe('Session')
    expect(alone.sessions[0].markets[0].label).toBe('Winner')
  })

  it('drops only the markets on cards being shown from the week list (F4213-01)', () => {
    const weekends = buildRaceWeekends([pole, race, podium], byContract, NOW)
    const upcoming = [{ id: 'race' }, { id: 'pole' }, { id: 'other' }]
    expect(withoutRaceMarkets(upcoming, weekends)).toEqual([{ id: 'other' }])
    expect(withoutRaceMarkets(upcoming, [])).toEqual(upcoming)
  })
})

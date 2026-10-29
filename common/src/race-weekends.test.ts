import { Answer } from './answer'
import {
  buildDriverBoard,
  buildRaceWeekends,
  ChampionshipCandidate,
  driverCode,
  findRaceRelatedMarkets,
  pickRaceChampionships,
  raceDisplayName,
  raceSessionEvents,
  raceSessionSearchText,
  raceWeekendMarkets,
  topRaceMarket,
  withoutRaceMarkets,
  RaceContract,
} from './race-weekends'
import { selectFeaturedGame } from './sports-game-feed'
import { RelatedCandidate } from './sports-schedule'

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

  it('sends the likeliest answers, most likely first, up to six', () => {
    const [w] = buildRaceWeekends([race], byContract, NOW)
    const m = w.sessions[0].markets[0]
    expect(m.leaders.map((l) => [l.name, l.shortName, l.prob])).toEqual([
      ['Kimi Antonelli', 'Antonelli', 0.25],
      ['Lewis Hamilton', 'Hamilton', 0.12],
      ['George Russell', 'Russell', 0.11],
      ['Another driver', 'driver', 0.01],
    ])
    expect(m.answerCount).toBe(4)
    expect(m.leaders.every((l) => !l.won)).toBe(true)
    const grid = answers(
      'race',
      Array.from({ length: 22 }, (_, i): [string, number] => [
        `Driver ${i}`,
        i / 100,
      ])
    )
    const [full] = buildRaceWeekends([race], { race: grid }, NOW)
    expect(full.sessions[0].markets[0].leaders.map((l) => l.name)).toEqual([
      'Driver 21',
      'Driver 20',
      'Driver 19',
      'Driver 18',
      'Driver 17',
      'Driver 16',
    ])
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

describe('sessions in the game feed', () => {
  it('lists each live or upcoming session on its own, with what was traded on it', () => {
    const traded = {
      race: { volume: 100, uniqueBettorCount: 7 },
      podium: { volume: 50, uniqueBettorCount: 9 },
    }
    const contracts = [
      pole,
      { ...race, ...traded.race },
      { ...podium, ...traded.podium },
    ]
    const at = (now: number) =>
      raceSessionEvents(buildRaceWeekends(contracts, byContract, now))
    expect(at(NOW).map((e) => [e.id, e.status, e.startTime])).toEqual([
      ['bdl-f1:374:1869', 'upcoming', QUALI],
      ['bdl-f1:374:1870', 'upcoming', RACE],
    ])
    const [, raceEvent] = at(NOW)
    // Its most traded market's, not the sum: the same people trade both.
    expect([raceEvent.volume, raceEvent.uniqueBettorCount]).toEqual([100, 7])
    expect(topRaceMarket(raceEvent.session)?.id).toBe('race')
    expect(raceEvent.weekend.sessions).toHaveLength(2)
    // Qualifying is live, then over: only the race is left.
    expect(at(QUALI + HOUR).map((e) => e.status)).toEqual(['live', 'upcoming'])
    expect(at(QUALI + 4 * HOUR).map((e) => e.session.label)).toEqual(['Race'])
    expect(at(RACE + 4 * HOUR)).toEqual([])
  })

  it('features the next session on the F1 page, the most traded elsewhere', () => {
    const busyRace = { ...race, volume: 5000 }
    const at = (now: number) =>
      raceSessionEvents(buildRaceWeekends([pole, busyRace], byContract, now))
    const ids = (now: number, by?: 'start') =>
      selectFeaturedGame(at(now), undefined, by)?.id
    expect(ids(NOW)).toBe('bdl-f1:374:1870')
    expect(ids(NOW, 'start')).toBe('bdl-f1:374:1869')
    // Live wins either way; once qualifying is over, the race is next.
    expect(ids(QUALI + HOUR)).toBe('bdl-f1:374:1869')
    expect(ids(QUALI + 4 * HOUR, 'start')).toBe('bdl-f1:374:1870')
  })

  it('ranks a session against games by its most traded market, not the sum', () => {
    const contracts = [
      pole,
      { ...race, volume: 100 },
      { ...podium, volume: 50 },
    ]
    const [quali, raceEvent] = raceSessionEvents(
      buildRaceWeekends(contracts, byContract, NOW)
    )
    expect(quali.volume).toBe(0)
    const game = (volume: number) => ({
      id: 'game',
      status: 'upcoming' as const,
      startTime: NOW + HOUR,
      volume,
    })
    // The sum, 150, would beat this game; the race winner's 100 doesn't.
    expect(selectFeaturedGame([game(120), quali, raceEvent])?.id).toBe('game')
    expect(selectFeaturedGame([game(80), quali, raceEvent])?.id).toBe(
      'bdl-f1:374:1870'
    )
  })

  it("takes the session's most traded market: the winner on a tie, a bad volume as none", () => {
    const top = (raceVolume: number, podiumVolume: number) => {
      const [, raceEvent] = raceSessionEvents(
        buildRaceWeekends(
          [
            pole,
            { ...podium, volume: podiumVolume, uniqueBettorCount: 9 },
            { ...race, volume: raceVolume, uniqueBettorCount: 7 },
          ],
          byContract,
          NOW
        )
      )
      return [
        topRaceMarket(raceEvent.session)?.id,
        raceEvent.volume,
        raceEvent.uniqueBettorCount,
      ]
    }
    expect(top(100, 300)).toEqual(['podium', 300, 9])
    expect(top(100, 100)).toEqual(['race', 100, 7])
    expect(top(Number.NaN, 50)).toEqual(['podium', 50, 9])
    expect(top(Infinity, 50)).toEqual(['podium', 50, 9])
    expect(top(-500, 0)).toEqual(['race', 0, 7])
    expect(topRaceMarket({ markets: [] })).toBeUndefined()
  })

  it('keeps a live pick, but not a later one, when featuring what is next (F4213-10)', () => {
    const at = (now: number) =>
      raceSessionEvents(buildRaceWeekends([pole, race], byContract, now))
    // The race was picked before qualifying's market turned up.
    expect(selectFeaturedGame(at(NOW), 'bdl-f1:374:1870', 'start')?.id).toBe(
      'bdl-f1:374:1869'
    )
    // The most-traded rule still keeps its pick while browsing.
    expect(selectFeaturedGame(at(NOW), 'bdl-f1:374:1870')?.id).toBe(
      'bdl-f1:374:1870'
    )
    expect(
      selectFeaturedGame(at(QUALI + HOUR), 'bdl-f1:374:1869', 'start')?.id
    ).toBe('bdl-f1:374:1869')
  })

  it("names the featured card's pills in session order", () => {
    const sprint = market(
      'sprint',
      1868,
      'sprint winner',
      'winner',
      QUALI - 5 * HOUR
    )
    const [w] = buildRaceWeekends(
      [podium, race, pole, sprint],
      { ...byContract, sprint: byContract.race },
      NOW
    )
    expect(raceWeekendMarkets(w).map((m) => [m.label, m.market.id])).toEqual([
      ['Sprint', 'sprint'],
      ['Qualifying', 'pole'],
      ['Race winner', 'race'],
      ['Podium', 'podium'],
    ])
  })

  it('is found by its weekend, session and drivers', () => {
    const [qualifying] = raceSessionEvents(
      buildRaceWeekends([pole, race], byContract, NOW)
    )
    const text = raceSessionSearchText(qualifying)
    for (const q of ['mexico', 'grand prix', 'f1', 'qualifying', 'russell'])
      expect(text).toContain(q)
    expect(text).not.toContain('race winner')
    expect(raceDisplayName('2026 Mexico City Grand Prix')).toBe(
      'Mexico City Grand Prix'
    )
  })
})

describe('markets people make about a Grand Prix', () => {
  const SPRINT = QUALI - 5 * HOUR
  const sprint = market('sprint', 1868, 'sprint winner', 'winner', SPRINT)
  const [mexico] = buildRaceWeekends(
    [pole, race, podium, sprint],
    { ...byContract, sprint: byContract.race },
    NOW
  )
  const candidate = (
    id: string,
    question: string,
    closeTime: number,
    extra: Partial<RelatedCandidate> = {}
  ): RelatedCandidate => ({
    id,
    question,
    closeTime,
    sport: 'f1',
    importanceScore: 0.1,
    ...extra,
  })
  const sessionOf = (
    candidates: RelatedCandidate[],
    weekends = [mexico]
  ): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [sessionId, matches] of findRaceRelatedMarkets(
      weekends,
      candidates
    ))
      for (const m of matches) out[m.id] = sessionId
    return out
  }

  it('puts a market naming the Grand Prix under the session it is about', () => {
    expect(
      sessionOf([
        candidate(
          'winner',
          'F1: Who will win the 2026 Mexico City Grand Prix?',
          RACE + HOUR
        ),
        candidate(
          'pole',
          'F1 Mexican GP: Who will take pole?',
          QUALI - 0.1 * HOUR
        ),
        // Sprint first, though "finish" is about a race.
        candidate(
          'sprint-top3',
          'Will Max Verstappen finish the Mexico GP Sprint in the top 3?',
          SPRINT
        ),
        // Who starts from pole is decided in qualifying, but asked about the race.
        candidate(
          'start',
          'Will the Mexican GP winner start from pole?',
          RACE - 0.1 * HOUR
        ),
        // No session named: the one it closes nearest to.
        candidate(
          'sc',
          'Will a full Safety Car be deployed during the Mexico GP?',
          RACE - 0.1 * HOUR
        ),
        candidate(
          'fp1',
          'F1 Mexico GP: Who will be fastest in FP1?',
          QUALI - 26 * HOUR
        ),
      ])
    ).toEqual({
      winner: 'bdl-f1:374:1870',
      pole: 'bdl-f1:374:1869',
      'sprint-top3': 'bdl-f1:374:1868',
      start: 'bdl-f1:374:1870',
      sc: 'bdl-f1:374:1870',
      fp1: 'bdl-f1:374:1868',
    })
  })

  it("only takes F1 markets about this weekend's Grand Prix, while it's on", () => {
    expect(
      sessionOf([
        // A session's own market is on its card already.
        candidate(
          'race',
          '2026 Mexico City Grand Prix: race winner',
          RACE + 3 * HOUR,
          {
            sportsEventId: 'bdl-f1:374:1870',
          }
        ),
        // Another sport in the same city.
        candidate('nfl', 'Will the Chiefs win in Mexico City?', RACE, {
          sport: 'nfl',
        }),
        // Outside the F1 topic, it has to say it's about F1.
        candidate('mayor', 'Mexico City mayor approval above 50%?', RACE, {
          sport: 'other',
        }),
        candidate('gp', 'Will Checo get points at the Mexican GP?', RACE, {
          sport: 'other',
        }),
        // Last year's race, and next week's.
        candidate(
          '2025',
          'F1: Who will win the 2025 Mexico City Grand Prix?',
          RACE - 365 * 24 * HOUR
        ),
        candidate(
          'brazil',
          'F1: Who will win the São Paulo GP?',
          RACE + 7 * 24 * HOUR
        ),
        // A market on no particular race.
        candidate(
          'title',
          'Who will win the 2026 F1 Drivers Championship?',
          RACE + 24 * HOUR
        ),
      ])
    ).toEqual({ gp: 'bdl-f1:374:1870' })
  })

  it('matches names however they are written, short ones only in capitals', () => {
    const at = (name: string, start: number) =>
      buildRaceWeekends(
        [
          market('w', 1, 'race winner', 'winner', start, {
            sportsEventId: `bdl-f1:${start}:1`,
            question: `${name}: race winner`,
          }),
        ],
        {},
        NOW
      )[0]
    const brazil = at('2026 São Paulo Grand Prix', RACE + 7 * 24 * HOUR)
    const austin = at('2026 United States Grand Prix', RACE + 14 * 24 * HOUR)
    expect(
      sessionOf(
        [
          candidate(
            'sao',
            'F1: Who will win the Sao Paulo GP?',
            brazil.startTime
          ),
          candidate(
            'interlagos',
            'Rain at Interlagos on race day?',
            brazil.startTime
          ),
          candidate('us', 'F1 US GP: Who will win?', austin.startTime),
          candidate('cota', 'Will a Ferrari win at COTA?', austin.startTime),
          candidate(
            'lower',
            'Will the stewards let us know before the GP ends?',
            austin.startTime
          ),
        ],
        [brazil, austin]
      )
    ).toEqual({
      sao: `${brazil.id}:1`,
      interlagos: `${brazil.id}:1`,
      us: `${austin.id}:1`,
      cota: `${austin.id}:1`,
    })
  })

  it('settles qualifying or race by the close, and skips other series and years (F4213-07..09)', () => {
    expect(
      sessionOf([
        candidate(
          'pole-sitter',
          'Will the pole sitter win the 2026 Mexico City Grand Prix?',
          RACE - 0.1 * HOUR
        ),
        candidate(
          'win-pole',
          'Who will win pole at the Mexican GP?',
          QUALI - 0.1 * HOUR
        ),
        candidate(
          'f2',
          'F2 Mexico City Grand Prix: who wins the feature race?',
          RACE,
          { sport: 'other' }
        ),
        candidate('f2-topic', 'F2 Mexico City GP sprint winner?', SPRINT),
        candidate('academy', 'F1 Academy Mexico City race winner?', RACE),
        candidate(
          'both',
          'F1 vs F2 at the Mexico City GP: which has more overtakes?',
          RACE
        ),
        candidate(
          'last-year',
          'Who will win the 2025 Mexico City Grand Prix?',
          RACE
        ),
        candidate(
          'this-year',
          'Who will win the 2026 Mexico City Grand Prix?',
          RACE + HOUR
        ),
      ])
    ).toEqual({
      'pole-sitter': 'bdl-f1:374:1870',
      'win-pole': 'bdl-f1:374:1869',
      both: 'bdl-f1:374:1870',
      'this-year': 'bdl-f1:374:1870',
    })
  })

  it('lists the most important first, winner markets in the first group', () => {
    const [raceMatches] = [
      ...findRaceRelatedMarkets(
        [mexico],
        [
          candidate(
            'small',
            'Mexico City GP: Will there be a red flag?',
            RACE,
            {
              importanceScore: 0.1,
            }
          ),
          candidate(
            'big',
            'F1: Who will win the 2026 Mexico City Grand Prix?',
            RACE,
            {
              importanceScore: 0.5,
            }
          ),
        ]
      ).values(),
    ]
    expect(raceMatches.map((m) => [m.id, m.group, m.kind])).toEqual([
      ['big', 'game-lines', 'event'],
      ['small', 'props', 'event'],
    ])
  })
})

describe('the championship', () => {
  const title = (
    id: string,
    question: string,
    uniqueBettorCount: number
  ): ChampionshipCandidate => ({ id, question, uniqueBettorCount, volume: 0 })
  const candidates = [
    title('wdc', 'Who will win the 2026 Formula 1 Drivers Championship?', 112),
    title('wdc-2', 'F1 2026 winner world champion', 94),
    title(
      'wcc',
      'Who will win the 2026 formula 1 constructors world championship?',
      31
    ),
    title(
      'wcc-2',
      'Which team will win the F1 2026 Constructors’ Championship (WCC) ?',
      30
    ),
    title('when', 'When will Kimi Antonelli win the F1 WDC', 140),
    // Who's in the top three isn't who wins it (F4213-06).
    title(
      'top3',
      'Who will be in the top 3 of the 2026 F1 Drivers’ Championship?',
      900
    ),
    title(
      'lowest',
      'Which team will score the lowest points total in the Formula 1 World Constructors Championship 2026',
      300
    ),
    title(
      'next',
      'Who will win the 2027 Formula 1 Drivers World Championship?',
      200
    ),
    title('nba', 'Who will win the 2026 NBA Championship?', 500),
  ]

  it("picks this season's drivers' and constructors' title markets with the most traders", () => {
    expect(pickRaceChampionships(candidates, NOW)).toEqual([
      { kind: 'drivers', id: 'wdc' },
      { kind: 'constructors', id: 'wcc' },
    ])
  })

  it('moves on to next season from mid-December', () => {
    expect(
      pickRaceChampionships(candidates, Date.parse('2026-12-20T00:00:00Z'))
    ).toEqual([{ kind: 'drivers', id: 'next' }])
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

describe("the featured weekend's driver board", () => {
  it('codes drivers like the timing screens', () => {
    expect(
      [
        'Kimi Antonelli',
        'Andrea Kimi Antonelli',
        'George Russell',
        'Nico Hülkenberg',
        'Sergio Pérez',
        'Carlos Sainz Jr.',
      ].map(driverCode)
    ).toEqual(['ANT', 'ANT', 'RUS', 'HUL', 'PER', 'SAI'])
  })

  const winner = {
    id: 'win',
    closed: false,
    answers: [
      { id: 'w-rus', text: 'George Russell', prob: 0.2, color: '#00D2BE' },
      {
        id: 'w-ant',
        text: 'Kimi Antonelli',
        shortText: 'K. Antonelli',
        prob: 0.4,
        probChanges: { day: 0.043 },
      },
      { id: 'w-other', text: 'Another driver', prob: 0.01 },
      {
        id: 'w-ver',
        text: 'Max Verstappen',
        prob: 0.3,
        probChanges: { day: -0.02 },
      },
    ],
  }
  const podium = {
    id: 'top3',
    closed: false,
    answers: [
      { id: 'p-ant', text: 'Kimi Antonelli', prob: 0.7, color: '#00D2BE' },
      { id: 'p-rus', text: 'George Russell', prob: 0.5 },
      { id: 'p-ver', text: 'Max Verstappen', prob: 0.45 },
      { id: 'p-ham', text: 'Lewis Hamilton', prob: 0.3 },
    ],
  }

  it('joins each driver across markets, the picked market setting the order', () => {
    const rows = buildDriverBoard([winner, podium], 'win')
    expect(rows.map((r) => r.code || r.name)).toEqual([
      'ANT',
      'VER',
      'RUS',
      'HAM',
      'Another driver',
    ])
    const [ant] = rows
    expect(ant).toMatchObject({ shortName: 'K. Antonelli', color: '#00D2BE' })
    expect(ant.cells.win).toMatchObject({
      answerId: 'w-ant',
      prob: 0.4,
      dayChange: 4,
    })
    expect(ant.cells.top3).toMatchObject({ answerId: 'p-ant', prob: 0.7 })
    // Hamilton is only in the podium market.
    expect(rows[3].cells.win).toBeUndefined()
    expect(
      buildDriverBoard([winner, podium], 'top3').map((r) => r.code)
    ).toEqual(['ANT', 'RUS', 'VER', 'HAM', ''])
  })

  it('puts the winners first once a market settles, and marks it closed', () => {
    const settled = { ...winner, closed: true, resolution: 'w-rus' }
    const rows = buildDriverBoard([settled, podium], 'win')
    expect(rows[0]).toMatchObject({ code: 'RUS' })
    expect(rows[0].cells.win).toMatchObject({ won: true, closed: true })
    expect(rows[1].cells.win?.won).toBe(false)
  })
})

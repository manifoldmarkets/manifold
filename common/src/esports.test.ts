import {
  buildBracket,
  esportsEventView,
  buildSwiss,
  ESPORTS_EVENTS,
  EsportsStage,
  eventChampion,
  parseSeriesAnswer,
  readSeries,
  SeriesAnswer,
  swissBuckets,
} from './esports'

const worlds = ESPORTS_EVENTS.find((e) => e.key === 'lol-worlds-2026')!
const swiss = worlds.stages.find((s) => s.kind === 'swiss') as Extract<
  EsportsStage,
  { kind: 'swiss' }
>
const knockouts = worlds.stages.find((s) => s.kind === 'bracket') as Extract<
  EsportsStage,
  { kind: 'bracket' }
>

// The Worlds 2026 match megamarket (ynAsZLIl50) as it stood on 31 Oct 2026:
// four Swiss rounds settled, a cancelled duplicate, and round 5's deciders.
const WORLDS: [string, string | undefined, number?][] = [
  ['Gen.G defeats IG', 'YES'],
  ['TL defeats CFO', 'NO'],
  ['AL defeats KC', 'NO'],
  ['G2 defeats DK', 'NO'],
  ['HLE defeats TES', 'YES'],
  ['LOS defeats T1', 'NO'],
  ['TSW defeats LYON', 'NO'],
  ['BLG defeats MKOI', 'NO'],
  ['DK defeats T1', 'YES'],
  ['CFO defeats MKOI', 'NO'],
  ['HLE defeats Gen.G', 'NO'],
  ['LYON defeats KC', 'YES'],
  ['G2 defeats LOS', 'YES'],
  ['IG defeats TSW', 'YES'],
  ['TES defeats AL', 'YES'],
  ['TL defeats BLG', 'NO'],
  ['Gen.G defeats LYON (Bo3)', 'YES'],
  ['DK defeats MKOI (Bo3)', 'YES'],
  ['TES defeats G2', 'YES'],
  ['HLE defeats IG', 'NO'],
  ['KC defeats BLG', 'NO'],
  ['T1 defeats CFO', 'YES'],
  ['LOS defeats TSW (Bo3)', 'YES'],
  ['TL defeats AL (Bo3)', 'YES'],
  ['TES defeats BLG (Bo3)', 'YES'],
  ['IG defeats LYON (Bo3)', 'YES'],
  ['MKOI defeats T1 (Bo3)', 'NO'],
  ['KC defeats CFO (Bo3)', 'YES'],
  ['TL defeats HLE (Bo3)', 'CANCEL'],
  ['TL defeats LOS (Bo3)', 'NO'],
  ['HLE defeats G2 (Bo3)', 'YES'],
  ['LOS defeats LYON (Bo3)', undefined, 0.28],
  ['KC defeats MKOI (Bo3)', undefined, 0.59],
  ['HLE defeats BLG (Bo3)', undefined, 0.6],
]

const answers = (rows: [string, string | undefined, number?][]) =>
  rows.map(
    ([text, resolution, prob], index): SeriesAnswer => ({
      id: `a${index}`,
      index,
      text,
      resolution,
      prob: prob ?? (resolution === 'YES' ? 1 : 0),
      volume: 100,
      createdTime: index,
    })
  )

const NOW = Date.parse('2026-10-31T12:00:00Z')
const market = { id: 'ynAsZLIl50', closeTime: NOW + 1e9, isResolved: false }

describe('parseSeriesAnswer', () => {
  it('reads plain, tagged and prefixed series', () => {
    expect(parseSeriesAnswer('HLE defeats BLG (Bo3)')).toEqual({
      a: 'HLE',
      b: 'BLG',
      bestOf: 3,
      label: undefined,
    })
    expect(parseSeriesAnswer('[UBR1-1] NRG beats T1')).toEqual({
      a: 'NRG',
      b: 'T1',
      bestOf: undefined,
      label: 'UBR1-1',
    })
    expect(
      parseSeriesAnswer("Winner's Round 2 - MVK Esports defeats Karmine Corp")
    ).toMatchObject({
      a: 'MVK Esports',
      b: 'Karmine Corp',
      label: "Winner's Round 2",
    })
    expect(
      parseSeriesAnswer('[GF] LOUD beats Team Vitality (L)')
    ).toMatchObject({ a: 'LOUD', b: 'Team Vitality', label: 'GF' })
  })

  it('leaves props and unnamed winners alone', () => {
    expect(parseSeriesAnswer('Pentakill scored')).toBeUndefined()
    expect(parseSeriesAnswer('T1 vs Gen.G')).toBeUndefined()
    expect(parseSeriesAnswer('T1 defeats T1')).toBeUndefined()
    expect(parseSeriesAnswer('A defeats B defeats C')).toBeUndefined()
  })
})

describe('Worlds 2026 Swiss stage', () => {
  const { series } = readSeries(market, answers(WORLDS), worlds.teams, NOW)
  const standings = buildSwiss(swiss, series, worlds.teams)
  const record = (code: string) =>
    standings.records.find((r) => r.team.code === code)!

  it('counts only settled results, and skips the cancelled duplicate', () => {
    expect(standings.problems).toEqual([])
    expect([record('GEN').wins, record('GEN').losses]).toEqual([3, 0])
    expect(record('GEN').status).toBe('through')
    expect([record('T1').wins, record('T1').losses]).toEqual([3, 1])
    expect([record('HLE').wins, record('HLE').losses]).toEqual([2, 2])
    expect([record('TL').wins, record('TL').losses]).toEqual([1, 3])
    expect(record('TL').status).toBe('out')
    expect(record('AL').status).toBe('out')
  })

  it('finds round 5: three deciders between 2–2 teams', () => {
    expect(standings.round).toBe(5)
    expect(standings.complete).toBe(false)
    expect(
      standings.pending.map((p) => [p.series.a.code, p.series.b.code, p.stakes])
    ).toEqual([
      ['LOS', 'LYON', 'decider'],
      ['KC', 'MKOI', 'decider'],
      ['HLE', 'BLG', 'decider'],
    ])
    expect(standings.pending.every((p) => p.round === 5)).toBe(true)
  })

  it('groups the board by record, through first and out last', () => {
    expect(
      swissBuckets(standings.records).map((b) => [
        b.key,
        b.status,
        b.records.map((r) => r.team.code),
      ])
    ).toEqual([
      ['3-0', 'through', ['DK', 'GEN']],
      ['3-1', 'through', ['IG', 'T1', 'TES']],
      ['2-2', 'alive', ['BLG', 'HLE', 'KC', 'LOS', 'LYON', 'MKOI']],
      ['1-3', 'out', ['CFO', 'G2', 'TL']],
      ['0-3', 'out', ['AL', 'TSW']],
    ])
  })

  it('hands series after the stage to the bracket', () => {
    const settled = answers([
      ...WORLDS.slice(0, 31),
      ['LOS defeats LYON (Bo3)', 'NO'],
      ['KC defeats MKOI (Bo3)', 'YES'],
      ['HLE defeats BLG (Bo3)', 'YES'],
      ['GEN defeats KC (Bo5)', undefined, 0.8],
      ['T1 defeats LYON (Bo5)', 'YES'],
    ])
    const all = readSeries(market, settled, worlds.teams, NOW).series
    const done = buildSwiss(swiss, all, worlds.teams)
    expect(done.complete).toBe(true)
    expect(done.problems).toEqual([])
    const through = new Set(
      done.records.filter((r) => r.status === 'through').map((r) => r.team.code)
    )
    expect([...through].sort()).toEqual(
      ['DK', 'GEN', 'HLE', 'IG', 'KC', 'LYON', 'T1', 'TES'].sort()
    )
    const bracket = buildBracket(
      knockouts,
      all.filter((s) => !done.taken.has(s.answerId)),
      through
    )
    expect(bracket.problems).toEqual([])
    expect(
      bracket.rounds.map((r) => [r.name, r.series.length, r.open])
    ).toEqual([
      ['Quarterfinals', 2, 2],
      ['Semifinals', 0, 2],
      ['Final', 0, 1],
    ])
  })

  it('flags a team paired twice while a round is open', () => {
    const twice = answers([...WORLDS, ['HLE defeats KC (Bo3)', undefined, 0.5]])
    const s = readSeries(market, twice, worlds.teams, NOW).series
    expect(buildSwiss(swiss, s, worlds.teams).problems).toContain(
      'HLE has two open series'
    )
  })

  it('says a closed, unsettled series is awaiting a result, not open', () => {
    const closed = { ...market, closeTime: NOW - 1 }
    const { series: s } = readSeries(closed, answers(WORLDS), worlds.teams, NOW)
    expect(s[s.length - 1].status).toBe('awaiting')
  })
})

describe('esportsEventView', () => {
  const markets = {
    '8CNt8EuP5P': {
      id: '8CNt8EuP5P',
      isResolved: true,
      closeTime: NOW - 1e9,
      creatorUsername: 'RedzoneITG',
      answers: answers([
        ['FURIA defeats MVK Esports', 'NO'],
        ['Cloud9 defeats Karmine Corp', 'NO'],
        ["Winner's Round 2 - MVK Esports defeats Karmine Corp", 'NO'],
        ["Loser's Round 1 - FURIA defeats Cloud9", 'YES'],
        ["Loser's Round 2 - MVK Esports defeats FURIA", 'YES'],
        ['Qualification Match - Karmine Corp defeats MVK Esports', 'YES'],
      ]),
    },
    ynAsZLIl50: {
      ...market,
      creatorUsername: 'RedzoneITG',
      answers: answers(WORLDS),
    },
    td8NIdpz9N: {
      id: 'td8NIdpz9N',
      closeTime: NOW + 1e9,
      creatorUsername: 'SteveSokolowski',
      answers: answers([
        ['Gen. G', undefined, 0.43],
        ['Hanwha Life Esports', undefined, 0.068],
        ['G2 Esports', undefined, 0.01],
        ['Cloud9 KIA', undefined, 0.001],
        ['Other', undefined, 0.009],
      ]),
    },
  }
  const view = esportsEventView(worlds, markets, NOW)

  it('puts the Play-In behind, the Swiss stage on, the knockouts next', () => {
    expect(view.status).toBe('in-progress')
    expect(view.stages.map((s) => [s.stage.key, s.state])).toEqual([
      ['play-in', 'done'],
      ['swiss', 'current'],
      ['knockouts', 'next'],
    ])
    expect(view.openSeries.map((s) => s.text)).toEqual([
      'LOS defeats LYON (Bo3)',
      'KC defeats MKOI (Bo3)',
      'HLE defeats BLG (Bo3)',
    ])
    expect(view.problems).toEqual([])
    expect(view.creators).toEqual(['RedzoneITG', 'SteveSokolowski'])
  })

  it('marks the title odds with where each team stands', () => {
    expect(view.odds.map((o) => [o.text, o.standing])).toEqual([
      ['Gen. G', 'through'],
      ['Hanwha Life Esports', 'alive'],
      ['G2 Esports', 'out'],
      ['Other', 'unknown'],
      // Went out in the Play-In.
      ['Cloud9 KIA', 'out'],
    ])
  })

  it('finishes with the winner market', () => {
    const ti = ESPORTS_EVENTS.find((e) => e.key === 'dota-ti-2026')!
    const done = esportsEventView(
      ti,
      {
        '2nl5I6cN66': {
          id: '2nl5I6cN66',
          isResolved: true,
          resolution: 'a1',
          answers: answers([
            ['Team Liquid', undefined, 0],
            ['Team Spirit', undefined, 1],
          ]),
        },
      },
      NOW
    )
    expect(done.status).toBe('finished')
    expect(done.champion).toBe('Team Spirit')
    expect(done.odds.map((o) => o.standing)).toEqual(['champion', 'out'])
  })

  // Codex review, 31 Oct: four ways the reading could claim too much.

  it('reads a series that names a knockout round as a bracket one', () => {
    const settled = answers([
      // A quarterfinal placeholder added before the Swiss stage, edited later.
      ['Quarterfinals - GEN defeats KC (Bo5)', 'YES'],
      ...WORLDS.slice(0, 31),
      ['LOS defeats LYON (Bo3)', 'NO'],
      ['KC defeats MKOI (Bo3)', 'YES'],
      ['HLE defeats BLG (Bo3)', 'YES'],
    ])
    const v = esportsEventView(
      worlds,
      { ...markets, ynAsZLIl50: { ...markets.ynAsZLIl50, answers: settled } },
      NOW
    )
    const kc = v.swiss!.standings.records.find((r) => r.team.code === 'KC')!
    expect([kc.wins, kc.losses, kc.status]).toEqual([3, 2, 'through'])
    expect(v.bracket!.rounds[0].series.map((s) => s.text)).toEqual([
      'Quarterfinals - GEN defeats KC (Bo5)',
    ])
  })

  it('lets only the last stage crown a champion', () => {
    const v = esportsEventView(
      worlds,
      {
        ...markets,
        '8CNt8EuP5P': {
          ...markets['8CNt8EuP5P'],
          answers: answers([['[GF] Karmine Corp defeats MVK Esports', 'YES']]),
        },
      },
      NOW
    )
    expect(v.champion).toBeUndefined()
    expect(v.status).toBe('in-progress')
  })

  it("doesn't show a Play-In final as the event's final", () => {
    const v = esportsEventView(
      worlds,
      {
        '8CNt8EuP5P': {
          ...markets['8CNt8EuP5P'],
          answers: answers([['[GF] Karmine Corp defeats MVK Esports', 'YES']]),
        },
        td8NIdpz9N: {
          ...markets.td8NIdpz9N,
          isResolved: true,
          resolution: 'a0',
        },
      },
      NOW
    )
    expect(v.champion).toBe('Gen. G')
    expect(v.finalSeries).toBeUndefined()
  })

  it("shows the last labelled stage's grand final", () => {
    const val = ESPORTS_EVENTS.find((e) => e.key === 'val-champions-2026')!
    const v = esportsEventView(
      val,
      {
        stIyIP660t: {
          id: 'stIyIP660t',
          isResolved: true,
          answers: answers([
            ['[UBF] Team Vitality beats LOUD', 'NO'],
            ['[GF] LOUD beats Team Vitality (L)', 'YES'],
          ]),
        },
      },
      NOW
    )
    expect(v.champion).toBe('LOUD')
    expect(v.finalSeries?.text).toBe('[GF] LOUD beats Team Vitality (L)')
  })

  it("doesn't put Play-In teams out while the Play-In is on", () => {
    const v = esportsEventView(
      worlds,
      {
        ...markets,
        '8CNt8EuP5P': {
          ...markets['8CNt8EuP5P'],
          isResolved: false,
          closeTime: NOW + 1e9,
          answers: answers([['Cloud9 defeats Karmine Corp', undefined, 0.4]]),
        },
        ynAsZLIl50: { ...markets.ynAsZLIl50, answers: [] },
      },
      NOW
    )
    expect(v.stages[0].state).toBe('current')
    expect(v.odds.find((o) => o.text === 'Cloud9 KIA')!.standing).toBe(
      'unknown'
    )
  })

  it("doesn't finish an event when a market didn't load", () => {
    const v = esportsEventView(
      worlds,
      { '8CNt8EuP5P': markets['8CNt8EuP5P'] },
      NOW
    )
    expect(v.status).toBe('in-progress')
  })
})

describe('eventChampion', () => {
  it("names the winner market's resolved answer", () => {
    expect(
      eventChampion({
        winner: {
          resolution: 'b',
          answers: [
            { id: 'a', text: 'Team Liquid', prob: 0 },
            { id: 'b', text: 'Team Spirit', prob: 1 },
          ],
        },
      })
    ).toBe('Team Spirit')
  })

  it('falls back to the grand final series', () => {
    const { series } = readSeries(
      { id: 'v', closeTime: NOW - 1, isResolved: true },
      answers([
        ['[UBF] Team Vitality beats LOUD', 'NO'],
        ['[GF] LOUD beats Team Vitality (L)', 'YES'],
      ]),
      [],
      NOW
    )
    expect(eventChampion({ series })).toBe('LOUD')
  })
})

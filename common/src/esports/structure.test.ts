import { readEsportsSeries, readEsportsStageMeta } from '../bdl/esports-series'
import {
  buildTournamentViews,
  classifyStage,
  esportsEvents,
  parseRound,
  stageSignals,
} from './structure'
import {
  RECORDED,
  VCT_EUROPE_STAGE_ROWS,
  providerRows,
  type RecordedStage,
} from './structure.fixtures'
import type {
  BracketView,
  EsportsSeriesFacts,
  EsportsStageMeta,
  EsportsStageSignal,
  StageTemplate,
  StageView,
} from './types'

type Row = Record<string, unknown>
const R = RECORDED
const HOUR = 60 * 60 * 1000

/** Recorded rows through the reader, optionally changed first. */
const read = (
  stage: RecordedStage,
  change: (row: Row) => Row | null = (row) => row,
  observedAtMs: number | null = null
) =>
  providerRows(stage).flatMap((row) => {
    const changed = change(row)
    return (
      (changed && readEsportsSeries(stage.game, changed, observedAtMs)) ?? []
    )
  })
const build = (series: EsportsSeriesFacts[], meta?: EsportsStageMeta[]) =>
  buildTournamentViews(series, meta)
const only = (series: EsportsSeriesFacts[], meta?: EsportsStageMeta[]) => {
  const views = build(series, meta)
  expect(views).toHaveLength(1)
  expect(views[0].stages).toHaveLength(1)
  return { event: views[0], ...views[0].stages[0] }
}
type ViewOf<K, V = StageView> = V extends StageView
  ? K extends V['kind']
    ? V
    : never
  : never
function as<K extends StageView['kind']>(view: StageView, kind: K) {
  if (view.kind !== kind) throw Error(`expected ${kind}, got ${view.kind}`)
  return view as ViewOf<K>
}
const names = (teams: { team: { name: string } }[]) =>
  teams.map((t) => t.team.name)
const ids = (series: (EsportsSeriesFacts | null)[]) =>
  series.map((s) => s?.id ?? null)
const signal = (changes: Partial<EsportsStageSignal>): EsportsStageSignal => ({
  game: 'cs',
  tournamentId: 1,
  stageId: 1,
  stageName: 'Cup Main Stage',
  stageType: null,
  stageOrder: null,
  format: null,
  promotionCount: null,
  roundLabels: [],
  ...changes,
})
const unlabelled = (id: number) => (row: Row) =>
  row.id !== id
    ? row
    : {
        ...row,
        round: null,
        status: 'upcoming',
        status_state: 'scheduled',
        winner: null,
        team1_score: 0,
        team2_score: 0,
      }

describe('round labels', () => {
  test.each([
    ['Opening matches', { family: 'gsl', slot: 'opening' }],
    ['Opening', { family: 'gsl', slot: 'opening' }],
    ["Winners' match", { family: 'gsl', slot: 'winners' }],
    ["Winner's match", { family: 'gsl', slot: 'winners' }],
    ['Elimination match', { family: 'gsl', slot: 'elimination' }],
    ['Decider match', { family: 'gsl', slot: 'decider' }],
    [
      'Upper Bracket Quarterfinals',
      { family: 'double', lane: 'upper', rank: 1 },
    ],
    ['Upper bracket round of 16', { family: 'double', lane: 'upper', n: 16 }],
    ['Lower bracket round  2', { family: 'double', lane: 'lower', n: 2 }],
    ['Lower bracket final', { family: 'double', lane: 'lower', rank: 3 }],
    ['Grand Final', { family: 'final', lane: 'final', rank: 3 }],
    ['Finals', { family: 'final', lane: 'final', rank: 3 }],
    ['Round of 16', { family: 'single', lane: 'upper', n: 16 }],
    ['Semifinals', { family: 'single', lane: 'upper', rank: 2 }],
    ['3rd place decider', { family: 'single', lane: 'final', rank: 2 }],
    ['Third Place Match', { family: 'single', lane: 'final', rank: 2 }],
    ['Round 4', { family: 'round', n: 4 }],
  ])('%s', (label, expected) => {
    expect(parseRound(label)).toMatchObject(expected)
  })
  // Typos and labels with no fixed meaning are never guessed at.
  test.each([
    'Deciedr match',
    'Quarterinal',
    'Round fo 16',
    'Consolidation final',
    'Qualification',
    'Round 2 low',
    'Decider',
    '',
  ])('unknown: "%s"', (label) => {
    expect(parseRound(label).family).toBe('unknown')
  })
})

describe('classifyStage', () => {
  test.each<[Partial<EsportsStageSignal>, StageTemplate, RegExp]>([
    [{ stageId: null }, 'list', /No stage was sent/],
    [{}, 'list', /No stage type was sent/],
    [{ stageType: 'league' }, 'list', /Unknown stage type "league"/],
    [
      { stageType: 'league', roundLabels: ['Quarterfinal', 'Final'] },
      'list',
      /Unknown stage type "league"/,
    ],
    [{ stageType: 'swiss' }, 'swiss', /sent as "swiss"/],
    [{ stageType: 'swiss', roundLabels: ['Round 1'] }, 'swiss', /sent as/],
    [
      {
        stageType: 'group',
        stageLabel: 'Swiss Stage',
        roundLabels: ['Round 1'],
      },
      'swiss',
      /named "Swiss Stage"/,
    ],
    [{ stageLabel: 'Swiss Stage' }, 'swiss', /named "Swiss Stage"/],
    [{ stageLabel: 'Group A' }, 'group-table', /named "Group A"/],
    [{ format: 'round_robin' }, 'group-table', /sent as "round robin"/],
    [{ format: 'playoff' }, 'list', /sent as "playoff" with no bracket/],
    [{ stageType: 'group' }, 'group-table', /sent as "group"/],
    [
      { stageType: 'group', roundLabels: ['Opening matches'] },
      'group-table',
      /sent as "group"/,
    ],
    [
      { stageType: 'playoff', roundLabels: ['Opening matches'] },
      'list',
      /no bracket round labels/,
    ],
    [
      { stageType: 'playoff', roundLabels: ['Round 1', 'Round 2'] },
      'list',
      /no bracket round labels/,
    ],
    [
      {
        stageType: 'playoff',
        roundLabels: [
          'Round of 16',
          'Quarterfinals',
          'Semifinals',
          'Grand Final',
        ],
      },
      'single-elim',
      /knockout rounds/,
    ],
    [
      { stageType: 'playoff', roundLabels: ['Round 1', 'Quarterfinal'] },
      'single-elim',
      /knockout rounds/,
    ],
    [
      {
        stageType: 'group',
        roundLabels: ['Upper bracket semifinal', 'Lower bracket final'],
      },
      'double-elim',
      /upper and lower bracket/,
    ],
    [
      {
        stageType: 'playoff',
        roundLabels: ['Opening matches', 'Winners match', 'Decider match'],
      },
      'group-gsl',
      /GSL rounds/,
    ],
  ])('%j is %s', (changes, template, reason) => {
    const result = classifyStage(signal(changes))
    expect(result.template).toBe(template)
    expect(result.reason).toMatch(reason)
  })

  // A group stage with numbered rounds is Swiss only when it has too few
  // rounds to be a round robin. Recorded: 16 teams over 5 rounds is Swiss,
  // 6 teams over 5 rounds is a round robin.
  test.each([
    [16, 5, 'swiss'],
    [17, 5, 'swiss'],
    [6, 5, 'group-table'],
    [8, 7, 'group-table'],
    [5, 5, 'group-table'],
    [16, null, 'group-table'],
  ] as const)('group, %s teams, %s rounds: %s', (teams, rounds, template) => {
    const result = classifyStage(
      signal({
        stageType: 'group',
        roundLabels: ['Round 1', 'Round 2', 'Round 3'],
        teamCount: teams,
        roundsCount: rounds,
      })
    )
    expect(result.template).toBe(template)
  })

  test.each<[Partial<EsportsStageSignal>, RegExp]>([
    [
      { stageType: 'swiss', roundLabels: ['Upper bracket final'] },
      /sent as "swiss" but has bracket round labels/,
    ],
    [
      { stageType: 'swiss', roundLabels: ['Opening matches', 'Decider match'] },
      /sent as "swiss" but has GSL round labels/,
    ],
    [
      { stageType: 'swiss', roundLabels: ['Quarterfinal'] },
      /sent as "swiss" but has knockout round labels/,
    ],
    [
      { stageType: 'group', roundLabels: ['Quarterfinal', 'Grand final'] },
      /sent as "group" but has knockout round labels/,
    ],
    [
      { stageType: 'playoff', stageLabel: 'Swiss Stage' },
      /named "Swiss Stage" but sent as "playoff"/,
    ],
    [
      { roundLabels: ['Quarterfinal', 'Upper bracket semifinal'] },
      /mix vocabularies/,
    ],
    [
      { stageType: 'swiss', roundLabels: ['Round 1', 'Opening matches'] },
      /mix vocabularies/,
    ],
    [
      { roundLabels: ['Decider match', 'Upper bracket final'] },
      /mix vocabularies/,
    ],
    [
      {
        roundLabels: ['Opening matches', 'Decider match'],
        labelCounts: { 'Opening matches': 3, 'Decider match': 1 },
      },
      /more series than one group holds/,
    ],
    [
      { format: 'round_robin', stageLabel: 'Swiss Stage' },
      /named "Swiss Stage" but sent as "round robin"/,
    ],
  ])('falls back to a list: %j', (changes, reason) => {
    const result = classifyStage(signal(changes))
    expect(result.template).toBe('list')
    expect(result.reason).toMatch(reason)
  })

  test('keeps unknown labels for the coverage report', () => {
    expect(
      classifyStage(
        signal({
          stageType: 'playoff',
          roundLabels: ['Semifinal', 'Quarterinal'],
        })
      )
    ).toEqual({
      template: 'list',
      reason: 'Unknown round labels: Quarterinal.',
      unknownLabels: ['Quarterinal'],
    })
  })
})

describe('Swiss', () => {
  test('PGL Major Singapore 2026 Stage 1, live after three rounds', () => {
    const { classification, state, label, signal, view } = only(
      read(R.pglStage1)
    )
    expect(classification.template).toBe('swiss')
    expect(classification.reason).toBe('The stage is sent as "swiss".')
    expect(signal).toMatchObject({
      teamCount: 16,
      roundsCount: 5,
      stageOrder: 1,
    })
    expect([label, state]).toEqual(['Stage 1', 'current'])
    const swiss = as(view, 'swiss')
    expect(
      swiss.buckets.map((b) => [`${b.wins}-${b.losses}`, names(b.teams)])
    ).toEqual([
      ['3-0', ['FlyQuest', 'Ninjas in Pyjamas']],
      [
        '2-1',
        [
          'Eternal Fire',
          'Imperial',
          'Liquid',
          'Lynn Vision',
          'M80',
          'PARIVISION',
        ],
      ],
      [
        '1-2',
        [
          '100 Thieves',
          '9z',
          'Chinggis Warriors',
          'FaZe',
          'HEROIC',
          'Wildcard',
        ],
      ],
      ['0-3', ['BC.Game', 'DENDELE']],
    ])
    const flyQuest = swiss.buckets[0].teams[0]
    expect(flyQuest).toMatchObject({ results: ['W', 'W', 'W'], status: null })
    expect(flyQuest.team).toEqual({ id: 6303, name: 'FlyQuest', code: 'FLY' })
    // Round four is paired, with each team's record going in. The provider
    // labels a series only once it starts, so the round comes from games played.
    expect(swiss.round).toBe(4)
    expect(
      swiss.pending.map((p) => [
        p.series.team1?.name,
        `${p.record1.wins}-${p.record1.losses}`,
        p.series.team2?.name,
        `${p.record2.wins}-${p.record2.losses}`,
      ])
    ).toEqual([
      ['M80', '2-1', 'Eternal Fire', '2-1'],
      ['HEROIC', '1-2', 'FaZe', '1-2'],
      ['Lynn Vision', '2-1', 'PARIVISION', '2-1'],
      ['100 Thieves', '1-2', '9z', '1-2'],
      ['Imperial', '2-1', 'Liquid', '2-1'],
      ['Wildcard', '1-2', 'Chinggis Warriors', '1-2'],
    ])
    expect(swiss.series).toHaveLength(33)
    expect(swiss.problems).toEqual([])
    // Nobody is through or out on three wins or losses alone.
    const rows = swiss.buckets.flatMap((b) => b.teams)
    expect(rows.every((r) => r.status === null)).toBe(true)
  })

  test('a stage sent as "group" is Swiss when its rounds are too few', () => {
    const { classification, view, state } = only(read(R.bucharestGroup))
    expect(classification.template).toBe('swiss')
    expect(classification.reason).toBe(
      'The stage is sent as "group" with 5 numbered rounds for 16 teams, ' +
        'too few for a round robin.'
    )
    const swiss = as(view, 'swiss')
    expect(state).toBe('done')
    expect(swiss.round).toBe(5)
    expect(swiss.pending).toEqual([])
    expect(
      swiss.buckets.map((b) => [`${b.wins}-${b.losses}`, names(b.teams)])
    ).toEqual([
      ['3-0', ['BetBoom', 'FUT']],
      ['3-1', ['Aurora', 'MOUZ', 'Vitality']],
      ['3-2', ['FURIA', 'Natus Vincere', 'Nemiga']],
      ['2-3', ['Liquid', 'Spirit', 'The MongolZ']],
      ['1-3', ['DENDELE', 'Legacy', 'TYLOO']],
      ['0-3', ['9z', 'G2']],
    ])
    // The stage is done, but with no later stage and no promotion count
    // nothing says who went through.
    const rows = swiss.buckets.flatMap((b) => b.teams)
    expect(rows.every((r) => r.status === null)).toBe(true)
  })

  test('through and out come from who plays in a later stage', () => {
    const [event] = build([
      ...read(R.bucharestGroup),
      ...read(R.bucharestPlayoffs),
      ...read(R.bucharestDecider),
    ])
    expect(event.stages.map((s) => s.label)).toEqual([
      'Group Stage',
      'Playoffs',
      'Decider',
    ])
    const rows = as(event.stages[0].view, 'swiss').buckets.flatMap(
      (b) => b.teams
    )
    expect(names(rows.filter((r) => r.status === 'through'))).toEqual([
      'BetBoom',
      'FUT',
      'Aurora',
      'MOUZ',
      'Vitality',
      'FURIA',
      'Natus Vincere',
      'Nemiga',
    ])
    expect(rows.filter((r) => r.status === 'out')).toHaveLength(8)

    // While the playoffs are only partly known, the others are not "out":
    // some of them have as many wins as a team that is through.
    const [partial] = build([
      ...read(R.bucharestGroup),
      ...read(R.bucharestPlayoffs).slice(0, 2),
    ])
    const early = as(partial.stages[0].view, 'swiss').buckets.flatMap(
      (b) => b.teams
    )
    expect(names(early.filter((r) => r.status === 'through'))).toEqual([
      'FUT',
      'Vitality',
      'Natus Vincere',
      'Nemiga',
    ])
    expect(early.filter((r) => r.status === 'out')).toEqual([])
  })

  test('through and out come from the promotion count when the cut is clean', () => {
    const promote = (promotionCount: number): EsportsStageMeta[] => [
      {
        game: 'cs',
        stageId: 9268,
        tournamentId: 18615,
        format: null,
        sequence: null,
        promotionCount,
      },
    ]
    const statuses = (count: number) =>
      as(only(read(R.bucharestGroup), promote(count)).view, 'swiss')
        .buckets.flatMap((b) => b.teams)
        .map((r) => r.status)
    expect(statuses(8)).toEqual([
      ...Array(8).fill('through'),
      ...Array(8).fill('out'),
    ])
    // Six would split teams that all have three wins.
    expect(statuses(6)).toEqual(Array(16).fill(null))
  })

  test('captures disagree on the stage type, and a forfeit is not a result', () => {
    const early = Date.parse('2026-11-25T12:27:00Z')
    const late = Date.parse('2026-11-26T03:52:00Z')
    const unpaired = (row: Row) => row.team1 === null
    const asGroup = (row: Row) =>
      unpaired(row)
        ? { ...row, stage: { ...R.cctGroupStage.stage, stage_type: 'group' } }
        : null
    const series = [
      ...read(R.cctGroupStage, asGroup, early),
      ...read(R.cctGroupStage, (row) => (unpaired(row) ? null : row), late),
    ]
    expect(series).toHaveLength(8)
    const { signal, classification, view } = only(series)
    expect(signal.stageType).toBe('swiss')
    expect(signal.problems).toEqual([
      "The stage's type was sent as swiss and group; using swiss, the latest.",
    ])
    expect(classification.template).toBe('swiss')
    // Had the "group" captures been the later ones, group would win.
    const reversed = [
      ...read(R.cctGroupStage, asGroup, late),
      ...read(R.cctGroupStage, (row) => (unpaired(row) ? null : row), early),
    ]
    expect(stageSignals(reversed)[0].stageType).toBe('group')

    // Leo's only "win" was a forfeit by ex-ENCE: neither team has a record.
    const swiss = as(view, 'swiss')
    expect(
      swiss.buckets.map((b) => [`${b.wins}-${b.losses}`, names(b.teams)])
    ).toEqual([
      ['1-0', ['Aces', 'Lunacy', 'aimclub']],
      [
        '0-0',
        ['Drama', 'FORZE Reload', 'Hype Tech', 'Leo', 'XMETA', 'ex-ENCE'],
      ],
      ['0-1', ['Butterfly', 'MAYBE', 'Noir Verse']],
    ])
    expect(swiss.problems).toEqual([
      'Finished series with no trusted result, not counted: 1.',
    ])
    expect(swiss.pending).toHaveLength(2)
    expect(swiss.round).toBe(1)
  })

  test('a series captured twice counts once, as its latest capture', () => {
    const forfeited = (row: Row) =>
      row.id === 19142550 ? { ...row, status: 'defwin' } : null
    const swiss = as(
      only([
        ...read(R.pglStage1, undefined, 1000),
        ...read(R.pglStage1, forfeited, 2000),
      ]).view,
      'swiss'
    )
    expect(swiss.series).toHaveLength(33)
    // Imperial's round-one win over HEROIC was later sent as a forfeit.
    const rows = swiss.buckets.flatMap((b) => b.teams)
    expect(rows.find((r) => r.team.name === 'Imperial')).toMatchObject({
      wins: 1,
      losses: 1,
    })
    expect(rows.find((r) => r.team.name === 'HEROIC')).toMatchObject({
      wins: 1,
      losses: 1,
    })
    expect(swiss.problems).toEqual([
      'Finished series with no trusted result, not counted: 1.',
    ])
  })

  test('nobody is "out" while a result in the stage is held', () => {
    const forfeit = (row: Row) =>
      row.id === 18041433 ? { ...row, status: 'defwin' } : row
    const [event] = build([
      ...read(R.bucharestGroup, forfeit),
      ...read(R.bucharestPlayoffs),
    ])
    const rows = as(event.stages[0].view, 'swiss').buckets.flatMap(
      (b) => b.teams
    )
    // Playing in the playoffs is still evidence of going through.
    expect(rows.filter((r) => r.status === 'through')).toHaveLength(8)
    expect(rows.filter((r) => r.status === 'out')).toEqual([])
  })

  test('nobody is "out" before every promoted team is named (made-up rows)', () => {
    const team = (id: number) => ({ id, name: `Team ${id}` })
    const row = (id: number, round: string | null, a: number, b: number) => ({
      id,
      tournament: { id: 1, name: 'Cup', tier: 's' },
      stage: { id: 1, name: 'Cup Swiss', stage_type: 'swiss', stage_order: 1 },
      round,
      team1: team(a),
      team2: team(b),
      team1_score: 2,
      team2_score: 0,
      winner: team(a),
      best_of: 3,
      status: 'finished',
      status_state: 'final',
      start_time: `2026-01-0${id}T10:00:00.000Z`,
    })
    const playoff = {
      ...row(9, null, 1, 5),
      stage: {
        id: 2,
        name: 'Cup Playoffs',
        stage_type: 'playoff',
        stage_order: 2,
      },
      team2: null,
      team1_score: null,
      team2_score: null,
      winner: null,
      status: 'upcoming',
      status_state: 'scheduled',
    }
    // Team 1 is 2-0 and already in the playoffs. Team 2 is 1-0, behind on
    // wins, but two teams are promoted and only one has been named.
    const series = [
      row(1, 'Round 1', 1, 3),
      row(2, 'Round 1', 2, 4),
      row(3, 'Round 2', 1, 4),
      playoff,
    ].flatMap((r) => readEsportsSeries('cs', r) ?? [])
    const statuses = (promotionCount: number | null) => {
      const meta = [
        {
          game: 'cs' as const,
          stageId: 1,
          tournamentId: 1,
          format: null,
          sequence: null,
          promotionCount,
        },
      ]
      const [event] = build(series, meta)
      return as(event.stages[0].view, 'swiss')
        .buckets.flatMap((b) => b.teams)
        .map((r) => [r.team.id, r.status])
    }
    expect(statuses(2)).toEqual([
      [1, 'through'],
      [2, null],
      [3, null],
      [4, null],
    ])
    expect(statuses(1)).toEqual([
      [1, 'through'],
      [2, 'out'],
      [3, 'out'],
      [4, 'out'],
    ])
  })

  test('Valorant Swiss stage: chosen by name, no result counted', () => {
    const { classification, view, label } = only(read(R.vctEuropeSwiss))
    expect(label).toBe('Swiss Stage')
    expect(classification).toEqual({
      template: 'swiss',
      reason: 'The stage is named "Swiss Stage".',
      unknownLabels: [],
    })
    const swiss = as(view, 'swiss')
    // Valorant sends no best-of, so the reader holds every result.
    expect(swiss.buckets).toHaveLength(1)
    expect(swiss.buckets[0]).toMatchObject({ wins: 0, losses: 0 })
    expect(swiss.buckets[0].teams).toHaveLength(16)
    expect(swiss.problems).toEqual([
      'Finished series with no trusted result, not counted: 8.',
    ])
    expect(swiss.round).toBe(2)
    expect(swiss.pending).toHaveLength(8)
    expect(swiss.pending[0].series.team1?.code).toBe('EP')
    expect(swiss.series?.filter((s) => s.status === 'final')).toHaveLength(8)
  })
})

describe('groups', () => {
  test('CS2 GSL group', () => {
    const { classification, view, state } = only(read(R.thunderpickGroupA))
    expect(classification.template).toBe('group-gsl')
    expect(state).toBe('done')
    const gsl = as(view, 'group-gsl')
    expect(gsl.slots.map((s) => [s.slot, s.label, s.series?.id])).toEqual([
      ['opening-1', 'Opening matches', 17665206],
      ['opening-2', 'Opening matches', 17665201],
      ['winners', "Winners' match", 17665181],
      ['elimination', 'Elimination match', 17665176],
      ['decider', 'Decider match', 17665155],
    ])
    expect(gsl.unplaced).toEqual([])
    expect(gsl.problems).toEqual([])
  })

  test('a GSL group in play: empty slots and the unlabelled series', () => {
    const { classification, view } = only(
      read(R.thunderpickGroupA, unlabelled(17665155))
    )
    expect(classification.template).toBe('group-gsl')
    const gsl = as(view, 'group-gsl')
    expect(gsl.slots[4]).toEqual({
      slot: 'decider',
      label: 'Decider match',
      series: null,
    })
    expect(ids(gsl.unplaced ?? [])).toEqual([17665155])
    // With only the opening matches labelled, nothing says GSL yet.
    const opening = read(R.thunderpickGroupA).filter(
      (s) => s.round === 'Opening matches'
    )
    expect(only(opening).classification.template).toBe('group-table')
  })

  test('group table: wins, losses and map difference', () => {
    // The same recorded group, read as a plain table.
    const table = as(
      only(
        read(R.thunderpickGroupA, (row) => ({
          ...row,
          round: 'Opening matches',
        }))
      ).view,
      'group-table'
    )
    expect(
      table.rows.map((r) => [r.team.name, r.played, r.wins, r.losses, r.diff])
    ).toEqual([
      ['Falcons', 2, 2, 0, 3],
      ['Aurora', 3, 2, 1, 2],
      ['9z', 3, 1, 2, -1],
      ['Ninjas in Pyjamas', 2, 0, 2, -4],
    ])
    expect(table.series).toHaveLength(5)
  })

  test('Valorant group: chosen by name, no result counted', () => {
    const { classification, view, label } = only(read(R.vctTurkiyeGroupA))
    expect(label).toBe('Group A')
    expect(classification).toMatchObject({
      template: 'group-table',
      reason: 'The stage is named "Group A".',
    })
    const table = as(view, 'group-table')
    expect(table.rows).toHaveLength(4)
    expect(table.rows.every((r) => r.played === 0 && r.diff === 0)).toBe(true)
    expect(table.series).toHaveLength(5)
    expect(table.problems).toEqual([
      'Finished series with no trusted result, not counted: 2.',
    ])
  })
})

describe('brackets', () => {
  const columns = (view: BracketView) =>
    view.columns.map((c) => [c.lane, c.order, c.label, c.series.length])
  const link = (view: BracketView, to: number) =>
    view.links
      .filter((l) => l.to === to)
      .map((l) => `${l.from} ${l.carries}`)
      .sort()

  test('CS2 double elimination with upper and lower lanes', () => {
    const { classification, view, event } = only(read(R.starladderPlayoffs))
    expect(classification.template).toBe('double-elim')
    const bracket = as(view, 'double-elim')
    expect(columns(bracket)).toEqual([
      ['upper', 0, 'Upper bracket quarterfinal', 4],
      ['upper', 1, 'Upper bracket semifinal', 2],
      ['upper', 2, 'Upper bracket final', 1],
      ['lower', 0, 'Lower bracket round 1', 2],
      ['lower', 1, 'Lower bracket quarterfinal', 2],
      ['lower', 2, 'Lower bracket semifinal', 1],
      ['lower', 3, 'Lower bracket final', 1],
      ['final', 0, 'Grand final', 1],
    ])
    expect(bracket.columns.every((c) => c.placeholders === 0)).toBe(true)
    expect(bracket.links).toHaveLength(20)
    expect(bracket.links.filter((l) => l.carries === 'loser')).toHaveLength(7)
    // Lower round 1: the losers of two upper quarterfinals.
    expect(link(bracket, 15653429)).toEqual([
      '15653449 loser',
      '15653485 loser',
    ])
    // Lower final: the upper final's loser meets the lower semifinal's winner.
    expect(link(bracket, 15653352)).toEqual([
      '15653359 winner',
      '15653364 loser',
    ])
    // Grand final: the winners of the upper and lower finals.
    expect(link(bracket, 15653347)).toEqual([
      '15653352 winner',
      '15653364 winner',
    ])
    expect(bracket.champion).toEqual({ id: 650, name: 'Vitality', code: 'VIT' })
    expect(event).toMatchObject({
      status: 'finished',
      champion: { name: 'Vitality' },
    })
  })

  test('CS2 single elimination, its third-place stage, and the champion', () => {
    const [event] = build([
      ...read(R.bucharestPlayoffs),
      ...read(R.bucharestDecider),
    ])
    const [playoffs, decider] = event.stages
    expect(playoffs.classification.template).toBe('single-elim')
    const bracket = as(playoffs.view, 'single-elim')
    expect(columns(bracket)).toEqual([
      ['upper', 0, 'Quarterfinal', 4],
      ['upper', 1, 'Semifinal', 2],
      ['final', 0, 'Grand final', 1],
    ])
    expect(bracket.links).toEqual([
      { from: 18037794, to: 18041405, carries: 'winner' },
      { from: 18041418, to: 18041405, carries: 'winner' },
      { from: 18041414, to: 18041402, carries: 'winner' },
      { from: 18041411, to: 18041402, carries: 'winner' },
      { from: 18041405, to: 18041397, carries: 'winner' },
      { from: 18041402, to: 18041397, carries: 'winner' },
    ])
    expect(bracket.columns.every((c) => c.placeholders === 0)).toBe(true)
    expect(bracket.champion?.name).toBe('FURIA')
    // The third-place series is a bracket with no final, so no champion.
    const third = as(decider.view, 'single-elim')
    expect(columns(third)).toEqual([['final', 0, '3rd place', 1]])
    expect(third.champion).toBeNull()
    expect(event.champion).toEqual({ id: 631, name: 'FURIA', code: 'FURIA' })
    expect(event.status).toBe('finished')
  })

  test('no champion while anything in the event is still to come', () => {
    const later = (row: Row) => ({
      ...unlabelled(18041399)(row),
      start_time: '2026-11-01T08:00:00.000Z',
    })
    const [event] = build([
      ...read(R.bucharestPlayoffs),
      ...read(R.bucharestDecider, later),
    ])
    expect(as(event.stages[0].view, 'single-elim').champion?.name).toBe('FURIA')
    expect(event.champion).toBeNull()
    expect(event.status).toBe('in-progress')
    // Nor when another stage's series starts at the same moment as the final.
    const sameTime = (row: Row) => ({
      ...row,
      start_time: '2026-10-31T11:00:00.000Z',
    })
    const [tied] = build([
      ...read(R.bucharestPlayoffs),
      ...read(R.bucharestDecider, sameTime),
    ])
    expect(tied.champion).toBeNull()
    // Nor from two different pairings that are both labelled the final.
    const twoFinals = (row: Row) =>
      row.id === 18041405 ? { ...row, round: 'Grand final' } : row
    const split = only(read(R.bucharestPlayoffs, twoFinals))
    expect(as(split.view, 'single-elim').champion).toBeNull()
    expect(split.event.champion).toBeNull()
    // And none from a final whose result is held.
    const forfeited = (row: Row) =>
      row.id === 18041397 ? { ...row, status: 'defwin' } : row
    const held = only(read(R.bucharestPlayoffs, forfeited))
    expect(as(held.view, 'single-elim').champion).toBeNull()
    expect(held.event.champion).toBeNull()
  })

  test('a link is not drawn to a team that lost its previous series', () => {
    const { classification, view } = only(read(R.odysseyPlayoffs))
    expect(classification.template).toBe('single-elim')
    const bracket = as(view, 'single-elim')
    expect(columns(bracket)).toEqual([
      ['upper', 0, 'Quarterfinal', 4],
      ['upper', 1, 'Semifinal', 2],
      ['final', 0, '3rd place', 1],
      ['final', 1, 'Grand final', 1],
    ])
    // Flamengo and W7M play for third place after losing their semifinals.
    const thirdPlace = bracket.columns[2].series[0]
    expect([thirdPlace.team1?.name, thirdPlace.team2?.name]).toEqual([
      'Flamengo',
      'W7M',
    ])
    expect(link(bracket, 60033)).toEqual([])
    expect(link(bracket, 59985)).toEqual(['59983 winner', '59984 winner'])
    expect(bracket.links).toHaveLength(6)
    expect(bracket.problems).toEqual([])
    expect(bracket.champion?.name).toBe('Sharks')
  })

  test('a team that plays on after a loss gets no link and is flagged', () => {
    // The archive has six brackets like this, e.g. CCT Season 3 South
    // American Series 1: the provider's semifinal winner isn't in its final.
    const flipped = (row: Row) =>
      row.id === 18041402
        ? { ...row, team1_score: 2, team2_score: 1, winner: row.team1 }
        : row
    const bracket = as(
      only(read(R.bucharestPlayoffs, flipped)).view,
      'single-elim'
    )
    expect(link(bracket, 18041397)).toEqual(['18041405 winner'])
    expect(bracket.problems).toEqual([
      'FURIA plays "Grand final" after losing "Semifinal".',
    ])
  })

  test('a link is not drawn from a forfeit', () => {
    const { classification, view } = only(read(R.provingGrounds))
    expect(classification.template).toBe('single-elim')
    const bracket = as(view, 'single-elim')
    expect(columns(bracket)).toEqual([
      ['upper', 0, 'Round 1', 2],
      ['upper', 1, 'Quarterfinal', 1],
    ])
    // TNL won round 1. CYBERSHOKE got there by forfeit, which is held.
    expect(bracket.links).toEqual([
      { from: 61873, to: 61884, carries: 'winner' },
    ])
    expect(bracket.problems).toEqual([
      'Finished series with no trusted result, not counted: 1.',
    ])
  })

  test('placeholders only when round one is a power of two and the rest fits', () => {
    const without = (...gone: number[]) =>
      as(
        only(
          read(R.bucharestPlayoffs, (row) =>
            gone.includes(Number(row.id)) ? null : row
          )
        ).view,
        'single-elim'
      ).columns.map((c) => [c.label, c.series.length, c.placeholders])
    // Four quarterfinals: two semifinal slots, one of them still empty.
    expect(without(18041402)).toEqual([
      ['Quarterfinal', 4, 0],
      ['Semifinal', 1, 1],
      ['Grand final', 1, 0],
    ])
    // Three quarterfinals reported so far: the size isn't known.
    expect(without(18041411, 18041402)).toEqual([
      ['Quarterfinal', 3, 0],
      ['Semifinal', 1, 0],
      ['Grand final', 1, 0],
    ])
    // Two quarterfinals feeding two semifinals is a bracket with byes.
    expect(without(18037794, 18041418)).toEqual([
      ['Quarterfinal', 2, 0],
      ['Semifinal', 2, 0],
      ['Grand final', 1, 0],
    ])
    // Quarterfinals and a final with no semifinal column: a round is missing.
    expect(without(18041405, 18041402)).toEqual([
      ['Quarterfinal', 4, 0],
      ['Grand final', 1, 0],
    ])
    // Double elimination never gets placeholders.
    const double = only(
      read(R.starladderPlayoffs, (row) => (row.id === 15653395 ? null : row))
    )
    expect(
      as(double.view, 'double-elim').columns.every((c) => c.placeholders === 0)
    ).toBe(true)
  })

  test('a series with no start time cannot be ordered, so it gets no links', () => {
    const undated = (row: Row) =>
      row.id === 18041397 ? { ...row, start_time: null } : row
    const { view, event } = only(read(R.bucharestPlayoffs, undated))
    const bracket = as(view, 'single-elim')
    expect(link(bracket, 18041397)).toEqual([])
    expect(bracket.links).toHaveLength(4)
    expect(event.champion).toBeNull()
  })

  test('an upcoming series has no label yet, so it is left unplaced', () => {
    const { view, event, state } = only(
      read(R.bucharestPlayoffs, unlabelled(18041397))
    )
    const bracket = as(view, 'single-elim')
    expect(columns(bracket)).toEqual([
      ['upper', 0, 'Quarterfinal', 4],
      ['upper', 1, 'Semifinal', 2],
    ])
    expect(ids(bracket.unplaced ?? [])).toEqual([18041397])
    expect(bracket.links).toHaveLength(4)
    expect([state, bracket.champion, event.champion]).toEqual([
      'current',
      null,
      null,
    ])
  })
})

describe('list fallbacks', () => {
  test('contradictory: sent as a group, labelled as a knockout', () => {
    const { classification, view } = only(read(R.gamersClubPlayoffs))
    expect(classification).toEqual({
      template: 'list',
      reason: 'The stage is sent as "group" but has knockout round labels.',
      unknownLabels: [],
    })
    expect(as(view, 'list').days.map((d) => [d.date, ids(d.series)])).toEqual([
      ['2025-06-24', [60631]],
      ['2025-06-25', [60633, 60632]],
      ['2025-06-26', [60666, 60667]],
      ['2025-06-27', [60668]],
    ])
  })

  test('unknown round labels', () => {
    const { classification, view } = only(read(R.nodwinPlayIn))
    expect(classification).toEqual({
      template: 'list',
      reason: 'Unknown round labels: Qualification.',
      unknownLabels: ['Qualification'],
    })
    expect(as(view, 'list').days).toHaveLength(1)
  })

  test('Valorant playoff: a list, ordered by start then position', () => {
    const meta = VCT_EUROPE_STAGE_ROWS.flatMap(
      (row) => readEsportsStageMeta('valorant', row) ?? []
    )
    const { classification, view, signal, label } = only(
      read(R.vctEuropePlayoffs),
      meta
    )
    expect(label).toBe('Playoffs')
    expect(signal).toMatchObject({ format: 'playoff', stageOrder: 1 })
    expect(classification).toMatchObject({
      template: 'list',
      reason: 'The stage is sent as "playoff" with no bracket round labels.',
    })
    const [day] = as(view, 'list').days
    expect(day.date).toBe('2026-11-10')
    expect(day.series.map((s) => [s.id, s.position])).toEqual([
      [1295876, 2],
      [1295875, 3],
      [1295880, 1],
    ])
    // Without tournament_stages there is no type at all.
    expect(only(read(R.vctEuropePlayoffs)).classification.reason).toBe(
      'No stage type was sent.'
    )
  })

  test('League of Legends tournament: no stage, so a list', () => {
    const { classification, view, label, signal, event } = only(
      read(R.lcsPromotion)
    )
    expect(label).toBe('Matches')
    expect(signal).toMatchObject({
      stageId: null,
      stageName: null,
      teamCount: 4,
    })
    expect(classification).toMatchObject({
      template: 'list',
      reason: 'No stage was sent.',
    })
    const list = as(view, 'list')
    expect(list.days.map((d) => d.date)).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-12',
    ])
    const series = list.days.flatMap((d) => d.series)
    expect(series.every((s) => s.winnerId !== null && s.bestOf === 5)).toBe(
      true
    )
    expect(event).toMatchObject({
      game: 'lol',
      tournament: {
        id: 106226,
        name: 'LCS 2027 Promotion Tournament',
        tier: 's',
      },
      status: 'finished',
      champion: null,
    })
  })

  test('Dota 2 best of 2: a tie is a finished series with no winner', () => {
    const { view, state } = only(read(R.ewcDota))
    expect(state).toBe('done')
    const [tie] = as(view, 'list').days[0].series
    expect(tie).toMatchObject({
      score: { team1: 1, team2: 1 },
      winnerId: null,
      review: null,
    })
  })

  test('a series with no start time goes last, under "tbd"', () => {
    const untimed = (row: Row) =>
      row.id === 60668 ? { ...unlabelled(60668)(row), start_time: null } : row
    const list = as(only(read(R.gamersClubPlayoffs, untimed)).view, 'list')
    expect(list.days.map((d) => d.date)).toEqual([
      '2025-06-24',
      '2025-06-25',
      '2025-06-26',
      'tbd',
    ])
  })
})

describe('events', () => {
  const major = () => [
    ...read(R.pglStage1),
    ...read(R.pglStage2),
    ...read(R.pglStage3),
    ...read(R.pglPlayoffs),
    ...read(R.pglDecider),
  ]

  test('the PGL Major, which the provider splits into three tournaments', () => {
    const views = build(major())
    expect(views).toHaveLength(1)
    const [event] = views
    expect(event).toMatchObject({
      game: 'cs',
      tournament: { id: 2353, name: 'PGL Major Singapore 2026', tier: 's' },
      tournamentIds: [477506, 477508, 2353],
      status: 'in-progress',
      champion: null,
    })
    expect(
      event.stages.map((s) => [
        s.label,
        s.signal.tournamentId,
        s.classification.template,
        s.state,
      ])
    ).toEqual([
      ['Stage 1', 477506, 'swiss', 'current'],
      ['Stage 2', 477508, 'swiss', 'next'],
      ['Stage 3', 2353, 'swiss', 'next'],
      ['Playoffs', 2353, 'list', 'next'],
      ['Decider', 2353, 'list', 'next'],
    ])
    // Each of the three tournaments numbers its first stage 1, so the stages
    // follow the tournaments' own order, then stage_order. No order: last.
    expect(event.stages.map((s) => s.signal.stageOrder)).toEqual([
      1,
      1,
      1,
      4,
      null,
    ])
    // An unplayed playoff has no labels: a plain list, never a guessed bracket.
    expect(event.stages[3].classification.reason).toBe(
      'The stage is sent as "playoff" with no bracket round labels.'
    )
    // Stage 2's teams are unknown, so nobody in Stage 1 is through yet.
    const rows = as(event.stages[0].view, 'swiss').buckets.flatMap(
      (b) => b.teams
    )
    expect(rows.every((r) => r.status === null)).toBe(true)
  })

  test('"Stage N" joins only a tournament with exactly the base name', () => {
    // Without the base tournament the two stages stay separate.
    const apart = esportsEvents([...read(R.pglStage1), ...read(R.pglStage2)])
    expect(apart.map((e) => e.tournament.name).sort()).toEqual([
      'PGL Major Singapore 2026 Stage 1',
      'PGL Major Singapore 2026 Stage 2',
    ])
    // Nor does another year's event with a similar name pull them in.
    const renamed = (row: Row) => ({
      ...row,
      tournament: { id: 2353, name: 'PGL Major Singapore 2027', tier: 's' },
    })
    expect(
      esportsEvents([...read(R.pglStage1), ...read(R.pglStage3, renamed)])
    ).toHaveLength(2)
    // Nor the same name in another game.
    const dota = providerRows(R.pglStage3).flatMap(
      (row) =>
        readEsportsSeries('dota', { ...row, start_date: row.start_time }) ?? []
    )
    expect(esportsEvents([...read(R.pglStage1), ...dota])).toHaveLength(2)
  })

  test('"Stage N" does not join a same-named tournament months away', () => {
    const shift = (days: number) => (row: Row) => ({
      ...row,
      start_time: new Date(
        Date.parse(String(row.start_time)) + days * 24 * HOUR
      ).toISOString(),
    })
    const events = (days: number) =>
      esportsEvents([...read(R.pglStage1), ...read(R.pglStage3, shift(days))])
    // Recorded: Stage 3 starts five days after Stage 1's last series.
    expect(events(0)).toHaveLength(1)
    expect(events(20)).toHaveLength(1)
    expect(events(40)).toHaveLength(2)
    expect(events(-400)).toHaveLength(2)
  })

  test('several tournaments and games in one call stay apart', () => {
    const views = build([
      ...major(),
      ...read(R.starladderPlayoffs),
      ...read(R.vctEuropeSwiss),
      ...read(R.lcsPromotion),
      ...read(R.ewcDota),
    ])
    expect(views.map((v) => [v.game, v.tournament.id]).sort()).toEqual(
      [
        ['cs', 2353],
        ['cs', 2691],
        ['dota', 46174],
        ['lol', 106226],
        ['valorant', 1256398],
      ].sort()
    )
  })

  test('nothing in, nothing out', () => {
    expect(build([])).toEqual([])
    expect(stageSignals([])).toEqual([])
  })
})

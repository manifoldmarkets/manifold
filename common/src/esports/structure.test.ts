import { readEsportsSeries, readEsportsStageMeta } from '../bdl/esports-series'
import {
  buildTournamentViews,
  classifyStage,
  esportsEvents,
  parseRound,
  stageSignals,
  type BuildOptions,
  type StageSignal,
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
const build = (
  series: EsportsSeriesFacts[],
  meta?: EsportsStageMeta[],
  options?: BuildOptions
) => buildTournamentViews(series, meta, options)
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
const signal = (changes: Partial<StageSignal>): StageSignal => ({
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
// Made-up CS2 rows, for what the recordings don't hold. One tournament, "Cup".
const cupStage = (
  id: number,
  name: string,
  stage_type: string | null,
  stage_order: number | null = null,
  rounds_count: number | null = null
): Row => ({ id, name: `Cup ${name}`, stage_type, stage_order, rounds_count })
const cupTeam = (id: number) => ({ id, name: `Team ${id}` })
/** Team `a` beat team `b` 2-0 in a best of three, on January `day`. */
const made = (
  id: number,
  stage: Row | null,
  round: string | null,
  a: number,
  b: number,
  day: number | null = id
): Row => ({
  id,
  tournament: { id: 1, name: 'Cup', tier: 's' },
  stage,
  round,
  team1: cupTeam(a),
  team2: cupTeam(b),
  team1_score: 2,
  team2_score: 0,
  winner: cupTeam(a),
  best_of: 3,
  status: 'finished',
  status_state: 'final',
  start_time:
    day === null
      ? null
      : `2026-01-${String(day).padStart(2, '0')}T10:00:00.000Z`,
})
const facts = (rows: Row[], observedAtMs: number | null = null) =>
  rows.flatMap((row) => readEsportsSeries('cs', row, observedAtMs) ?? [])
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
  test.each<[Partial<StageSignal>, StageTemplate, RegExp]>([
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
    // Sent as Swiss, it is Swiss from round one, pairings joined up or not.
    [
      { stageType: 'swiss', roundLabels: ['Round 1'], pools: 8 },
      'swiss',
      /sent as "swiss"/,
    ],
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
    [{ stageLabel: 'Group A', pools: 1 }, 'group-table', /named "Group A"/],
    [
      { format: 'round_robin', pools: 1 },
      'group-table',
      /sent as "round robin"/,
    ],
    [{ format: 'playoff' }, 'list', /sent as "playoff" with no bracket/],
    [{ stageType: 'group', pools: 1 }, 'group-table', /sent as "group"/],
    [
      { stageType: 'group', roundLabels: ['Opening matches'], pools: 1 },
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

  // A group stage is a table or a Swiss board only when its pairings join
  // every team into one pool. Then it is Swiss when it has numbered rounds,
  // too few for a round robin. Recorded: 16 teams over 5 rounds is Swiss, 6
  // teams over 5 rounds is a round robin.
  test.each([
    [16, 5, 1, 'swiss'],
    [17, 5, 1, 'swiss'],
    [6, 5, 1, 'group-table'],
    [8, 7, 1, 'group-table'],
    [5, 5, 1, 'group-table'],
    [16, null, 1, 'group-table'],
    // The teams are in pools that never meet: separate groups, or a Swiss
    // stage's first rounds. Whatever the rounds count says, it is a list.
    [8, 3, 2, 'list'],
    [16, 5, 8, 'list'],
    [8, 7, 2, 'list'],
    [16, null, 2, 'list'],
    // Nor a board when no team is named, or nothing says how they pair.
    [0, 5, 0, 'list'],
    [16, 5, undefined, 'list'],
  ] as const)(
    'group, %s teams, %s rounds, %s pools: %s',
    (teams, rounds, pools, template) => {
      const result = classifyStage(
        signal({
          stageType: 'group',
          roundLabels: ['Round 1', 'Round 2', 'Round 3'],
          teamCount: teams,
          roundsCount: rounds,
          pools,
        })
      )
      expect(result.template).toBe(template)
    }
  )

  test.each<[Partial<StageSignal>, RegExp]>([
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
    // A group stage whose pairings don't join its teams into one pool.
    [
      { stageType: 'group', pools: 2 },
      /sent as "group", but its pairings form separate pools; the format isn't clear yet/,
    ],
    [
      { stageLabel: 'Group Stage', roundLabels: ['Round 1'], pools: 8 },
      /named "Group Stage", but its pairings form separate pools/,
    ],
    [
      { format: 'round_robin', pools: 0 },
      /sent as "round robin", but none of its pairings is known/,
    ],
    [{ stageType: 'group' }, /none of its pairings is known/],
    // A final or a third-place series alone ends either kind of bracket.
    [
      { stageType: 'playoff', roundLabels: ['Grand Final'] },
      /only a final or third-place series/,
    ],
    [{ roundLabels: ['3rd place'] }, /only a final or third-place series/],
    [
      { stageType: 'playoff', roundLabels: ['Final', 'Third place match'] },
      /only a final or third-place series/,
    ],
    // The latest captures disagree on what picks the layout.
    [
      {
        stageType: 'swiss',
        roundLabels: ['Round 1'],
        conflict: "The latest captures disagree on the stage's type (a and b).",
      },
      /latest captures disagree on the stage's type/,
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

  test('through comes from who plays in a later stage, out from the promotion count too', () => {
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
    const all = [
      ...read(R.bucharestGroup),
      ...read(R.bucharestPlayoffs),
      ...read(R.bucharestDecider),
    ]
    const [event] = build(all)
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
    // Eight teams with fewer wins are not "out": nothing says eight go through.
    expect(rows.filter((r) => r.status === 'out')).toEqual([])
    const statuses = (series: EsportsSeriesFacts[], count: number) =>
      as(build(series, promote(count))[0].stages[0].view, 'swiss')
        .buckets.flatMap((b) => b.teams)
        .map((r) => r.status)
    // With the provider's count of eight, all eight are named: the rest are out.
    expect(statuses(all, 8)).toEqual([
      ...Array(8).fill('through'),
      ...Array(8).fill('out'),
    ])
    // A count the named teams don't match leaves the others undecided.
    expect(statuses(all, 9).filter((s) => s === 'out')).toEqual([])
    expect(statuses(all, 6).filter((s) => s === 'out')).toEqual([])

    // While the playoffs are only partly known, the others are not "out",
    // count or no count: four of the eight are still to be named.
    const partial = [
      ...read(R.bucharestGroup),
      ...read(R.bucharestPlayoffs).slice(0, 2),
    ]
    const early = as(build(partial)[0].stages[0].view, 'swiss').buckets.flatMap(
      (b) => b.teams
    )
    expect(names(early.filter((r) => r.status === 'through'))).toEqual([
      'FUT',
      'Vitality',
      'Natus Vincere',
      'Nemiga',
    ])
    expect(early.filter((r) => r.status === 'out')).toEqual([])
    expect(statuses(partial, 8).filter((s) => s === 'out')).toEqual([])
  })

  test('a stage is later only by its start times, not by where it is shown (made-up rows)', () => {
    // A qualifier with no stage order is shown after the Swiss stage, which
    // has one. Played the day before, it proves nothing about the Swiss stage.
    const swiss = cupStage(1, 'Swiss', 'swiss', 1)
    const qualifier = cupStage(2, 'Qualifier', 'playoff')
    const statuses = (qualifierDay: number | null) => {
      const [event] = build(
        facts([
          made(1, qualifier, null, 1, 2, qualifierDay),
          made(2, swiss, 'Round 1', 1, 3, 2),
          made(3, swiss, 'Round 1', 2, 4, 2),
        ])
      )
      expect(event.stages.map((s) => s.label)).toEqual(['Swiss', 'Qualifier'])
      return as(event.stages[0].view, 'swiss')
        .buckets.flatMap((b) => b.teams)
        .map((r) => [r.team.id, r.status])
    }
    const nobody = [
      [1, null],
      [2, null],
      [3, null],
      [4, null],
    ]
    expect(statuses(1)).toEqual(nobody)
    // Nor a stage that starts at the same moment, or whose start isn't known.
    expect(statuses(2)).toEqual(nobody)
    expect(statuses(null)).toEqual(nobody)
    // Played the day after, it is a later stage: its two teams went through.
    expect(statuses(3)).toEqual([
      [1, 'through'],
      [2, 'through'],
      [3, null],
      [4, null],
    ])
  })

  test('a team is through only by its own dated series in a later stage (made-up rows)', () => {
    // The review's case: Team 1 played a qualifier series on January 1 whose
    // start wasn't sent, then lost in the Swiss stage on January 2. Another
    // qualifier pairing, Team 3 against Team 5, starts on January 3.
    const swiss = cupStage(1, 'Swiss', 'swiss', 1)
    const qualifier = cupStage(2, 'Qualifier', 'playoff')
    const statuses = (ownDay: number | null, more: Row[] = []) => {
      const [event] = build(
        facts([
          made(1, qualifier, null, 1, 2, ownDay),
          made(2, qualifier, null, 3, 5, 3),
          made(3, swiss, 'Round 1', 3, 1, 2),
          made(4, swiss, 'Round 1', 2, 4, 2),
          ...more,
        ])
      )
      expect(event.stages[0].label).toBe('Swiss')
      return as(event.stages[0].view, 'swiss')
        .buckets.flatMap((b) => b.teams)
        .map((r) => [r.team.id, r.status])
    }
    // Team 3's own series starts after the Swiss stage. Teams 1 and 2 have
    // only the undated one, and Team 3's start says nothing about theirs.
    const onlyTeam3 = [
      [2, null],
      [3, 'through'],
      [1, null],
      [4, null],
    ]
    expect(statuses(null)).toEqual(onlyTeam3)
    // With its start sent, the qualifier began before the Swiss stage's last
    // series: it isn't a later stage, for Team 3 either.
    expect(statuses(1)).toEqual([
      [2, null],
      [3, null],
      [1, null],
      [4, null],
    ])
    // Sent as starting after the Swiss stage, it is evidence for all three.
    expect(statuses(4)).toEqual([
      [2, 'through'],
      [3, 'through'],
      [1, 'through'],
      [4, null],
    ])
    // A later series sent with no stage is not a later stage.
    expect(statuses(null, [made(5, null, null, 4, 6, 5)])).toEqual(onlyTeam3)
    // A team named in a later stage's series whose start isn't known yet is
    // not through, and one with a start is.
    const playoffs = cupStage(3, 'Playoffs', 'playoff', 2)
    expect(
      statuses(1, [
        made(5, playoffs, 'Semifinal', 4, 2, null),
        made(6, playoffs, 'Semifinal', 3, 7, 6),
      ])
    ).toEqual([
      [2, null],
      [3, 'through'],
      [1, null],
      [4, null],
    ])
  })

  test('the promotion count marks teams only when every result is trusted and the cut is clean', () => {
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
    // A count that isn't a whole number above zero is no count.
    for (const count of [0, -8, 7.5, Number.NaN, Infinity])
      expect(statuses(count)).toEqual(Array(16).fill(null))
    // Nor two stage rows that disagree on it.
    const nobody = (
      series: EsportsSeriesFacts[],
      meta: EsportsStageMeta[] = promote(8)
    ) =>
      expect(
        as(only(series, meta).view, 'swiss')
          .buckets.flatMap((b) => b.teams)
          .map((r) => r.status)
      ).toEqual(Array(16).fill(null))
    nobody(read(R.bucharestGroup), [...promote(8), ...promote(9)])

    // The count stands on the stage's own results, so every series must be a
    // trusted result. One held as a forfeit, one still to be played, or one
    // whose winner is neither team, and it marks nobody.
    const forfeit = (row: Row) =>
      row.id === 18041433 ? { ...row, status: 'defwin' } : row
    nobody(read(R.bucharestGroup, forfeit))
    nobody(read(R.bucharestGroup, unlabelled(18041433)))
    // TYLOO's one win, over 9z: without it the top eight still all have more
    // wins than the rest, so only the bad result holds the count back.
    nobody(
      read(R.bucharestGroup).map((s) =>
        s.id === 18041477 ? { ...s, winnerId: 999999 } : s
      )
    )
    // Without a count, results alone mark nobody.
    nobody(read(R.bucharestGroup), [])
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
    // With no promotion count the gap in wins below Team 1 proves nothing:
    // it is through, and nobody is out.
    expect(statuses(null)).toEqual([
      [1, 'through'],
      [2, null],
      [3, null],
      [4, null],
    ])
  })

  test('the latest captures disagree on the stage type: a list, whichever ID is higher (made-up rows)', () => {
    const swiss = cupStage(1, 'Main Stage', 'swiss')
    const playoff = { ...swiss, stage_type: 'playoff' }
    const at = 5000
    const tied = (low: Row, high: Row) =>
      only([
        ...facts([made(1, low, 'Round 1', 1, 2)], at),
        ...facts([made(2, high, 'Round 1', 3, 4)], at),
      ])
    for (const stage of [tied(playoff, swiss), tied(swiss, playoff)]) {
      expect(stage.classification).toEqual({
        template: 'list',
        reason:
          "The latest captures disagree on the stage's type (playoff and swiss).",
        unknownLabels: [],
      })
      expect(stage.signal.stageType).toBeNull()
      expect(stage.signal.problems).toEqual([
        "The stage's type was sent as playoff and swiss in its latest " +
          'captures; none is used.',
      ])
      expect(stage.view.kind).toBe('list')
    }
    // Rows with no capture time are tied as well.
    const untimed = only(
      facts([
        made(1, playoff, 'Round 1', 1, 2),
        made(2, swiss, 'Round 1', 3, 4),
      ])
    )
    expect(untimed.classification.template).toBe('list')
    // One later capture settles it, as before.
    const settled = only([
      ...facts([made(1, playoff, 'Round 1', 1, 2)], at),
      ...facts([made(2, swiss, 'Round 1', 3, 4)], at + 1),
    ])
    expect(settled.classification.template).toBe('swiss')
    expect(settled.signal.problems).toEqual([
      "The stage's type was sent as swiss and playoff; using swiss, the latest.",
    ])
    // So does a later capture that agrees with one of the two tied ones.
    const outvoted = only([
      ...facts([made(1, playoff, 'Round 1', 1, 2)], at),
      ...facts([made(2, swiss, 'Round 1', 3, 4)], at),
      ...facts([made(3, swiss, 'Round 2', 1, 3)], at + 1),
    ])
    expect(outvoted.classification.template).toBe('swiss')

    // The name picks the layout where no type is sent, so a tie on it is the
    // same: "Swiss Stage" against "Group Stage" is neither.
    const named = (name: string) => cupStage(1, name, null)
    const renamed = only([
      ...facts([made(1, named('Swiss Stage'), null, 1, 2)], at),
      ...facts([made(2, named('Group Stage'), null, 3, 4)], at),
    ])
    expect(renamed.classification).toMatchObject({
      template: 'list',
      reason:
        "The latest captures disagree on the stage's name " +
        '(Cup Group Stage and Cup Swiss Stage).',
    })
    // Two stage rows that disagree on the format have no capture time at all.
    const stageRow = (format: string): EsportsStageMeta => ({
      game: 'cs',
      stageId: 1,
      tournamentId: 1,
      format,
      sequence: 1,
      promotionCount: null,
    })
    const untyped = facts([
      made(1, cupStage(1, 'Main Stage', null), null, 1, 2),
    ])
    expect(
      only(untyped, [stageRow('round_robin'), stageRow('playoff')])
        .classification
    ).toMatchObject({
      template: 'list',
      reason:
        "The latest captures disagree on the stage's format " +
        '(playoff and round_robin).',
    })
    expect(
      only(untyped, [stageRow('round_robin'), stageRow('round_robin')])
        .classification.template
    ).toBe('group-table')

    // Round labels from two vocabularies are a list in any order, tied or not.
    const mixed = (rows: Row[]) => only(facts(rows, at)).classification.reason
    const quarter = made(1, playoff, 'Quarterfinal', 1, 2)
    const upper = made(2, playoff, 'Upper bracket semifinal', 3, 4)
    expect(mixed([quarter, upper])).toMatch(/mix vocabularies/)
    expect(mixed([upper, quarter])).toMatch(/mix vocabularies/)
  })

  test('pools that never meet are a list: neither one table nor Swiss (made-up rows)', () => {
    // The review's case: eight teams in two complete round robins of four,
    // in one "group" stage. One table would rank the two pool winners, both
    // 3-0, first and second of eight.
    const pool = (stage: Row, first: number, id: number) => {
      const [a, b, c, d] = [first, first + 1, first + 2, first + 3]
      return [
        made(id, stage, 'Round 1', a, b),
        made(id + 1, stage, 'Round 1', c, d),
        made(id + 2, stage, 'Round 2', a, c),
        made(id + 3, stage, 'Round 2', b, d),
        made(id + 4, stage, 'Round 3', a, d),
        made(id + 5, stage, 'Round 3', b, c),
      ]
    }
    const pools = (rounds: number | null) => {
      const group = cupStage(1, 'Group Stage', 'group', 1, rounds)
      return { group, rows: [...pool(group, 1, 1), ...pool(group, 5, 7)] }
    }
    // Three rounds are too few for one round robin of eight, seven are
    // enough, and no count says nothing. Two pools are a list all the same.
    for (const rounds of [3, 7, null]) {
      const { classification, signal, view } = only(facts(pools(rounds).rows))
      expect(signal).toMatchObject({
        teamCount: 8,
        roundsCount: rounds,
        pools: 2,
      })
      expect(classification).toEqual({
        template: 'list',
        reason:
          'The stage is sent as "group", but its pairings form separate ' +
          "pools; the format isn't clear yet.",
        unknownLabels: [],
      })
      expect(as(view, 'list').days.flatMap((d) => d.series)).toHaveLength(12)
    }
    // One series across the two pools joins them. Now three rounds for
    // eight teams is Swiss pairing, and seven rounds is one table.
    const joined = (rounds: number | null) => {
      const { group, rows } = pools(rounds)
      return only(facts([...rows, made(13, group, 'Round 3', 4, 5)]))
    }
    expect(joined(3).signal).toMatchObject({ pools: 1 })
    expect(joined(3).classification.template).toBe('swiss')
    expect(joined(7).classification).toEqual({
      template: 'group-table',
      reason: 'The stage is sent as "group".',
      unknownLabels: [],
    })
    expect(as(joined(7).view, 'group-table').rows).toHaveLength(8)
  })

  test('a Swiss stage sent as "group" is a list until its pairings join up', () => {
    // The review's case, from the recorded PGL Masters Bucharest stage: after
    // round one its sixteen teams are eight separate pairs. A table would
    // rank them as one group of sixteen.
    const rounds = (last: number) =>
      read(R.bucharestGroup, (row) =>
        Number(String(row.round).replace('Round ', '')) <= last ? row : null
      )
    const upTo = (last: number) => only(rounds(last))
    const roundOne = upTo(1)
    expect(roundOne.signal).toMatchObject({
      stageType: 'group',
      teamCount: 16,
      roundsCount: 5,
      pools: 8,
    })
    expect(roundOne.classification).toEqual({
      template: 'list',
      reason:
        'The stage is sent as "group", but its pairings form separate ' +
        "pools; the format isn't clear yet.",
      unknownLabels: [],
    })
    expect(
      as(roundOne.view, 'list').days.flatMap((d) => d.series)
    ).toHaveLength(8)
    expect(roundOne.event.champion).toBeNull()
    // Round two's pairings join all sixteen, and the stage is Swiss from
    // then on, as the whole stage was before.
    expect(
      [1, 2, 3, 4, 5].map((last) => [
        stageSignals(rounds(last))[0].pools,
        upTo(last).classification.template,
      ])
    ).toEqual([
      [8, 'list'],
      [1, 'swiss'],
      [1, 'swiss'],
      [1, 'swiss'],
      [1, 'swiss'],
    ])
    expect(upTo(5)).toEqual(only(read(R.bucharestGroup)))
    expect(upTo(5).classification.reason).toBe(
      'The stage is sent as "group" with 5 numbered rounds for 16 teams, ' +
        'too few for a round robin.'
    )
  })

  test('the latest captures disagree on the rounds count: a list (made-up rows)', () => {
    // The review's case: eight teams, all joined by their pairings, in three
    // numbered rounds. A rounds count of three makes the stage Swiss and a
    // count of seven makes it one round robin.
    const group = (rounds: number) =>
      cupStage(1, 'Group Stage', 'group', 1, rounds)
    const pairs = [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [1, 3],
      [5, 7],
      [2, 4],
      [6, 8],
      [1, 5],
      [3, 7],
      [2, 6],
      [4, 8],
    ]
    const rows = (rounds: number, from: number, to: number) =>
      pairs
        .slice(from, to)
        .map(([a, b], i) =>
          made(
            from + i + 1,
            group(rounds),
            `Round ${Math.floor((from + i) / 4) + 1}`,
            a,
            b
          )
        )
    const at = 5000
    const reason =
      "The latest captures disagree on the stage's rounds count (3 and 7)."
    // Whichever of the two has the higher series IDs.
    for (const [low, high] of [
      [3, 7],
      [7, 3],
    ]) {
      const tied = only([
        ...facts(rows(low, 0, 6), at),
        ...facts(rows(high, 6, 12), at),
      ])
      expect(tied.signal).toMatchObject({
        stageType: 'group',
        teamCount: 8,
        pools: 1,
        roundsCount: null,
        problems: [
          "The stage's roundsCount was sent as 3 and 7 in its latest " +
            'captures; none is used.',
        ],
      })
      expect(tied.classification).toEqual({
        template: 'list',
        reason,
        unknownLabels: [],
      })
      expect(tied.view.kind).toBe('list')
    }
    // Rows with no capture time are tied as well.
    expect(
      only([...facts(rows(3, 0, 6)), ...facts(rows(7, 6, 12))]).classification
        .reason
    ).toBe(reason)
    // One later capture settles it, either way.
    const settled = (latest: number) =>
      only([
        ...facts(rows(3, 0, 6), at),
        ...facts(rows(7, 6, 11), at),
        ...facts(rows(latest, 11, 12), at + 1),
      ])
    expect(settled(3).classification.template).toBe('swiss')
    expect(settled(7).classification.template).toBe('group-table')
    expect(settled(7).signal.problems).toEqual([
      "The stage's roundsCount was sent as 7 and 3; using 7, the latest.",
    ])
    // The tie is a list whatever else the stage sends: nothing is laid out
    // from a stage the provider describes two ways at once.
    const swiss = (rounds: number, id: number) =>
      made(id, cupStage(1, 'Swiss Stage', 'swiss', 1, rounds), 'Round 1', id, 9)
    expect(
      only([...facts([swiss(5, 1)], at), ...facts([swiss(7, 2)], at)])
        .classification
    ).toEqual({
      template: 'list',
      reason:
        "The latest captures disagree on the stage's rounds count (5 and 7).",
      unknownLabels: [],
    })
  })

  test('a stage sent as "swiss" is Swiss from round one', () => {
    // The same eight separate pairs, in a stage the provider calls Swiss.
    const roundOne = only(
      read(R.pglStage1, (row) => (row.round === 'Round 1' ? row : null))
    )
    expect(roundOne.signal).toMatchObject({
      stageType: 'swiss',
      teamCount: 16,
      pools: 8,
    })
    expect(roundOne.classification).toEqual({
      template: 'swiss',
      reason: 'The stage is sent as "swiss".',
      unknownLabels: [],
    })
    expect(
      as(roundOne.view, 'swiss').buckets.map((b) => [
        `${b.wins}-${b.losses}`,
        b.teams.length,
      ])
    ).toEqual([
      ['1-0', 8],
      ['0-1', 8],
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
    // With only the opening matches reported, nothing says GSL yet, and two
    // pairs that haven't met aren't one table either.
    const opening = read(R.thunderpickGroupA).filter(
      (s) => s.round === 'Opening matches'
    )
    expect(only(opening).classification).toMatchObject({
      template: 'list',
      reason:
        'The stage is sent as "group", but its pairings form separate ' +
        "pools; the format isn't clear yet.",
    })
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
    // The third-place series is a stage of its own. Alone it doesn't say
    // which kind of bracket it ends, so it is a list.
    expect(decider.classification).toEqual({
      template: 'list',
      reason:
        'Round labels name only a final or third-place series, not the ' +
        'bracket it ends.',
      unknownLabels: [],
    })
    expect(ids(as(decider.view, 'list').days.flatMap((d) => d.series))).toEqual(
      [18041399]
    )
    expect(event.champion).toEqual({ id: 631, name: 'FURIA', code: 'FURIA' })
    expect(event.status).toBe('finished')
  })

  test('a final alone is a list with no champion (made-up rows)', () => {
    // A double elimination event can send exactly this row too.
    const playoffs = cupStage(1, 'Playoffs', 'playoff', 1)
    const final = only(facts([made(1, playoffs, 'Grand Final', 1, 2)]))
    expect(final.classification).toMatchObject({
      template: 'list',
      reason:
        'Round labels name only a final or third-place series, not the ' +
        'bracket it ends.',
    })
    expect(final.view.kind).toBe('list')
    expect(final.event).toMatchObject({ status: 'finished', champion: null })
    // With a semifinal reported as well, the labels name a knockout.
    const knockout = only(
      facts([
        made(1, playoffs, 'Semifinal', 1, 3),
        made(2, playoffs, 'Semifinal', 2, 4),
        made(3, playoffs, 'Grand Final', 1, 2),
      ])
    )
    expect(knockout.classification.template).toBe('single-elim')
    expect(knockout.event.champion?.name).toBe('Team 1')
  })

  test('two finals that disagree: no champion, whichever ID is higher (made-up rows)', () => {
    const playoffs = cupStage(1, 'Playoffs', 'playoff', 1)
    const semifinals = [
      made(1, playoffs, 'Semifinal', 1, 3),
      made(2, playoffs, 'Semifinal', 2, 4),
    ]
    // The same two teams at the same time, each row with its own winner.
    const champion = (finals: Row[]) => {
      const { view, event } = only(facts([...semifinals, ...finals]))
      const bracket = as(view, 'single-elim')
      expect(event.champion).toEqual(bracket.champion)
      return bracket.champion?.name ?? null
    }
    const final = (id: number, winner: number, loser: number, day = 5) =>
      made(id, playoffs, 'Grand Final', winner, loser, day)
    expect(champion([final(5, 1, 2), final(6, 2, 1)])).toBeNull()
    expect(champion([final(5, 2, 1), final(6, 1, 2)])).toBeNull()
    // Nor when one is played later: nothing says the later one decides.
    expect(champion([final(5, 1, 2), final(6, 2, 1, 6)])).toBeNull()
    // Nor when one of them has no trusted result.
    const forfeit = { ...final(6, 1, 2), status: 'defwin' }
    expect(champion([final(5, 1, 2), forfeit])).toBeNull()
    // Two that agree are one result, and one final is itself.
    expect(champion([final(5, 1, 2), final(6, 1, 2)])).toBe('Team 1')
    expect(champion([final(5, 2, 1), final(6, 2, 1, 6)])).toBe('Team 2')
    expect(champion([final(5, 2, 1)])).toBe('Team 2')
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

  test('a series with no start time cannot be ordered, so its teams get no links', () => {
    const undated = (row: Row) =>
      row.id === 18041397 ? { ...row, start_time: null } : row
    const { view, event } = only(read(R.bucharestPlayoffs, undated))
    const bracket = as(view, 'single-elim')
    expect(link(bracket, 18041397)).toEqual([])
    // Nor do the finalists' other series: the final could sit anywhere among
    // them. Both semifinals are theirs, so no line is left on this bracket.
    expect(bracket.links).toEqual([])
    expect(bracket.problems).toEqual([
      "FURIA has series that can't be put in order by start time, so they " +
        'get no lines.',
      "Nemiga has series that can't be put in order by start time, so they " +
        'get no lines.',
    ])
    expect(event.champion).toBeNull()
  })

  test('no line skips a series with no start time (made-up rows)', () => {
    // Team 1 wins its quarterfinal, loses a semifinal that has no start time,
    // then plays for third place. Its quarterfinal win doesn't lead there.
    const playoffs = cupStage(1, 'Playoffs', 'playoff', 1)
    const rows = (semifinalDay: number | null) => [
      made(1, playoffs, 'Quarterfinal', 1, 2),
      made(2, playoffs, 'Quarterfinal', 3, 4),
      made(3, playoffs, 'Quarterfinal', 5, 6),
      made(4, playoffs, 'Quarterfinal', 7, 8),
      made(5, playoffs, 'Semifinal', 3, 1, semifinalDay),
      made(6, playoffs, 'Semifinal', 5, 7),
      made(7, playoffs, '3rd place', 7, 1),
      made(8, playoffs, 'Grand final', 3, 5),
    ]
    const dated = as(only(facts(rows(5))).view, 'single-elim')
    expect(dated.links).toHaveLength(6)
    expect(link(dated, 7)).toEqual([])
    expect(dated.problems).toEqual([])

    const bracket = as(only(facts(rows(null))).view, 'single-elim')
    expect(link(bracket, 7)).toEqual([])
    // Teams 1 and 3 played the undated semifinal, so none of their series
    // has a line. The other semifinal keeps its two.
    expect(bracket.links).toEqual([
      { from: 3, to: 6, carries: 'winner' },
      { from: 4, to: 6, carries: 'winner' },
    ])
    expect(bracket.problems).toEqual([
      "Team 1 has series that can't be put in order by start time, so they " +
        'get no lines.',
      "Team 3 has series that can't be put in order by start time, so they " +
        'get no lines.',
    ])
    // Two of a team's series at the same time can't be ordered either.
    const sameTime = as(only(facts(rows(1))).view, 'single-elim')
    expect(sameTime.links.some((l) => [1, 5].includes(l.from))).toBe(false)
    expect(sameTime.problems).toEqual([
      "Team 1 has series that can't be put in order by start time, so they " +
        'get no lines.',
    ])
  })

  test('no line skips a series that is not on the board yet (made-up rows)', () => {
    // Team 1's semifinal has no round label yet, so it has no place on the
    // board. The line from its quarterfinal doesn't jump to the final.
    const playoffs = cupStage(1, 'Playoffs', 'playoff', 1)
    const bracket = as(
      only(
        facts([
          made(1, playoffs, 'Quarterfinal', 1, 2),
          made(2, playoffs, 'Quarterfinal', 3, 4),
          made(3, playoffs, null, 1, 3),
          made(4, playoffs, 'Grand final', 1, 5),
        ])
      ).view,
      'single-elim'
    )
    expect(ids(bracket.unplaced ?? [])).toEqual([3])
    expect(bracket.links).toEqual([])
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

describe('odd input', () => {
  const all = () => Object.values(R).flatMap((stage) => read(stage))

  test.each([Number.NaN, Infinity, -Infinity, 1e300, -1e300])(
    'a start time of %s is no start time',
    (startTimeMs) => {
      const odd = read(R.bucharestPlayoffs).map((s) =>
        s.id === 18041397 ? { ...s, startTimeMs } : s
      )
      const sent = only(
        read(R.bucharestPlayoffs, (row) =>
          row.id === 18041397 ? { ...row, start_time: null } : row
        )
      )
      expect(only(odd)).toEqual(sent)
      // In a list it goes under "tbd", where a date would have thrown.
      const list = as(
        only(
          read(R.gamersClubPlayoffs).map((s) =>
            s.id === 60668 ? { ...s, startTimeMs } : s
          )
        ).view,
        'list'
      )
      const last = list.days[list.days.length - 1]
      expect(last.date).toBe('tbd')
      expect(last.series.map((s) => [s.id, s.startTimeMs])).toEqual([
        [60668, null],
      ])
      // Every recorded stage, every start time odd: nothing throws.
      const views = build(all().map((s) => ({ ...s, startTimeMs })))
      expect(views.length).toBeGreaterThan(0)
      expect(esportsEvents(all().map((s) => ({ ...s, startTimeMs })))).toEqual(
        expect.any(Array)
      )
    }
  )

  // Values the types allow and the reader would never send.
  test.each<[string, (s: EsportsSeriesFacts, i: number) => EsportsSeriesFacts]>(
    [
      ['a capture time of NaN', (s) => ({ ...s, observedAtMs: Number.NaN })],
      [
        'capture times of plus and minus infinity',
        (s, i) => ({ ...s, observedAtMs: i % 2 ? Infinity : -Infinity }),
      ],
      ['a winner who is neither team', (s) => ({ ...s, winnerId: -1 })],
      ['a team against itself', (s) => ({ ...s, team2: s.team1 })],
      ['no teams', (s) => ({ ...s, team1: null, team2: null })],
      ['every series the same ID', (s) => ({ ...s, id: 1 })],
      [
        'every team the same ID',
        (s) => ({
          ...s,
          team1: s.team1 && { ...s.team1, id: 1 },
          team2: s.team2 && { ...s.team2, id: 1 },
        }),
      ],
      [
        'empty names',
        (s) => ({
          ...s,
          tournament: { ...s.tournament, name: '' },
          stage: s.stage && { ...s.stage, name: '' },
          round: '',
        }),
      ],
      [
        'odd stage numbers',
        (s) => ({
          ...s,
          stage: s.stage && {
            ...s.stage,
            order: Number.NaN,
            roundsCount: Infinity,
          },
          position: Number.NaN,
          bestOf: -1,
        }),
      ],
      [
        'odd scores',
        (s) => ({
          ...s,
          score: { team1: Number.NaN, team2: Infinity },
        }),
      ],
      [
        'one stage ID for every stage',
        (s) => ({
          ...s,
          stage: s.stage && { ...s.stage, id: 1 },
        }),
      ],
      [
        'one tournament for everything',
        (s) => ({
          ...s,
          tournament: { id: 1, name: 'Cup', tier: null },
        }),
      ],
      ['every label a final', (s) => ({ ...s, round: 'Grand final' })],
      ['every status in progress', (s) => ({ ...s, status: 'in_progress' })],
    ]
  )('%s does not throw', (_, change) => {
    const odd = all().map(change)
    expect(build(odd)).toEqual(expect.any(Array))
    expect(build(odd, [], { derive: false })).toEqual(expect.any(Array))
    expect(stageSignals(odd)).toEqual(expect.any(Array))
  })
})

describe('derive: false', () => {
  test('every stage is a list, and nothing is worked out from the series', () => {
    const series = [
      ...read(R.bucharestGroup),
      ...read(R.bucharestPlayoffs),
      ...read(R.bucharestDecider),
      ...read(R.starladderPlayoffs),
      ...read(R.thunderpickGroupA),
    ]
    // Worked out by default: layouts, teams through and two champions.
    const derived = build(series)
    expect(
      derived.flatMap((v) => v.stages.map((s) => s.classification.template))
    ).toEqual(
      expect.arrayContaining([
        'swiss',
        'single-elim',
        'double-elim',
        'group-gsl',
      ])
    )
    expect(derived.filter((v) => v.champion)).toHaveLength(2)
    expect(build(series, [], { derive: true })).toEqual(derived)

    const plain = build(series, [], { derive: false })
    expect(plain.map((v) => v.tournament.id)).toEqual(
      derived.map((v) => v.tournament.id)
    )
    const stages = plain.flatMap((v) => v.stages)
    expect(stages).toHaveLength(5)
    for (const stage of stages) {
      expect(stage.classification).toEqual({
        template: 'list',
        reason: 'Standings not derived: incomplete data',
        unknownLabels: [],
      })
      expect(stage.view.kind).toBe('list')
    }
    expect(plain.every((v) => v.champion === null)).toBe(true)
    // The series themselves, their labels and their states are all still there.
    expect(
      stages.flatMap((s) => as(s.view, 'list').days.flatMap((d) => d.series))
    ).toHaveLength(series.length)
    expect(stages.map((s) => [s.label, s.state])).toEqual(
      derived.flatMap((v) => v.stages.map((s) => [s.label, s.state]))
    )
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

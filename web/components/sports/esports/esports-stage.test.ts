import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EsportsSeriesFacts,
  EsportsStageResult,
  EsportsTeamRef,
  StageView,
} from 'common/esports/types'
import {
  allStageSeries,
  hasBoard,
  isEmptyStage,
  stageLabel,
  stageSeries,
  stageStartMs,
  tournamentTeams,
} from './esports-stage'

const team = (id: number, name = `Team ${id}`): EsportsTeamRef => ({
  id,
  name,
  code: null,
})
let nextId = 1
const series = (
  over: Partial<EsportsSeriesFacts> = {}
): EsportsSeriesFacts => ({
  game: 'cs',
  id: nextId++,
  tournament: { id: 1, name: 'Event', tier: null },
  stage: null,
  round: null,
  position: null,
  bestOf: 3,
  startTimeMs: null,
  status: 'scheduled',
  team1: null,
  team2: null,
  score: null,
  winnerId: null,
  review: null,
  ...over,
})
const stage = (
  view: StageView,
  label?: string,
  stageName: string | null = null
): EsportsStageResult => ({
  label,
  signal: {
    game: 'cs',
    tournamentId: 1,
    stageId: 1,
    stageName,
    stageType: null,
    stageOrder: null,
    format: null,
    promotionCount: null,
    roundLabels: [],
  },
  classification: {
    template: view.kind,
    reason: '',
    unknownLabels: [],
  },
  state: 'next',
  view,
})
const list = (items: EsportsSeriesFacts[]): StageView => ({
  kind: 'list',
  days: items.length ? [{ date: 'tbd', series: items }] : [],
})
/** A Swiss stage as the engine sends one before any team is known. */
const blankSwiss = (items: EsportsSeriesFacts[]): StageView => ({
  kind: 'swiss',
  buckets: [],
  pending: [],
  round: null,
  series: items,
  problems: [],
})

test('stageLabel: the reviewed card drops the words it shares with its tournament', () => {
  const group = stage(
    list([]),
    'CCT Europe 2026 Series 16 Closed Qualifier Group A'
  )
  assert.equal(
    stageLabel(group, 'CCT Europe 2026 Series 16 Play-In'),
    'Closed Qualifier Group A'
  )
})

test('stageLabel: a label the engine already shortened is left alone', () => {
  assert.equal(
    stageLabel(stage(list([]), 'Stage 1'), 'PGL Major Singapore 2026'),
    'Stage 1'
  )
  assert.equal(
    stageLabel(stage(list([]), 'Play-In'), 'European Pro League Play-In'),
    'Play-In'
  )
})

test('stageLabel: one shared word is not the same name', () => {
  assert.equal(
    stageLabel(stage(list([]), 'Winter Split Playoffs'), 'Winter Cup 2026'),
    'Winter Split Playoffs'
  )
})

test('stageLabel: never shortened to nothing, and a separator left in front goes', () => {
  assert.equal(
    stageLabel(stage(list([]), 'Winter Cup'), 'Winter Cup Finals'),
    'Winter Cup'
  )
  assert.equal(
    stageLabel(stage(list([]), 'Winter Cup - Group A'), 'winter cup 2026'),
    'Group A'
  )
})

test('stageLabel: falls back to the provider name, then to the layout', () => {
  assert.equal(
    stageLabel(stage(list([]), undefined, 'Open Qualifier'), 'Event'),
    'Open Qualifier'
  )
  assert.equal(stageLabel(stage(list([])), 'Event'), 'Matches')
  assert.equal(stageLabel(stage(blankSwiss([])), 'Event'), 'Swiss')
})

test('a Swiss stage with no teams yet is empty, and its start comes from its unpaired series', () => {
  const view = blankSwiss([
    series({ startTimeMs: 3000 }),
    series({ startTimeMs: 1000 }),
    series(),
  ])
  assert.equal(hasBoard(view), false)
  assert.deepEqual(stageSeries(view), [])
  assert.equal(allStageSeries(view).length, 3)
  assert.equal(isEmptyStage(view), true)
  assert.equal(stageStartMs(view), 1000)
})

test('a stage with no series at all is empty and has no start', () => {
  assert.equal(isEmptyStage(blankSwiss([])), true)
  assert.equal(stageStartMs(blankSwiss([])), undefined)
  assert.equal(isEmptyStage(list([])), true)
  assert.equal(
    isEmptyStage({ kind: 'group-table', rows: [], series: [], problems: [] }),
    true
  )
})

test('a Swiss stage with teams has a board', () => {
  const pairing = series({ team1: team(1), team2: team(2), startTimeMs: 5 })
  const view: StageView = {
    kind: 'swiss',
    buckets: [
      {
        wins: 0,
        losses: 0,
        teams: [1, 2].map((id) => ({
          team: team(id),
          wins: 0,
          losses: 0,
          results: [],
          status: null,
        })),
      },
    ],
    pending: [
      {
        series: pairing,
        record1: { wins: 0, losses: 0 },
        record2: { wins: 0, losses: 0 },
      },
    ],
    round: 1,
    series: [pairing],
    problems: [],
  }
  assert.equal(hasBoard(view), true)
  assert.equal(isEmptyStage(view), false)
})

test('series with no teams yet are still series: listed, but on no board', () => {
  const playoffs = list([series({ startTimeMs: 9 }), series()])
  assert.equal(hasBoard(playoffs), false)
  assert.equal(isEmptyStage(playoffs), false)
  assert.equal(stageStartMs(playoffs), 9)
  // A group table nobody is in yet: its series show, its table doesn't.
  const group: StageView = {
    kind: 'group-table',
    rows: [],
    series: [series()],
    problems: [],
  }
  assert.equal(hasBoard(group), false)
  assert.equal(isEmptyStage(group), false)
})

test('a bracket or a GSL group has a board once it holds a series, placed or not', () => {
  const s = series({ team1: team(1), team2: team(2) })
  const gsl = (placed: boolean, unplaced: EsportsSeriesFacts[]): StageView => ({
    kind: 'group-gsl',
    slots: [
      { slot: 'opening-1', label: 'Opening', series: placed ? s : null },
      { slot: 'decider', label: 'Decider', series: null },
    ],
    unplaced,
    problems: [],
  })
  assert.equal(hasBoard(gsl(true, [])), true)
  assert.equal(hasBoard(gsl(false, [s])), true)
  assert.equal(hasBoard(gsl(false, [])), false)
  const bracket = (
    columns: number,
    unplaced: EsportsSeriesFacts[]
  ): StageView => ({
    kind: 'single-elim',
    columns: Array.from({ length: columns }, (_, order) => ({
      lane: 'upper' as const,
      label: 'Quarterfinal',
      order,
      series: [s],
      placeholders: 0,
    })),
    links: [],
    champion: null,
    unplaced,
    problems: [],
  })
  assert.equal(hasBoard(bracket(1, [])), true)
  assert.equal(hasBoard(bracket(0, [s])), true)
  assert.equal(hasBoard(bracket(0, [])), false)
})

test('tournamentTeams: every team once, from series, boards and the champion', () => {
  const champion = team(9, 'Champions')
  const teams = tournamentTeams({
    game: 'cs',
    tournament: { id: 1, name: 'Event', tier: null },
    stages: [
      stage({
        kind: 'group-table',
        rows: [3, 1].map((id) => ({
          team: team(id),
          played: 0,
          wins: 0,
          losses: 0,
          diff: 0,
        })),
        series: [series({ team1: team(1), team2: team(2) })],
        problems: [],
      }),
      stage(list([series({ team1: team(2), team2: null })])),
    ],
    champion,
    status: 'in-progress',
  })
  assert.deepEqual(teams.map((t) => t.id).sort(), [1, 2, 3, 9])
})

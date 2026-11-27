import {
  compact,
  findLastIndex,
  keyBy,
  mapValues,
  min,
  sortBy,
  takeWhile,
  uniqBy,
} from 'lodash'

import {
  EsportsSeriesFacts,
  EsportsStageResult,
  EsportsTeamRef,
  EsportsTournamentView,
  StageTemplate,
  StageView,
} from 'common/esports/types'

type SeriesRecord = { wins: number; losses: number }

const TEMPLATE_LABEL: Record<StageTemplate, string> = {
  swiss: 'Swiss',
  'group-table': 'Groups',
  'group-gsl': 'Group',
  'single-elim': 'Playoffs',
  'double-elim': 'Playoffs',
  list: 'Matches',
}

/**
 * The provider's name for a stage, or else what its layout is called, without
 * the words it starts with in common with its tournament's name. The engine
 * drops the whole name where the stage's starts with it. This also covers a
 * name that only starts the same way: under "CCT Europe 2026 Series 16
 * Play-In", "CCT Europe 2026 Series 16 Closed Qualifier Group A" reads
 * "Closed Qualifier Group A".
 */
export function stageLabel(stage: EsportsStageResult, eventName: string) {
  const label =
    stage.label ??
    stage.signal.stageName ??
    TEMPLATE_LABEL[stage.classification.template]
  const words = label.split(/\s+/)
  const eventWords = eventName.toLowerCase().split(/\s+/)
  const shared = takeWhile(
    words,
    (word, i) => word.toLowerCase() === eventWords[i]
  ).length
  // One word in common ("CCT") is too little to call the same name.
  if (shared < 2) return label
  const rest = words
    .slice(shared)
    .join(' ')
    .replace(/^[-–—:·|]\s*/, '')
  return rest || label
}

/**
 * Every series a stage's view holds, placed on its board or not yet. A Swiss
 * view holds only the series still to finish.
 */
export function stageSeries(view: StageView): EsportsSeriesFacts[] {
  switch (view.kind) {
    case 'swiss':
      return view.pending.map((p) => p.series)
    case 'group-table':
      return view.series
    case 'group-gsl':
      return [
        ...view.slots.flatMap((s) => s.series ?? []),
        ...(view.unplaced ?? []),
      ]
    case 'list':
      return view.days.flatMap((d) => d.series)
    default:
      return [
        ...view.columns.flatMap((c) => c.series),
        ...(view.unplaced ?? []),
      ]
  }
}

/**
 * Every series in a stage. A Swiss view lists only the pairings still to
 * finish, so this adds its finished series and the ones with no teams yet.
 */
export const allStageSeries = (view: StageView) =>
  view.kind === 'swiss' ? view.series ?? stageSeries(view) : stageSeries(view)

/** Whether a stage's board has anything to draw. A plain list has no board. */
export function hasBoard(view: StageView) {
  const unplaced = 'unplaced' in view ? view.unplaced?.length ?? 0 : 0
  switch (view.kind) {
    case 'list':
      return false
    case 'swiss':
      return view.buckets.length > 0
    case 'group-table':
      return view.rows.length > 0
    case 'group-gsl':
      return unplaced > 0 || view.slots.some((s) => s.series)
    default:
      return unplaced > 0 || view.columns.length > 0
  }
}

/** A stage with neither a board nor a series to list: nobody is in it yet. */
export const isEmptyStage = (view: StageView) =>
  !hasBoard(view) && stageSeries(view).length === 0

/** The earliest start among a stage's series, with or without teams. */
export const stageStartMs = (view: StageView) =>
  min(allStageSeries(view).flatMap((s) => s.startTimeMs ?? []))

/** Every team a tournament names: in a series, on a board, or as champion. */
export function tournamentTeams(
  tournament: EsportsTournamentView
): EsportsTeamRef[] {
  const teams = tournament.stages.flatMap(({ view }) => [
    ...allStageSeries(view).flatMap((s) => [s.team1, s.team2]),
    ...(view.kind === 'swiss'
      ? view.buckets.flatMap((b) => b.teams.map((t) => t.team))
      : view.kind === 'group-table'
      ? view.rows.map((r) => r.team)
      : []),
  ])
  return uniqBy(compact([...teams, tournament.champion]), 'id')
}

/** Both teams' records going into each pending Swiss series, by series id. */
export const pendingRecords = (view: StageView) =>
  view.kind === 'swiss'
    ? mapValues(
        keyBy(view.pending, (p) => p.series.id),
        (p): [SeriesRecord, SeriesRecord] => [p.record1, p.record2]
      )
    : undefined

/**
 * The stage to show first: the one in play; between stages, the next one once
 * it has series; otherwise the last one played.
 */
export function stageOnNow(stages: EsportsStageResult[]) {
  const current = stages.findIndex((s) => s.state === 'current')
  if (current >= 0) return current
  const next = stages.findIndex(
    (s) => s.state === 'next' && stageSeries(s.view).length > 0
  )
  if (next >= 0) return next
  return Math.max(
    0,
    findLastIndex(stages, (s) => s.state === 'done')
  )
}

/**
 * One line on a stage. It states counts and the provider's own labels only:
 * who advances is mentioned just where the provider sent a promotion count
 * or a team's later series proves it.
 */
export function stageHeadline(stage: EsportsStageResult): string {
  const { view, signal } = stage
  const series = stageSeries(view)
  const open = series.filter((s) => s.status !== 'final')
  const count = (n: number, what: string) => n > 0 && `${n} ${what}`
  const toPlay =
    count(open.length, 'series to play') ||
    count(series.length, 'series played')
  let parts: (string | false | null)[]
  if (view.kind === 'swiss') {
    const teams = view.buckets.flatMap((b) => b.teams)
    const tally = (s: 'through' | 'out') =>
      teams.filter((t) => t.status === s).length
    parts = [
      view.round != null && `Round ${view.round}`,
      toPlay || count(teams.length, 'teams'),
      signal.promotionCount != null && `${signal.promotionCount} advance`,
      count(tally('through'), 'through'),
      count(tally('out'), 'out'),
    ]
  } else if (view.kind === 'single-elim' || view.kind === 'double-elim') {
    // The round of the next series to start, in the provider's words.
    const next = sortBy(open, (s) => s.startTimeMs ?? Infinity)[0]
    const column = view.columns.find((c) => next && c.series.includes(next))
    const left = column?.series.filter((s) => s.status !== 'final').length
    parts = column ? [column.label, count(left ?? 0, 'series')] : [toPlay]
  } else if (view.kind === 'group-table') {
    parts = [count(view.rows.length, 'teams'), toPlay]
  } else {
    parts = [toPlay]
  }
  return parts.filter(Boolean).join(' · ') || 'No series reported yet'
}

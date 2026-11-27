// Chooses a layout for each tournament stage from what the provider sent, and
// fills it only with series the provider reported. See ./types for the rule.
import {
  countBy,
  groupBy,
  keyBy,
  max,
  min,
  sortBy,
  sum,
  sumBy,
  uniq,
  uniqBy,
} from 'lodash'

import type * as T from './types'

type Series = T.EsportsSeriesFacts
/**
 * A stage's signal, with two things only its series can tell: why the layout
 * can't be read when the latest captures disagree, and how many separate
 * pools its pairings form.
 */
export type StageSignal = T.EsportsStageSignal & {
  /** Set when the latest captures disagree on a field that picks the layout. */
  conflict?: string
  /** Sets of teams joined by any series: 1 when every team is linked. */
  pools?: number
}
export type BuildOptions = {
  /**
   * False when the series handed in may be incomplete, as after a capped
   * read: every stage is then a plain list, with no standings, no team
   * through or out and no champion.
   */
  derive?: boolean
}
const NOT_DERIVED = 'Standings not derived: incomplete data'
type GslRound = 'opening' | 'winners' | 'elimination' | 'decider'
type Round = {
  /** The vocabulary a label belongs to. `double` names a bracket lane. */
  family: 'gsl' | 'double' | 'single' | 'final' | 'round' | 'unknown'
  slot?: GslRound
  lane: T.BracketLane
  /** Orders rounds within a lane: numbered rounds, then the named ones. */
  rank: number
  n: number | null
}
const KNOCKOUT: Record<string, number> = {
  quarterfinal: 1,
  semifinal: 2,
  final: 3,
}

/** Reads a round label. Case, plurals and apostrophes don't matter; typos do. */
export function parseRound(label: string): Round {
  const s = label.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim()
  const round = (
    family: Round['family'],
    rest: Partial<Round> = {}
  ): Round => ({
    family,
    lane: 'upper',
    rank: 0,
    n: null,
    ...rest,
  })
  const gsl = /^(opening|winner|elimination|decider)s?( match(es)?)?$/.exec(s)
  if (gsl && (gsl[2] || gsl[1] === 'opening'))
    return round('gsl', {
      slot: gsl[1] === 'winner' ? 'winners' : (gsl[1] as GslRound),
    })
  if (/^grand finals?$/.test(s))
    return round('final', { lane: 'final', rank: 3 })
  if (/^(3rd|third) place( match| decider)?$/.test(s))
    return round('single', { lane: 'final', rank: 2 })
  const [, bracket, rest = s] = /^(upper|lower) bracket (.+)$/.exec(s) ?? []
  const lane = (bracket ?? 'upper') as T.BracketLane
  const family = bracket ? 'double' : 'single'
  const numbered = /^round (of )?(\d+)$/.exec(rest)
  if (numbered)
    return round(bracket || numbered[1] ? family : 'round', {
      lane,
      n: Number(numbered[2]),
    })
  const rank = KNOCKOUT[rest.replace(/s$/, '')]
  if (!rank) return round('unknown')
  return bracket || rank < 3
    ? round(family, { lane, rank })
    : round('final', { lane: 'final', rank })
}
const roundOf = (s: Series) => (s.round ? parseRound(s.round) : null)

const stageKey = (s: Series) =>
  `${s.game}:${s.tournament.id}:${s.stage?.id ?? 'none'}`
const startOf = (list: Series[]) =>
  Math.min(...list.map((s) => s.startTimeMs ?? Infinity))
const byStart = (list: Series[]) =>
  sortBy(list, [(s) => s.startTimeMs ?? Infinity, (s) => s.position, 'id'])
const teamsOf = (list: Series[]) => {
  const teams = list.flatMap((s) => [s.team1, s.team2])
  return uniqBy(
    teams.filter((t): t is T.EsportsTeamRef => !!t),
    'id'
  )
}
const held = (list: Series[]) => {
  const n = list.filter((s) => s.status === 'final' && !s.winnerId).length
  return n ? [`Finished series with no trusted result, not counted: ${n}.`] : []
}
/** A finished series won by one of its two teams. */
const isTrustedResult = (s: Series) =>
  s.status === 'final' &&
  !!s.team1 &&
  !!s.team2 &&
  s.team1.id !== s.team2.id &&
  (s.winnerId === s.team1.id || s.winnerId === s.team2.id)
const after = (name: string, prefix: string) =>
  name.startsWith(prefix + ' ') ? name.slice(prefix.length + 1) : name
/** The widest range a Date holds. A start outside it isn't a time. */
const MAX_TIME_MS = 8.64e15
/** Each series with a start that is a real time, or none: never NaN or ∞. */
const timed = (series: Series[]) =>
  series.map((s) =>
    s.startTimeMs === null || Math.abs(s.startTimeMs) <= MAX_TIME_MS
      ? s
      : { ...s, startTimeMs: null }
  )
const capturedAt = (s: Series) =>
  typeof s.observedAtMs === 'number' && Number.isFinite(s.observedAtMs)
    ? s.observedAtMs
    : 0
/** Each series once, at its latest capture. */
const latestCaptures = (series: Series[]) =>
  uniqBy(
    sortBy(timed(series), (s) => -capturedAt(s)),
    (s) => `${s.game}:${s.id}`
  )
/** How many separate sets of teams the pairings form. One means one pool. */
function poolCount(list: Series[]) {
  const pool = new Map<number, number>()
  for (const { id } of teamsOf(list)) pool.set(id, id)
  for (const { team1, team2 } of list) {
    const a = team1 ? pool.get(team1.id) : undefined
    const b = team2 ? pool.get(team2.id) : undefined
    if (a === undefined || b === undefined || a === b) continue
    for (const [team, joined] of pool) if (joined === b) pool.set(team, a)
  }
  return new Set(pool.values()).size
}

/** The sent values `classifyStage` reads, as a conflict names them. */
const LAYOUT_FIELDS = {
  type: 'type',
  name: 'name',
  format: 'format',
  roundsCount: 'rounds count',
}

/**
 * One signal per stage. When captures disagree on a sent value, the latest
 * capture wins. When the latest captures themselves disagree, nothing settles
 * it: the value is left empty, never taken from whichever series has the
 * higher ID, and a disagreement on a value that picks the layout (the type,
 * name, format or rounds count) is a `conflict`.
 */
export function stageSignals(
  series: Series[],
  meta: T.EsportsStageMeta[] = []
): StageSignal[] {
  const metaByStage = groupBy(meta, (m) => `${m.game}:${m.stageId}`)
  const stages = groupBy(latestCaptures(series), stageKey)
  return Object.values(stages).map((rows) => {
    const latest = sortBy(rows, [(s) => -capturedAt(s), (s) => -s.id])
    const { game, tournament, stage } = latest[0]
    const problems: string[] = []
    const unsettled: Record<string, string> = {}
    const sent = <K extends keyof NonNullable<Series['stage']>>(field: K) => {
      const having = latest.flatMap((s) => {
        const value = s.stage?.[field] ?? null
        return value === null ? [] : [{ value, at: capturedAt(s) }]
      })
      const values = uniq(having.map((h) => h.value))
      const newest = uniq(
        having.filter((h) => h.at === having[0].at).map((h) => h.value)
      )
      if (newest.length > 1) {
        unsettled[field] = sortBy(newest).join(' and ')
        problems.push(
          `The stage's ${field} was sent as ${unsettled[field]} in its ` +
            'latest captures; none is used.'
        )
        return null
      }
      if (values.length > 1)
        problems.push(
          `The stage's ${field} was sent as ${values.join(' and ')}; ` +
            `using ${values[0]}, the latest.`
        )
      return values.length ? values[0] : null
    }
    // A `tournament_stages` row has no capture time, so two rows for one
    // stage that disagree can't be settled either.
    const extra = stage ? metaByStage[`${game}:${stage.id}`] ?? [] : []
    const told = <K extends 'format' | 'sequence' | 'promotionCount'>(
      field: K
    ) => {
      const values = uniq(extra.map((m) => m[field])).filter(
        (v): v is NonNullable<T.EsportsStageMeta[K]> => v !== null
      )
      if (values.length < 2) return values.length ? values[0] : null
      unsettled[field] = sortBy(values).join(' and ')
      problems.push(
        `The stage's ${field} was sent as ${unsettled[field]}; none is used.`
      )
      return null
    }
    const stageName = sent('name')
    const stageType = sent('type')
    const stageOrder = sent('order') ?? told('sequence')
    const roundsCount = sent('roundsCount')
    const format = told('format')
    const promotionCount = told('promotionCount')
    const labels = rows.flatMap((s) => (s.round ? [s.round] : []))
    const conflicts = Object.entries(LAYOUT_FIELDS).flatMap(([field, word]) =>
      field in unsettled ? [`${word} (${unsettled[field]})`] : []
    )
    return {
      game,
      tournamentId: tournament.id,
      stageId: stage?.id ?? null,
      stageName,
      stageLabel: stageName && after(stageName, tournament.name),
      stageType,
      stageOrder,
      format,
      promotionCount,
      roundLabels: uniq(labels),
      roundsCount,
      teamCount: teamsOf(rows).length,
      labelCounts: countBy(labels),
      problems,
      pools: poolCount(rows),
      ...(conflicts.length > 0
        ? {
            conflict:
              "The latest captures disagree on the stage's " +
              `${conflicts.join(' and its ')}.`,
          }
        : {}),
    }
  })
}

/** Picks the layout from the stage's signals. Anything unclear is a list. */
export function classifyStage(sig: StageSignal): T.StageClassification {
  const rounds = sig.roundLabels.map(parseRound)
  const has = (family: Round['family']) =>
    rounds.some((r) => r.family === family)
  const only = (...families: Round['family'][]) =>
    rounds.every((r) => families.includes(r.family))
  const unknownLabels = sig.roundLabels.filter(
    (_, i) => rounds[i].family === 'unknown'
  )
  const out = (template: T.StageTemplate, reason: string) => ({
    template,
    reason,
    unknownLabels,
  })
  if (sig.stageId === null) return out('list', 'No stage was sent.')
  if (sig.conflict) return out('list', sig.conflict)
  if (unknownLabels.length)
    return out('list', `Unknown round labels: ${unknownLabels.join(', ')}.`)

  // The sent type decides. The name only adds "Swiss" (organisers call a
  // Swiss stage a group stage), or stands in when no type is sent (Valorant).
  const name = sig.stageLabel ?? sig.stageName ?? ''
  const raw = (sig.stageType ?? sig.format)?.replace(/[_-]/g, ' ') ?? null
  const sent = raw === 'round robin' ? 'group' : raw
  const named = /\bswiss\b/i.test(name)
    ? 'swiss'
    : /\bgroups?\b|round robin/i.test(name)
    ? 'group'
    : null
  if (sent && !['swiss', 'group', 'playoff'].includes(sent))
    return out('list', `Unknown stage type "${raw}".`)
  if (named === 'swiss' && raw && raw !== 'swiss' && raw !== 'group')
    return out('list', `The stage is named "${name}" but sent as "${raw}".`)
  const type = named === 'swiss' ? named : sent ?? named
  const source = type === sent ? `sent as "${raw}"` : `named "${name}"`
  const clash = (labels: string) =>
    out('list', `The stage is ${source} but has ${labels} round labels.`)
  const mixed = () =>
    out('list', `Round labels mix vocabularies: ${sig.roundLabels.join(', ')}.`)

  // Bracket and GSL labels name their layout. A Swiss stage can't have them.
  if (has('double')) {
    if (type === 'swiss') return clash('bracket')
    return only('double', 'final')
      ? out('double-elim', 'Round labels name upper and lower bracket rounds.')
      : mixed()
  }
  if (rounds.some((r) => r.family === 'gsl' && r.slot !== 'opening')) {
    if (type === 'swiss') return clash('GSL')
    if (!only('gsl')) return mixed()
    const count = (slot: GslRound) =>
      sum(
        rounds.map((r, i) =>
          r.slot === slot ? sig.labelCounts?.[sig.roundLabels[i]] ?? 1 : 0
        )
      )
    const fits =
      count('opening') <= 2 &&
      Math.max(count('winners'), count('elimination'), count('decider')) <= 1
    return fits
      ? out('group-gsl', 'Round labels are the GSL rounds.')
      : out('list', 'GSL round labels, but more series than one group holds.')
  }
  if (has('single') || has('final')) {
    if (type === 'swiss' || type === 'group') return clash('knockout')
    if (!only('single', 'final', 'round')) return mixed()
    // A final or a third-place series alone ends a single or a double
    // elimination bracket alike, so it names neither.
    return rounds.every((r) => r.lane === 'final')
      ? out(
          'list',
          'Round labels name only a final or third-place series, not the ' +
            'bracket it ends.'
        )
      : out('single-elim', 'Round labels name knockout rounds only.')
  }

  // Only "Round N", "Opening matches" or no labels: the stage type decides.
  if (type === 'swiss')
    return only('round') ? out('swiss', `The stage is ${source}.`) : mixed()
  if (type === 'group') {
    const { roundsCount: n, teamCount: teams = 0, pools } = sig
    // A table and a Swiss board both rank the stage's teams as one field, so
    // the pairings must join every team into one pool. Teams in sets that
    // never meet may be separate groups, each with its own table, or the
    // first rounds of a Swiss stage: nothing says which, so neither is drawn.
    if (pools !== 1)
      return out(
        'list',
        pools
          ? `The stage is ${source}, but its pairings form separate pools; ` +
              "the format isn't clear yet."
          : `The stage is ${source}, but none of its pairings is known; ` +
              "the format isn't clear yet."
      )
    // A round robin needs at least teams - 1 rounds. Fewer means Swiss.
    return rounds.length && only('round') && n && n < teams - 1
      ? out(
          'swiss',
          `The stage is ${source} with ${n} numbered rounds for ${teams} ` +
            'teams, too few for a round robin.'
        )
      : out('group-table', `The stage is ${source}.`)
  }
  return out(
    'list',
    type === 'playoff'
      ? `The stage is ${source} with no bracket round labels.`
      : 'No stage type was sent.'
  )
}

function swissView(
  list: Series[],
  sig: T.EsportsStageSignal,
  done: boolean,
  laterTeams: Set<number>
): T.SwissView {
  const number = (s: Series) => roundOf(s)?.n ?? null
  const series = sortBy(byStart(list), (s) => number(s) ?? Infinity)
  const records = new Map<number, T.SwissRecord>()
  for (const team of teamsOf(series))
    records.set(team.id, {
      team,
      wins: 0,
      losses: 0,
      results: [],
      status: null,
    })
  const played = new Map<number, number>()
  for (const s of series.filter((s) => s.status === 'final'))
    for (const { id } of teamsOf([s])) {
      played.set(id, (played.get(id) ?? 0) + 1)
      const record = records.get(id)
      if (!record || s.winnerId === null) continue
      record.results.push(s.winnerId === id ? 'W' : 'L')
      if (s.winnerId === id) record.wins++
      else record.losses++
    }
  const rows = sortBy(
    [...records.values()],
    [(r) => -r.wins, 'losses', 'team.name']
  )
  // "Through" is evidence only. First, the team's own series in a later
  // stage. Only when no team has one, the provider's promotion count: every
  // series here is a trusted result, and the teams with the most wins, as
  // many as the count, all have more wins than every team below them.
  const problems = held(series)
  const sentCut = sig.promotionCount
  const cut =
    sentCut !== null && Number.isSafeInteger(sentCut) && sentCut > 0
      ? sentCut
      : null
  const later = rows.filter((r) => laterTeams.has(r.team.id))
  const top = cut === null ? [] : rows.slice(0, cut)
  const worst = Math.min(...top.map((r) => r.wins))
  const clean =
    series.every(isTrustedResult) &&
    cut !== null &&
    top.length === cut &&
    rows.slice(cut).every((r) => r.wins < worst)
  const through = later.length ? later : clean ? top : []
  through.forEach((r) => (r.status = 'through'))
  // "Out" needs the provider's own count as well: the stage is done and
  // exactly that many teams are through, so every promoted team is named.
  // Without the count, a gap in wins never puts a team out.
  if (done && cut !== null && through.length === cut)
    rows.forEach((r) => (r.status = r.status ?? 'out'))

  const record = (team: T.EsportsTeamRef | null) => {
    const r = records.get(team?.id ?? 0)
    return { wins: r?.wins ?? 0, losses: r?.losses ?? 0 }
  }
  const pending = series.filter(
    (s) => s.status !== 'final' && s.team1 && s.team2
  )
  // A series gets its label once it starts, so an unlabelled pairing's round
  // is one more than the series its teams have finished.
  const inPlay = pending.map(
    (s) =>
      number(s) ??
      1 + Math.max(...teamsOf([s]).map((t) => played.get(t.id) ?? 0))
  )
  const numbers = series.flatMap((s) => number(s) ?? [])
  return {
    kind: 'swiss',
    buckets: Object.values(groupBy(rows, (r) => `${r.wins}-${r.losses}`)).map(
      (teams) => ({ wins: teams[0].wins, losses: teams[0].losses, teams })
    ),
    pending: pending.map((s) => ({
      series: s,
      record1: record(s.team1),
      record2: record(s.team2),
    })),
    round: inPlay.length
      ? Math.min(...inPlay)
      : numbers.length
      ? Math.max(...numbers)
      : null,
    series,
    problems,
  }
}

function groupTableView(list: Series[]): T.GroupTableView {
  const rows = teamsOf(list).map((team) => {
    const mine = list.filter(
      (s) => s.winnerId && (s.team1?.id === team.id || s.team2?.id === team.id)
    )
    const wins = mine.filter((s) => s.winnerId === team.id).length
    const diff = sumBy(mine, (s) => {
      const margin = s.score ? s.score.team1 - s.score.team2 : 0
      return s.team1?.id === team.id ? margin : -margin
    })
    return { team, played: mine.length, wins, losses: mine.length - wins, diff }
  })
  return {
    kind: 'group-table',
    rows: sortBy(rows, [(r) => -r.wins, (r) => -r.diff, 'losses', 'team.name']),
    series: byStart(list),
    problems: held(list),
  }
}

function gslView(list: Series[]): T.GslView {
  const inSlot = (slot: GslRound) =>
    byStart(list).filter((s) => roundOf(s)?.slot === slot)
  const slot = (slot: T.GslSlot, label: string, s?: Series) => ({
    slot,
    label: s?.round ?? label,
    series: s ?? null,
  })
  const [opening1, opening2] = inSlot('opening')
  return {
    kind: 'group-gsl',
    slots: [
      slot('opening-1', 'Opening match', opening1),
      slot('opening-2', 'Opening match', opening2),
      slot('winners', 'Winners match', inSlot('winners')[0]),
      slot('elimination', 'Elimination match', inSlot('elimination')[0]),
      slot('decider', 'Decider match', inSlot('decider')[0]),
    ],
    unplaced: byStart(list.filter((s) => !s.round)),
    problems: held(list),
  }
}

const LANES: T.BracketLane[] = ['upper', 'lower', 'final']
const isFinal = (column: { label: string }) =>
  parseRound(column.label).family === 'final'

function bracketView(
  kind: T.BracketView['kind'],
  list: Series[]
): T.BracketView {
  const rounds = groupBy(
    list.filter((s) => s.round),
    (s) => {
      const r = parseRound(s.round ?? '')
      return [r.lane, r.rank, r.n].join(':')
    }
  )
  const columns = sortBy(
    Object.values(rounds).map((series) => ({
      round: parseRound(series[0].round ?? ''),
      label: series[0].round ?? '',
      series: byStart(series),
      placeholders: 0,
    })),
    [(c) => LANES.indexOf(c.round.lane), 'round.rank', (c) => startOf(c.series)]
  )
  // Single elimination halves each round. Byes are common, so the size comes
  // from the series reported in round one, never from a round's name. The
  // names only check it: a final has one slot, a semifinal two, and so on.
  const main = columns.filter((c) => c.round.lane === 'upper' || isFinal(c))
  const slots = main.map((_, i) => (main[0]?.series.length ?? 0) / 2 ** i)
  const sized =
    Number.isInteger(Math.log2(slots[0])) &&
    main.every(
      ({ round, series }, i) =>
        series.length <= slots[i] &&
        (round.rank === 0 || slots[i] === 2 ** (3 - round.rank))
    )
  if (kind === 'single-elim' && sized)
    main.forEach((c, i) => (c.placeholders = slots[i] - c.series.length))

  // A line needs the team's previous series here to be a trusted result: the
  // winner moving on, or an upper-bracket loser dropping to the lower bracket.
  // Only a third-place series is played by teams that lost and didn't drop.
  const laneOf = new Map<number, T.BracketLane>()
  for (const c of columns)
    c.series.forEach((s) => laneOf.set(s.id, c.round.lane))
  const links: T.BracketView['links'] = []
  const problems = held(list)
  // "Previous" is by start time, over every series the team has in the stage,
  // on the board or not. A team with a series that has no start time, or two
  // at the same time, can't be put in order: that series could sit anywhere
  // among the others, so none of the team's series gets a line, in or out.
  const startsOf = groupBy(
    list.flatMap((s) =>
      teamsOf([s]).map((team) => ({ team, start: s.startTimeMs }))
    ),
    'team.id'
  )
  const unordered = Object.values(startsOf)
    .filter((appearances) => {
      const starts = appearances.map((a) => a.start)
      return starts.includes(null) || uniq(starts).length < starts.length
    })
    .map((appearances) => appearances[0].team)
  for (const team of sortBy(unordered, 'name'))
    problems.push(
      `${team.name} has series that can't be put in order by start time, ` +
        'so they get no lines.'
    )
  const loose = (s: Series) =>
    teamsOf([s]).some((team) => unordered.some((u) => u.id === team.id))
  const last = new Map<number, Series>()
  for (const s of byStart(list.filter((s) => s.startTimeMs !== null)))
    for (const team of teamsOf([s])) {
      const from = last.get(team.id)
      last.set(team.id, s)
      const to = laneOf.get(s.id)
      const fromLane = from && laneOf.get(from.id)
      // Both ends need a place on the board and an order nobody doubts.
      if (!from || !to || !fromLane || loose(from) || loose(s)) continue
      if (from.winnerId === team.id)
        links.push({ from: from.id, to: s.id, carries: 'winner' })
      else if (from.winnerId && fromLane === 'upper' && to === 'lower')
        links.push({ from: from.id, to: s.id, carries: 'loser' })
      else if (
        from.winnerId &&
        from.round !== s.round &&
        !(to === 'final' && roundOf(s)?.rank === 2)
      )
        problems.push(
          `${team.name} plays "${s.round}" after losing "${from.round}".`
        )
    }
  // A champion needs one deciding final. Several series labelled the final
  // count as one only when they are the same two teams and every one of them
  // has the same trusted winner: nothing orders them otherwise.
  const finals = columns.find(isFinal)?.series ?? []
  const winners = uniq(finals.map((s) => s.winnerId))
  const finalists = teamsOf(finals)
  const champion =
    finalists.length === 2 && winners.length === 1
      ? finalists.find((team) => team.id === winners[0]) ?? null
      : null
  return {
    kind,
    columns: columns.map((c) => ({
      lane: c.round.lane,
      label: c.label,
      order: columns.filter((o) => o.round.lane === c.round.lane).indexOf(c),
      series: c.series,
      placeholders: c.placeholders,
    })),
    links,
    champion,
    unplaced: byStart(list.filter((s) => !s.round)),
    problems,
  }
}

function listView(list: Series[]): T.ListView {
  const days = groupBy(byStart(list), (s) =>
    s.startTimeMs === null
      ? 'tbd'
      : new Date(s.startTimeMs).toISOString().slice(0, 10)
  )
  const dates = Object.keys(days).sort()
  return {
    kind: 'list',
    days: dates.map((date) => ({ date, series: days[date] })),
  }
}

function buildStage(
  signal: StageSignal,
  list: Series[],
  eventName: string,
  laterTeams: Set<number>,
  derive: boolean
): T.EsportsStageResult {
  const classification: T.StageClassification = derive
    ? classifyStage(signal)
    : { template: 'list', reason: NOT_DERIVED, unknownLabels: [] }
  const state = list.every((s) => s.status === 'final')
    ? 'done'
    : list.every((s) => s.status === 'scheduled')
    ? 'next'
    : 'current'
  const views: Record<T.StageTemplate, () => T.StageView> = {
    swiss: () => swissView(list, signal, state === 'done', laterTeams),
    'group-table': () => groupTableView(list),
    'group-gsl': () => gslView(list),
    'single-elim': () => bracketView('single-elim', list),
    'double-elim': () => bracketView('double-elim', list),
    list: () => listView(list),
  }
  return {
    label: after(signal.stageLabel ?? 'Matches', eventName),
    signal,
    classification,
    state,
    view: views[classification.template](),
  }
}

type EsportsEvent = Pick<T.EsportsTournamentView, 'game' | 'tournament'> & {
  tournamentIds: number[]
  series: Series[]
}
const MAX_SPLIT_GAP_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Tournaments, with the provider's split events joined: "X Stage N" joins "X"
 * only when exactly one tournament named "X" exists in the same game and the
 * two are played within 30 days of each other.
 */
export function esportsEvents(series: Series[]): EsportsEvent[] {
  const key = (s: Series) => `${s.game}:${s.tournament.id}`
  const tournaments = Object.values(groupBy(timed(series), key))
  const end = (list: Series[]) =>
    Math.max(...list.map((s) => s.startTimeMs ?? -Infinity))
  const baseOf = (rows: Series[]) => {
    const name = /^(.*\S)\s+Stage\s+\d+$/i.exec(rows[0].tournament.name)?.[1]
    const bases = tournaments.filter(
      (t) => t[0].game === rows[0].game && t[0].tournament.name === name
    )
    if (bases.length !== 1) return rows
    const [base] = bases
    const gap = Math.max(startOf(base) - end(rows), startOf(rows) - end(base))
    return gap <= MAX_SPLIT_GAP_MS ? base : rows
  }
  const events = groupBy(tournaments, (rows) => key(baseOf(rows)[0]))
  return Object.values(events).map((parts) => {
    const ordered = sortBy(parts, startOf)
    const base = baseOf(ordered[0])[0]
    return {
      game: base.game,
      tournament: base.tournament,
      tournamentIds: ordered.map((rows) => rows[0].tournament.id),
      series: ordered.flat(),
    }
  })
}

/**
 * Every tournament in `series` as ordered stages, each with its own layout.
 * With `derive: false` each stage is a plain list and nothing is worked out
 * from the series: for a read that may have missed some of them.
 */
export function buildTournamentViews(
  series: Series[],
  meta: T.EsportsStageMeta[] = [],
  options: BuildOptions = {}
): T.EsportsTournamentView[] {
  const derive = options.derive ?? true
  const latest = latestCaptures(series)
  const signals = keyBy(stageSignals(latest, meta), (sig) =>
    [sig.game, sig.tournamentId, sig.stageId ?? 'none'].join(':')
  )
  return esportsEvents(latest).map((event) => {
    const tournamentStart = (s: Series) =>
      startOf(event.series.filter((o) => o.tournament.id === s.tournament.id))
    const stages = sortBy(Object.values(groupBy(event.series, stageKey)), [
      (rows) => tournamentStart(rows[0]),
      (rows) => signals[stageKey(rows[0])].stageOrder ?? Infinity,
      startOf,
      (rows) => rows[0].stage?.id,
    ])
    // A stage comes after another only by the clock: its first known start is
    // later than the other's last known start. The order the stages are
    // shown in, and the provider's stage order, don't prove it.
    const spans = stages.map((rows) => {
      const starts = rows.flatMap((s) => s.startTimeMs ?? [])
      return { first: min(starts), last: max(starts) }
    })
    const results = stages.map((rows, i) => {
      const { last } = spans[i]
      const later = stages.filter((other, j) => {
        const { first } = spans[j]
        return (
          other[0].stage !== null &&
          first !== undefined &&
          last !== undefined &&
          first > last
        )
      })
      // A team is in a later stage only by its own series there with a known
      // start. Its series with no start may have been played before this
      // stage, and the other teams' starts say nothing about it. Series sent
      // with no stage aren't a later stage either.
      const datedLater = later.flat().filter((s) => s.startTimeMs !== null)
      const signal = signals[stageKey(rows[0])]
      return buildStage(
        signal,
        rows,
        event.tournament.name,
        new Set(teamsOf(datedLater).map((t) => t.id)),
        derive
      )
    })
    // The champion is the winner of the last bracket's final, and only once
    // nothing in the event starts after that final.
    const bracket = results
      .flatMap((r) => ('columns' in r.view ? [r.view] : []))
      .filter((v) => v.columns.some(isFinal))
      .pop()
    const finals = bracket?.columns.find(isFinal)?.series ?? []
    const finalStart = Math.max(...finals.map((s) => s.startTimeMs ?? NaN))
    const over = event.series.every(
      (s) => finals.includes(s) || (s.startTimeMs ?? Infinity) < finalStart
    )
    return {
      game: event.game,
      tournament: event.tournament,
      tournamentIds: event.tournamentIds,
      stages: results,
      champion: (over && bracket?.champion) || null,
      status: results.every((r) => r.state === 'done')
        ? 'finished'
        : results.every((r) => r.state === 'next')
        ? 'upcoming'
        : 'in-progress',
    }
  })
}

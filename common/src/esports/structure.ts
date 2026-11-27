// Chooses a layout for each tournament stage from what the provider sent, and
// fills it only with series the provider reported. See ./types for the rule.
import {
  countBy,
  groupBy,
  keyBy,
  sortBy,
  sum,
  sumBy,
  uniq,
  uniqBy,
} from 'lodash'

import type * as T from './types'

type Series = T.EsportsSeriesFacts
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
const after = (name: string, prefix: string) =>
  name.startsWith(prefix + ' ') ? name.slice(prefix.length + 1) : name
/** Each series once, at its latest capture. */
const latestCaptures = (series: Series[]) =>
  uniqBy(
    sortBy(series, (s) => -(s.observedAtMs ?? 0)),
    (s) => `${s.game}:${s.id}`
  )

/** One signal per stage. When captures disagree, the latest one wins. */
export function stageSignals(
  series: Series[],
  meta: T.EsportsStageMeta[] = []
): T.EsportsStageSignal[] {
  const metaByStage = keyBy(meta, (m) => `${m.game}:${m.stageId}`)
  const stages = groupBy(latestCaptures(series), stageKey)
  return Object.values(stages).map((rows) => {
    const latest = sortBy(rows, [(s) => -(s.observedAtMs ?? 0), (s) => -s.id])
    const { game, tournament, stage } = latest[0]
    const problems: string[] = []
    const sent = <K extends keyof NonNullable<Series['stage']>>(field: K) => {
      const seen = uniq(latest.map((s) => s.stage?.[field] ?? null))
      const values = seen.filter((v) => v !== null)
      if (values.length > 1)
        problems.push(
          `The stage's ${field} was sent as ${values.join(' and ')}; ` +
            `using ${values[0]}, the latest.`
        )
      return values.length ? values[0] : null
    }
    const extra = stage ? metaByStage[`${game}:${stage.id}`] : undefined
    const stageName = sent('name')
    const labels = rows.flatMap((s) => (s.round ? [s.round] : []))
    return {
      game,
      tournamentId: tournament.id,
      stageId: stage?.id ?? null,
      stageName,
      stageLabel: stageName && after(stageName, tournament.name),
      stageType: sent('type'),
      stageOrder: sent('order') ?? extra?.sequence ?? null,
      format: extra?.format ?? null,
      promotionCount: extra?.promotionCount ?? null,
      roundLabels: uniq(labels),
      roundsCount: sent('roundsCount'),
      teamCount: teamsOf(rows).length,
      labelCounts: countBy(labels),
      problems,
    }
  })
}

/** Picks the layout from the stage's signals. Anything unclear is a list. */
export function classifyStage(
  sig: T.EsportsStageSignal
): T.StageClassification {
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
    return only('single', 'final', 'round')
      ? out('single-elim', 'Round labels name knockout rounds only.')
      : mixed()
  }

  // Only "Round N", "Opening matches" or no labels: the stage type decides.
  if (type === 'swiss')
    return only('round') ? out('swiss', `The stage is ${source}.`) : mixed()
  if (type === 'group') {
    const { roundsCount: n, teamCount: teams = 0 } = sig
    // A round robin needs at least teams - 1 rounds. Fewer means Swiss pairing.
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
  // Status is evidence only: who plays in a later stage, or failing that the
  // provider's promotion count. Anything read off the records ("out", or the
  // promotion cut) also needs every result counted, every promoted team
  // named and a clean gap in wins below them.
  const problems = held(series)
  const later = rows.filter((r) => laterTeams.has(r.team.id))
  const cut = sig.promotionCount ?? 0
  const top = later.length || !done ? later : rows.slice(0, cut)
  const rest = rows.filter((r) => !top.includes(r))
  const worst = Math.min(...top.map((r) => r.wins))
  const clean =
    done &&
    !problems.length &&
    top.length > 0 &&
    top.length >= cut &&
    rest.every((r) => r.wins < worst)
  if (later.length || clean) top.forEach((r) => (r.status = 'through'))
  if (clean) rest.forEach((r) => (r.status = 'out'))

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
  const last = new Map<number, Series>()
  const dated = columns.flatMap((c) => c.series).filter((s) => s.startTimeMs)
  for (const s of byStart(dated))
    for (const team of teamsOf([s])) {
      const from = last.get(team.id)
      const to = laneOf.get(s.id)
      const drops = laneOf.get(from?.id ?? 0) === 'upper' && to === 'lower'
      if (from?.winnerId === team.id)
        links.push({ from: from.id, to: s.id, carries: 'winner' })
      else if (from?.winnerId && drops)
        links.push({ from: from.id, to: s.id, carries: 'loser' })
      else if (
        from?.winnerId &&
        from.round !== s.round &&
        !(to === 'final' && roundOf(s)?.rank === 2)
      )
        problems.push(
          `${team.name} plays "${s.round}" after losing "${from.round}".`
        )
      last.set(team.id, s)
    }
  const finals = columns.find(isFinal)?.series ?? []
  const decider = finals[finals.length - 1]
  const decided =
    teamsOf(finals).length === 2 && finals.every((s) => s.winnerId !== null)
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
    champion:
      (decided &&
        teamsOf(finals).find((team) => team.id === decider?.winnerId)) ||
      null,
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
  signal: T.EsportsStageSignal,
  list: Series[],
  eventName: string,
  laterTeams: Set<number>
): T.EsportsStageResult {
  const classification = classifyStage(signal)
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
  const tournaments = Object.values(groupBy(series, key))
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

/** Every tournament in `series` as ordered stages, each with its own layout. */
export function buildTournamentViews(
  series: Series[],
  meta: T.EsportsStageMeta[] = []
): T.EsportsTournamentView[] {
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
    const results = stages.map((rows, i) => {
      const later = teamsOf(stages.slice(i + 1).flat()).map((t) => t.id)
      const signal = signals[stageKey(rows[0])]
      return buildStage(signal, rows, event.tournament.name, new Set(later))
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

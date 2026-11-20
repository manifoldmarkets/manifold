import { BDL_LEAGUE_KEYS, isBdlLeagueKey } from 'common/bdl/leagues'

import { addProbes, probeMatchesLeague } from './probes'
import {
  captured,
  dateOffset,
  identifier,
  ids,
  isRow,
  LeaguePlan,
  Params,
  PlanStep,
  rows,
  sample,
  timestamp,
} from './spec'

export type { History, Params, PlanRequest, PlanStep } from './spec'

const esports = ['cs', 'valorant', 'lol', 'dota']
const isUfc = (row: Record<string, unknown>) =>
  isRow(row.league) &&
  [row.league.name, row.league.abbreviation, row.league.short_name].some(
    (v) =>
      typeof v === 'string' &&
      /\b(?:ufc|ultimate fighting championship)\b/i.test(v)
  )

function schedule(plan: LeaguePlan) {
  const { league, previous, season } = plan
  const sport = esports.includes(league)
  const golf = league === 'pga' || league === 'lpga'
  const tournament = sport || golf
  const name = tournament
    ? 'tournaments'
    : plan.has('events')
    ? 'events'
    : plan.has('games')
    ? 'games'
    : 'matches'
  plan.schedule = name
  if (sport) {
    const tournaments = plan.add('tournament directory', name, {}, true)
    const field = plan.has('matches', 'tournament_ids')
      ? 'tournament_ids'
      : 'tournament_id'
    for (const y of [previous, season]) {
      const select = (records: Record<string, unknown>[]) =>
        ids(
          records.filter((r) => {
            const start = timestamp(r)
            const end = Date.parse(String(r.end_at ?? r.end_date ?? ''))
            return (
              start < Date.UTC(y + 1, 0, 1) &&
              (Number.isFinite(end) ? end : start) >= Date.UTC(y, 0, 1)
            )
          })
        )
      plan.scheduleSources.push(
        plan.bound(
          'matches ' + y,
          'matches',
          field,
          [tournaments],
          select,
          {},
          true
        )
      )
    }
    plan.schedule = 'matches'
    return
  }
  for (const y of [previous, season]) {
    const field = ['seasons', 'season', 'year'].find((f) => plan.has(name, f))
    if (!field)
      throw new Error('Missing season filter for ' + league + '/' + name)
    plan.scheduleSources.push(
      plan.add('schedule ' + y, name, { [field]: y }, true)
    )
  }
  const source = [...plan.scheduleSources]
  if (league === 'mma')
    plan.bound(
      'card fights',
      'fights',
      'event_ids',
      source,
      (r) => ids(r.filter(isUfc)),
      {},
      true
    )
  if (league === 'f1') {
    const sessions = plan.bound(
      'sessions',
      'sessions',
      'event_ids',
      source,
      ids,
      {},
      true
    )
    plan.bound(
      'session results',
      'session_results',
      'session_ids',
      [sessions],
      ids,
      {},
      true
    )
  }
  if (golf)
    plan.bound(
      'tournament results',
      league === 'pga' ? 'tournament_results' : 'entries',
      'tournament_id',
      source,
      ids,
      {},
      true
    )
  if (league === 'atp' || league === 'wta') {
    // Draw dates belong to tournaments; match rows can lack a scheduled time.
    for (const y of [previous, season])
      plan.add('tournaments ' + y, 'tournaments', { season: y }, true)
  }
}

function odds(plan: LeaguePlan) {
  const { league, now } = plan
  const names = ['odds', 'odds/opening', 'odds/futures', 'futures'].filter(
    (n) => plan.has(n)
  )
  if (!names.length) return
  const field = ['seasons', 'season', 'year'].find((f) =>
    plan.has(plan.schedule, f)
  )
  const next = plan.season + (league === 'fifa/worldcup' ? 4 : 1)
  const allowedSeasons =
    field &&
    plan.endpoints.get(plan.schedule)?.fields.get(field)?.schema?.items?.enum
  if (field && (!allowedSeasons || allowedSeasons.includes(next))) {
    const lookahead = plan.request(plan.schedule, { [field]: next })
    const sources = [...plan.scheduleSources]
    const hasFuture = (records: Record<string, unknown>[]) => {
      if (league === 'atp' || league === 'wta')
        return records.some((r) => r.status_state === 'scheduled')
      return (
        sample(
          now,
          'upcoming'
        )(league === 'mma' ? records.filter(isUfc) : records).length > 0
      )
    }
    const label = plan.step(
      'next-season lookahead if no upcoming event',
      lookahead,
      plan.has(plan.schedule, 'cursor'),
      (h) => (hasFuture(captured(h, sources)) ? [] : [lookahead]),
      sources
    )
    plan.scheduleSources.push(label)
  }
  const tennis = league === 'atp' || league === 'wta'
  const tennisIds =
    (side: 'past' | 'upcoming') => (records: Record<string, unknown>[]) => {
      const state = side === 'past' ? 'final' : 'scheduled'
      const candidates = records.filter((r) => r.status_state === state)
      // Both tennis specs omit start times from the match schema. Prefer a
      // timestamp if present, then use the tournament dates and explicit state.
      const timed = sample(now, side, 2)(candidates)
      const withTournament = candidates
        .filter((r) => isRow(r.tournament))
        .sort((a, b) => {
          const aTime = timestamp(a.tournament as Record<string, unknown>)
          const bTime = timestamp(b.tournament as Record<string, unknown>)
          return (
            Math.abs(aTime - now.getTime()) - Math.abs(bTime - now.getTime())
          )
        })
      return [...new Set([...timed, ...ids(withTournament)])].slice(0, 2)
    }
  for (const name of names) {
    const field = [
      'event_id',
      'event_ids',
      'match_ids',
      'game_ids',
      'tournament_ids',
    ].find((f) => plan.has(name, f))
    if (!field) {
      if (name !== 'odds/futures')
        throw new Error('Missing odds selector for ' + league + '/' + name)
      for (const y of plan.has(name, 'seasons')
        ? [plan.previous, plan.season]
        : [plan.season])
        plan.add(
          'season futures ' + y,
          name,
          plan.has(name, 'seasons') ? { seasons: [y] } : {}
        )
      continue
    }
    for (const side of ['past', 'upcoming'] as const) {
      plan.bound(side + ' ' + name, name, field, plan.scheduleSources, (r) =>
        tennis
          ? tennisIds(side)(r)
          : sample(now, side, 2)(league === 'mma' ? r.filter(isUfc) : r)
      )
    }
  }
}

function supporting(plan: LeaguePlan) {
  const { season } = plan
  const directories = ['conferences', 'teams', 'players', 'fighters', 'drivers']
  const source = new Map<string, string[]>()
  for (const name of directories.filter((n) => plan.has(n))) {
    const label = plan.add(
      'reference ' + name,
      name,
      plan.has(name, 'season') ? { season } : {}
    )
    source.set(name, [label])
  }
  source.set('matches', plan.scheduleSources)
  source.set(
    'tournaments',
    esports.includes(plan.league)
      ? [plan.league + ' tournament directory']
      : plan.scheduleSources
  )
  const reference = (entity: string) => source.get(entity) ?? []
  const first = (records: Record<string, unknown>[]) => ids(records).slice(0, 1)
  if (plan.has('match_maps')) {
    const field = plan.has('match_maps', 'match_ids') ? 'match_ids' : 'match_id'
    const maps = plan.bound(
      'sample match maps',
      'match_maps',
      field,
      reference('matches'),
      first
    )
    source.set('maps', [maps])
    if (plan.has('rounds', 'match_map_id')) {
      const rounds = plan.bound(
        'sample map rounds',
        'rounds',
        'match_map_id',
        [maps],
        first
      )
      source.set('rounds', [rounds])
    }
  }
  for (const [name, op] of plan.endpoints) {
    if (
      !/stats|standings|rosters?|rankings|box_scores/.test(name) ||
      name.startsWith('fantasy/') ||
      name.endsWith('/{id}')
    )
      continue
    const params: Params = plan.has(name, 'season') ? { season } : {}
    const required = [...op.fields.values()].filter((f) => f.required)
    const idFields: string[] = []
    for (const f of required) {
      if (f.name === 'season') continue
      if (f.schema?.enum?.length) params[f.name] = f.schema.enum[0]
      else if (f.name === 'date') params.date = dateOffset(plan.now, -1)
      else idFields.push(f.name.replace(/\[\]$/, ''))
    }
    if (name.includes('{id}')) idFields.push('{id}')
    if (!idFields.length) {
      plan.add('reference ' + name, name, params)
      continue
    }
    // LoL/Dota require a team that participated in this exact tournament.
    if (idFields.includes('tournament_id') && idFields.includes('team_id')) {
      const tournaments = reference('tournaments')
      const teams = plan.bound(
        'sample tournament teams',
        'tournament_teams',
        'tournament_id',
        tournaments,
        first
      )
      const make = (tid: string | number, team: string | number) =>
        plan.request(name, { tournament_id: tid, team_id: team })
      plan.step(
        'reference ' + name,
        make('<tournament>', '<team>'),
        false,
        (h) => {
          const tid = first(captured(h, tournaments))[0]
          const team = captured(h, [teams])
            .map((r) => (isRow(r.team) ? r.team.id : r.team_id))
            .find(identifier)
          return tid !== undefined && team !== undefined
            ? [make(tid, team)]
            : []
        },
        [...tournaments, teams]
      )
      continue
    }
    const entity: Record<string, string> = {
      '{id}': name.split('/')[0],
      team_id: 'teams',
      team_ids: 'teams',
      player_id: 'players',
      conference_id: 'conferences',
      tournament_id: 'tournaments',
      match_id: 'matches',
      match_map_id: 'maps',
      round_id: 'rounds',
    }
    const field = idFields[0]
    if (idFields.length !== 1 || !entity[field])
      throw new Error('Missing reference source for ' + op.path)
    plan.bound(
      'reference ' + name,
      name,
      field,
      reference(entity[field]),
      first,
      params
    )
  }
}

type Options = {
  specDir: string
  leagues: readonly string[] | 'all'
  now: Date
  freeTier?: boolean
  probe?: string
}
export function buildPlan(options: Options): PlanStep[] {
  const selected =
    options.leagues === 'all' ? BDL_LEAGUE_KEYS : [...new Set(options.leagues)]
  if (!selected.length) throw new Error('Choose at least one league')
  const result: PlanStep[] = []
  for (const key of selected) {
    if (!isBdlLeagueKey(key)) throw new Error('Unknown BDL league ' + key)
    if (options.probe && !probeMatchesLeague(options.probe, key)) continue
    const plan = new LeaguePlan(key, options.specDir, options.now)
    if (options.freeTier) {
      if (options.probe || !['mma', 'nba'].includes(key))
        throw new Error('Free-tier sample supports NBA and MMA only')
      if (key === 'mma') {
        plan.add('free leagues', 'leagues')
        plan.add('free events', 'events', { year: plan.season, per_page: 1 })
      } else {
        plan.add('free teams', 'teams')
        plan.add('free games', 'games', { seasons: [plan.season], per_page: 1 })
      }
    } else if (options.probe) addProbes(plan, options.probe)
    else {
      schedule(plan)
      odds(plan)
      supporting(plan)
    }
    result.push(...plan.steps)
  }
  if (!result.length)
    throw new Error('No matching requests for selected league(s) and probe')
  return result
}

export function buildWatchPlan({
  specDir,
  league,
  id,
  now,
}: {
  specDir: string
  league: string
  id: string
  now: Date
}): PlanStep[] {
  if (!isBdlLeagueKey(league) || !identifier(id))
    throw new Error('Watch expects a known league and a positive event ID')
  const plan = new LeaguePlan(league, specDir, now)
  if (league === 'mma') {
    plan.steps.push(single(plan, 'events/{id}', id))
    plan.add('watch card fights', 'fights', { event_ids: [id] }, true)
  } else if (league === 'f1') {
    plan.add('watch event', 'events', { event_ids: [id] })
    const source = plan.add(
      'watch sessions',
      'sessions',
      { event_ids: [id] },
      true
    )
    plan.bound(
      'watch session results',
      'session_results',
      'session_ids',
      [source],
      ids,
      {},
      true
    )
  } else if (['lpga', 'pga'].includes(league)) {
    plan.add('watch tournament', 'tournaments', { tournament_ids: [id] })
    plan.add(
      'watch results',
      league === 'pga' ? 'tournament_results' : 'entries',
      { tournament_id: id },
      true
    )
  } else if (['wta', 'atp'].includes(league)) {
    plan.add(
      'watch tournament matches',
      'matches',
      { tournament_ids: [id], season: plan.season },
      true
    )
  } else {
    const name = plan.has('games') ? 'games' : 'matches'
    if (plan.has(name + '/{id}'))
      plan.steps.push(single(plan, name + '/{id}', id))
    else if (plan.has(name, 'game_ids') || plan.has(name, 'match_ids'))
      plan.add('watch event', name, {
        [plan.has(name, 'game_ids') ? 'game_ids' : 'match_ids']: [id],
      })
    else if (plan.has(name, 'dates') || ['lol', 'dota'].includes(league)) {
      plan.add(
        'watch event',
        name,
        { 'dates[]': [-1, 0, 1].map((d) => dateOffset(now, d)) },
        true,
        !plan.has(name, 'dates')
      )
      plan.steps[0].select = (body) =>
        rows(body).filter((r) => String(r.id) === id)
    } else if (!esports.includes(league))
      throw new Error('No event selector for ' + league)
    if (plan.has('match_maps'))
      plan.add(
        'watch maps',
        'match_maps',
        plan.has('match_maps', 'match_ids')
          ? { match_ids: [id] }
          : { match_id: id }
      )
    if (plan.has('live_matches'))
      plan.add('watch live match', 'live_matches', { match_ids: [id] })
    if (plan.has('match_events'))
      plan.add('watch incidents', 'match_events', { match_ids: [id] }, true)
  }
  return plan.steps
}
function single(plan: LeaguePlan, name: string, id: string): PlanStep {
  const preview = plan.request(name, {}, id)
  return {
    label: plan.league + ' watch ' + name,
    preview,
    paginate: false,
    resolve: () => [preview],
  }
}

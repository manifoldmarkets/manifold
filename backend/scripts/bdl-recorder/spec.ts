import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'

import { BDL_LEAGUES, BdlLeagueKey } from 'common/bdl/leagues'

type Scalar = string | number
export type Params = Record<string, Scalar | readonly Scalar[]>
export type PlanRequest = { league: string; path: string; params: Params }
export type History = Map<string, unknown[]>
export type PlanStep = {
  label: string
  preview: PlanRequest
  paginate: boolean
  resolve: (history: History) => PlanRequest[]
  dependsOn?: readonly string[]
  rejectedStatuses?: readonly number[]
  select?: (body: unknown) => unknown
}

export type Row = Record<string, unknown>
export const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export function rows(body: unknown): Row[] {
  if (!isRow(body)) return []
  if (Array.isArray(body.data)) return body.data.filter(isRow)
  return isRow(body.data) ? [body.data] : []
}

export const timestamp = (row: Row) => {
  for (const key of [
    'datetime',
    'start_time_utc',
    'scheduled_time',
    'early_prelims_start_time',
    'prelims_start_time',
    'main_card_start_time',
    'start_time',
    'start_at',
    'start_date',
    'date',
    'game_date',
  ]) {
    const date = row[key]
    if (typeof date === 'string' && Number.isFinite(Date.parse(date)))
      return Date.parse(date)
  }
  return NaN
}
export const identifier = (id: unknown): id is Scalar =>
  (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
  (typeof id === 'string' && /^[1-9]\d*$/.test(id))

export function captured(history: History, sources: readonly string[]) {
  return sources.flatMap((label) => (history.get(label) ?? []).flatMap(rows))
}
type Parameter = {
  name: string
  in: string
  required?: boolean
  schema?: { type?: string; enum?: Scalar[]; items?: { enum?: Scalar[] } }
}
type Spec = {
  openapi: string
  servers: { url: string }[]
  components?: { parameters?: Record<string, Parameter> }
  paths: Record<
    string,
    { get?: { parameters?: (Parameter | { $ref: string })[] } }
  >
}
type Endpoint = { path: string; fields: Map<string, Parameter> }

export class LeaguePlan {
  readonly steps: PlanStep[] = []
  readonly endpoints = new Map<string, Endpoint>()
  readonly season: number
  readonly previous: number
  schedule = ''
  scheduleSources: string[] = []

  constructor(
    readonly league: BdlLeagueKey,
    specDir: string,
    readonly now: Date
  ) {
    const entry = BDL_LEAGUES[league]
    const doc: Spec = parse(
      readFileSync(join(specDir, entry.specSlug + '.yml'), 'utf8')
    )
    const server = new URL(doc.servers[0].url)
    if (
      !doc.openapi.startsWith('3.') ||
      server.origin !== 'https://api.balldontlie.io'
    )
      throw new Error('Invalid spec for ' + league)
    for (const [route, op] of Object.entries(doc.paths)) {
      if (!op.get) continue
      const path = server.pathname.replace(/\/$/, '') + route
      const prefix = '/' + league + '/v'
      if (!path.startsWith(prefix))
        throw new Error('Unexpected provider path for ' + league + ': ' + path)
      const name = path.slice(prefix.length).replace(/^\d+\//, '')
      const fields = new Map<string, Parameter>()
      for (const item of op.get.parameters ?? []) {
        const p =
          '$ref' in item
            ? doc.components?.parameters?.[item.$ref.split('/').pop() ?? '']
            : item
        if (!p) throw new Error('Unknown parameter reference in ' + path)
        if (p.in === 'query') fields.set(p.name.replace(/\[\]$/, ''), p)
      }
      // PGA publishes v1 and v2 operations for some of the same resources.
      if (!this.endpoints.has(name) || path.startsWith(entry.apiBase + '/'))
        this.endpoints.set(name, { path, fields })
    }
    const year = now.getUTCFullYear()
    const startYear =
      entry.seasonConvention === 'start-year' ||
      entry.seasonConvention === 'start-year-minus-one'
    this.season =
      league === 'fifa/worldcup'
        ? year - ((year - 2022) % 4)
        : year - Number(startYear && now.getUTCMonth() < 6)
    this.previous = this.season - (league === 'fifa/worldcup' ? 4 : 1)
  }

  has(name: string, field?: string) {
    const op = this.endpoints.get(name)
    return field ? !!op?.fields.has(field) : !!op
  }
  request(
    name: string,
    values: Params = {},
    pathId?: Scalar,
    raw = false
  ): PlanRequest {
    const op = this.endpoints.get(name)
    if (!op) throw new Error('No GET ' + name + ' in ' + this.league)
    const params: Params = {}
    if (op.fields.has('per_page')) params.per_page = 100
    for (const [key, value] of Object.entries(values)) {
      const p = op.fields.get(key.replace(/\[\]$/, ''))
      if (!p && !raw)
        throw new Error('Unspecified query ' + key + ' on ' + op.path)
      const array = p?.schema?.type === 'array' || p?.name.endsWith('[]')
      const wire = raw ? key : array ? key.replace(/\[\]$/, '') + '[]' : key
      params[wire] =
        !raw && array && !Array.isArray(value) ? [value as Scalar] : value
    }
    for (const [key, field] of op.fields) {
      if (field.required && !(key in params) && !(key + '[]' in params))
        throw new Error('Missing ' + key + ' on ' + op.path)
    }
    const path =
      pathId === undefined ? op.path : op.path.replace('{id}', String(pathId))
    if (path.includes('{')) throw new Error('Missing path parameter on ' + path)
    return { league: this.league, path, params }
  }

  add(
    label: string,
    name: string,
    values: Params = {},
    paginate = false,
    raw = false
  ) {
    const preview = this.request(name, values, undefined, raw)
    return this.step(
      label,
      preview,
      paginate && this.has(name, 'cursor'),
      () => [preview]
    )
  }

  step(
    label: string,
    preview: PlanRequest,
    paginate: boolean,
    resolve: PlanStep['resolve'],
    dependsOn?: readonly string[]
  ) {
    const key = this.league + ' ' + label
    this.steps.push({ label: key, preview, paginate, resolve, dependsOn })
    return key
  }

  bound(
    label: string,
    name: string,
    field: string,
    sources: readonly string[],
    select: (records: Row[]) => Scalar[],
    extra: Params = {},
    paginate = false,
    raw = false
  ) {
    const make = (value: Scalar | Scalar[]) =>
      field === '{id}'
        ? this.request(name, extra, value as Scalar)
        : this.request(name, { ...extra, [field]: value }, undefined, raw)
    const p = this.endpoints.get(name)?.fields.get(field.replace(/\[\]$/, ''))
    const multiple =
      p?.schema?.type === 'array' ||
      !!p?.name.endsWith('[]') ||
      field.endsWith('[]')
    return this.step(
      label,
      make(
        '<' + field.replace(/[{}]/g, '') + ' from ' + sources.join(', ') + '>'
      ),
      paginate && this.has(name, 'cursor'),
      (history) => {
        const ids = [...new Set(select(captured(history, sources)))]
        if (!multiple) return ids.map((id) => make(id))
        // Bound URL size for seasons with hundreds of tournaments or cards.
        const requests: PlanRequest[] = []
        for (let i = 0; i < ids.length; i += 40)
          requests.push(make(ids.slice(i, i + 40)))
        return requests
      },
      sources
    )
  }
}
export const ids = (records: Row[]) =>
  records.map((row) => row.id).filter(identifier)
export const dateOffset = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86400000).toISOString().slice(0, 10)
export const sample =
  (now: Date, side: 'past' | 'upcoming', limit = 1) =>
  (records: Row[]) => {
    const timed = records.flatMap((row) => {
      const start = timestamp(row)
      if (!Number.isFinite(start)) return []
      const state = String(row.status_state ?? row.status ?? '').toLowerCase()
      if (/cancel|postpone|abandon|suspend/.test(state)) return []
      const end =
        typeof row.end_date === 'string' ? Date.parse(row.end_date) : NaN
      if (
        side === 'past' &&
        (['scheduled', 'in_progress', 'live'].includes(state) ||
          end > now.getTime())
      )
        return []
      if (
        side === 'upcoming' &&
        ['final', 'completed', 'finished'].includes(state)
      )
        return []
      // A scheduled date without a clock does not establish that today's event
      // started at midnight; keep it eligible for today's upcoming sample.
      const sameDay =
        new Date(start).toISOString().slice(0, 10) ===
        now.toISOString().slice(0, 10)
      const upcoming =
        start >= now.getTime() || (state === 'scheduled' && sameDay)
      return (side === 'upcoming') === upcoming ? [{ row, time: start }] : []
    })
    timed.sort((a, b) => (side === 'past' ? b.time - a.time : a.time - b.time))
    return [...new Set(ids(timed.map((x) => x.row)))].slice(0, limit)
  }

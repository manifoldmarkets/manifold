/**
 * HTTP client for BALLDONTLIE's Formula 1 API (api.balldontlie.io/f1/v1).
 * The shapes and the market logic live in common/f1-markets.ts; this file
 * only fetches.
 *
 * Tiers: /events and /drivers are free; /sessions, /session_results and the
 * standings need the F1 ALL-STAR plan (60 requests a minute); qualifying
 * times and futures odds need GOAT. Paid tiers are per sport. A daily
 * creation run reads the season's events, their sessions and the standings
 * (a handful of calls); resolving reads one session's results. Nothing here
 * polls on a timer.
 *
 * Docs: https://f1.balldontlie.io/
 */

import {
  F1DriverStanding,
  F1Event,
  F1Session,
  F1SessionResult,
  F1TeamStanding,
} from 'common/f1-markets'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { calendarPhaseKey, SPORTS_CALENDAR } from 'common/sports-calendar'
import { isProd, log } from 'shared/utils'
import { sendDevBdlRequest } from './bdl/dev-admission'
import { f1ServiceRole, useSharedF1Client } from './bdl/f1-read-role'
import {
  F1ReadEvidenceError,
  validF1Id,
  verifiedF1Sessions,
} from './bdl/f1-read-evidence'

const BASE_URL = 'https://api.balldontlie.io/f1/v1'

export function getF1ClientStatus():
  | 'ready'
  | 'missing-key'
  | 'rollout-disabled' {
  if (!process.env.BALLDONTLIE_API_KEY) return 'missing-key'
  return isProd() || isSportsBdlEnabled() ? 'ready' : 'rollout-disabled'
}

async function devF1Enabled() {
  if (!isSportsBdlEnabled()) return false
  const { createSupabaseDirectClient } = await import('./supabase/init')
  const { getCompetitionSwitches } = await import(
    './supabase/sports-competition-switches'
  )
  const switches = await getCompetitionSwitches(createSupabaseDirectClient())
  return SPORTS_CALENDAR.some(
    (phase) =>
      phase.provider === 'bdl-f1' && switches[calendarPhaseKey(phase)] === true
  )
}

function apiKey(): string {
  const key = process.env.BALLDONTLIE_API_KEY ?? ''
  if (!key) throw new Error('BALLDONTLIE_API_KEY env var is not set')
  return key
}

// A hung connection would otherwise stall the scheduler job that made the
// call, with nothing in the logs.
const FETCH_TIMEOUT_MS = 15_000
/** The most the API returns per page. */
const PER_PAGE = 100
/** Pages one call follows; a season has ~25 events and ~125 sessions. */
const MAX_PAGES = 10

type Page<T> = { data: T[]; meta?: { next_cursor?: string | number | null } }

/**
 * A non-2xx response. A 401 is a missing or invalid key, or a plan without
 * the endpoint; a free endpoint (/events) tells the two apart.
 */
export class BalldontlieError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'BalldontlieError'
  }
}

/**
 * Every page of a list endpoint. Array parameters go as `name[]=`, the
 * way the API reads them.
 */
async function getAll<T>(
  path: string,
  params: Record<string, string | string[]>,
  matches: (row: T) => boolean
): Promise<T[]> {
  if (useSharedF1Client()) {
    if (
      Object.values(params)
        .flat()
        .some(
          (id) => !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))
        )
    )
      throw new Error('Invalid F1 season or identifier')
    // Keep service accounting and the existing dev phase/admission checks.
    // Fixture mode is keyless. The shared transport enforces LOCAL_ONLY.
    const { createBdlClient, BdlHttpError } = await import(
      './balldontlie-client'
    )
    const fixture = !!process.env.BDL_FIXTURE_DIR
    const prod = isProd()
    const client = createBdlClient({
      key: fixture ? undefined : apiKey(),
      role: fixture ? 'codex' : prod ? f1ServiceRole() : 'dev',
      enabledLeagues: new Set(['f1']),
      isLeagueEnabled: async () =>
        useSharedF1Client() && (prod || (await devF1Enabled())),
    })
    try {
      return await client.getAll<T>('/f1/v1/' + path, params, {
        maxPages: MAX_PAGES,
        matches: (row) => {
          const valid = matches(row)
          if (!valid && (path === 'sessions' || path === 'session_results'))
            throw new F1ReadEvidenceError(
              path,
              'The F1 provider ignored the requested filter for ' + path
            )
          return valid
        },
      })
    } catch (err) {
      // The F1 jobs distinguish a refused entitlement from an empty field.
      if (err instanceof BdlHttpError)
        throw new BalldontlieError(err.message, err.status)
      throw err
    }
  }
  const out: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${BASE_URL}/${path}`)
    for (const [name, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(`${name}[]`, v)
      } else {
        url.searchParams.set(name, value)
      }
    }
    url.searchParams.set('per_page', String(PER_PAGE))
    if (cursor) url.searchParams.set('cursor', cursor)

    const prod = isProd()
    const send = () =>
      fetch(url.toString(), {
        headers: { Authorization: apiKey() },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // Each dev HTTP request needs its own shared admission.
        ...(!prod && { redirect: 'error' as const }),
      })
    if (!prod && !isSportsBdlEnabled())
      throw new Error('[sports-bdl-client] League disabled')
    const res = prod
      ? await send()
      : await sendDevBdlRequest('f1', devF1Enabled, send)
    if (!res.ok) {
      const why =
        res.status === 401
          ? ' (no key, or a plan without this endpoint)'
          : res.status === 429
          ? ' (rate limited)'
          : ''
      throw new BalldontlieError(
        `BALLDONTLIE /f1/${path} error: ${res.status} ${res.statusText}${why}`,
        res.status
      )
    }
    const body = (await res.json()) as Page<T>
    if (!Array.isArray(body?.data)) {
      throw new Error(`BALLDONTLIE /f1/${path}: response has no data array`)
    }
    out.push(...body.data)
    const next = body.meta?.next_cursor
    if (next === undefined || next === null || next === '') return out
    cursor = String(next)
  }
  log.error(`[balldontlie] /f1/${path} ran past ${MAX_PAGES} pages`)
  throw new Error(`BALLDONTLIE /f1/${path}: more than ${MAX_PAGES} pages`)
}

/** A season's race weekends (free tier). */
export const getF1Events = (season: number) =>
  getAll<F1Event>(
    'events',
    { season: String(season) },
    (row) => row?.season === season
  )

/** The sessions of the given weekends, every type (ALL-STAR). */
export const getF1Sessions = async (eventIds: number[]) => {
  if (eventIds.length === 0) return []
  const shared = useSharedF1Client()
  const rows = await getAll<F1Session>(
    'sessions',
    { event_ids: eventIds.map(String) },
    (row) => eventIds.includes(row?.event?.id)
  )
  return shared ? verifiedF1Sessions(rows) : rows
}

/** One session's classification, about ten minutes after it ends (ALL-STAR). */
export const getF1SessionResults = (sessionId: number) =>
  getAll<F1SessionResult>(
    'session_results',
    {
      session_ids: [String(sessionId)],
    },
    (row) => {
      if (row?.session?.id !== sessionId) return false
      const driverId = row.driver?.id
      if (!Number.isSafeInteger(driverId) || driverId <= 0)
        throw new F1ReadEvidenceError(
          'session_results',
          'The F1 classification contains an unidentified driver'
        )
      return true
    }
  )

/**
 * The season's drivers with their points (ALL-STAR): the entry list and the
 * prior. The only roster source: /drivers lists everyone on file since 2018
 * with no season filter, so it can't say who is racing this year.
 */
export const getF1DriverStandings = (season: number) =>
  getAll<F1DriverStanding>(
    'driver_standings',
    { season: String(season) },
    (row) => {
      if (row?.season !== season) return false
      if (!validF1Id(row.driver?.id))
        throw new F1ReadEvidenceError(
          'driver_standings',
          'The F1 standings contain an unidentified driver'
        )
      return true
    }
  )

/** The season's teams with their points (ALL-STAR). */
export const getF1TeamStandings = (season: number) =>
  getAll<F1TeamStanding>(
    'team_standings',
    { season: String(season) },
    (row) => {
      if (row?.season !== season) return false
      if (!validF1Id(row.team?.id))
        throw new F1ReadEvidenceError(
          'team_standings',
          'The F1 standings contain an unidentified team'
        )
      return true
    }
  )

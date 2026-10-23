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
} from 'common/f1-markets'
import { log } from 'shared/utils'

const BASE_URL = 'https://api.balldontlie.io/f1/v1'

export const hasBalldontlieKey = () => !!process.env.BALLDONTLIE_API_KEY

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
 * Every page of a list endpoint. Array parameters go as `name[]=`, the
 * way the API reads them.
 */
async function getAll<T>(
  path: string,
  params: Record<string, string | string[]>
): Promise<T[]> {
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

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey() },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      const why =
        res.status === 401
          ? ' (no key, or a plan without this endpoint)'
          : res.status === 429
          ? ' (rate limited)'
          : ''
      throw new Error(
        `BALLDONTLIE /f1/${path} error: ${res.status} ${res.statusText}${why}`
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
  getAll<F1Event>('events', { season: String(season) })

/** The sessions of the given weekends, every type (ALL-STAR). */
export const getF1Sessions = (eventIds: number[]) =>
  eventIds.length === 0
    ? Promise.resolve([] as F1Session[])
    : getAll<F1Session>('sessions', { event_ids: eventIds.map(String) })

/** One session's classification, about ten minutes after it ends (ALL-STAR). */
export const getF1SessionResults = (sessionId: number) =>
  getAll<F1SessionResult>('session_results', {
    session_ids: [String(sessionId)],
  })

/**
 * The season's drivers with their points (ALL-STAR): the entry list and the
 * prior. The only roster source: /drivers lists everyone on file since 2018
 * with no season filter, so it can't say who is racing this year.
 */
export const getF1DriverStandings = (season: number) =>
  getAll<F1DriverStanding>('driver_standings', { season: String(season) })

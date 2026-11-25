import type { SportsDataProvider } from '../sports-provider'
import type { BDL_REQUESTS_PER_MINUTE } from './constants'

/** Lifetime HTTP responses for one published endpoint and process role. */
export type BdlOperatorRequests = {
  provider: SportsDataProvider
  endpoint: string
  role: keyof typeof BDL_REQUESTS_PER_MINUTE
  lastRequest: string
  lastSuccess: string | null
  status: number
  /** Decimal strings preserve the database's full bigint range. */
  successes: string
  unauthorized: string
  throttled: string
  other: string
  remaining: number | null
  limit: number | null
}

export type BdlOperatorPhase = {
  competitionId: string
  competition: string
  phase: string
  provider: 'odds' | 'bdl'
  startDate: string
  endDate: string
  on: boolean
  defaultOn: boolean
  locked?: string
}

export type BdlOperatorLeague = {
  league: string
  /** Null when the legacy Odds calendar has no verified league mapping. */
  openOdds: number | null
  /** Unresolved Odds moneylines whose trading window has closed. */
  closedOdds: number | null
  phases: BdlOperatorPhase[]
  requests: BdlOperatorRequests[]
  /** The response aggregates have no vendor observation time or recorder health signal. */
  vendorFreshness: null
  recorderStatus: null
}

export type BdlOperatorPanel = { leagues: BdlOperatorLeague[] }

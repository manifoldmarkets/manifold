import { BDL_LEAGUES, isBdlLeagueKey } from 'common/bdl/leagues'
import {
  isSportsDataProvider,
  type SportsDataProvider,
} from 'common/sports-provider'
import { matchBdlEndpoint } from '../balldontlie-request'
import { log } from '../monitoring/log'
import type { SupabaseDirectClient } from '../supabase/init'

export type BdlServiceRole = 'scheduler' | 'api' | 'dev'
type ResponseMetadata = {
  request: { path: string; at: string }
  status: number
  rateLimit: { limit: number | null; remaining: number | null }
}

// Bounded route vocabulary for schedule, results, team directories and prices.
// Never persist a caller-provided resource, ID, query, or response body.
const serviceResources = new Set([
  'games',
  'games/{id}',
  'matches',
  'matches/{id}',
  'plays',
  'box_scores',
  'box_scores/live',
  'scoring',
  'standings',
  'group_standings',
  'teams',
  'teams/{id}',
  'teams/{id}/roster',
  'rosters',
])
const priceResources = new Set(['odds', 'odds/opening'])

export function bdlStatsEndpoint(path: string) {
  const parsed = matchBdlEndpoint(path)
  if (!parsed || !isBdlLeagueKey(parsed.league)) return
  const { league, version, resource } = parsed
  const template = resource
    .split('/')
    .map((s) => (/^[1-9]\d*$/.test(s) ? '{id}' : s))
    .join('/')
  if (isBdlStatsRoute(league, version, template))
    return { league, template: version + '/' + template }
  return undefined
}

function isBdlStatsRoute(league: string, version: string, resource: string) {
  if (!isBdlLeagueKey(league)) return false
  const config = BDL_LEAGUES[league]
  const base = priceResources.has(resource)
    ? config.oddsApiBase
    : serviceResources.has(resource)
    ? config.apiBase
    : null
  return base === '/' + league + '/' + version
}

type StatsKey = {
  provider: SportsDataProvider
  league: string
  template: string
}
type ResponseObservation = Pick<ResponseMetadata, 'status' | 'rateLimit'> & {
  at: string
}

/** Each source supplies its own classified template. Never pass raw request parameters. */
function isStatsKey({ provider, league, template }: StatsKey) {
  if (
    !isSportsDataProvider(provider) ||
    typeof league !== 'string' ||
    league.length > 64 ||
    !/^[A-Za-z0-9]/.test(league) ||
    /[^A-Za-z0-9/_-]/.test(league) ||
    typeof template !== 'string' ||
    !template.trim() ||
    [...template].length > 128 ||
    /[?\p{Cc}]/u.test(template)
  )
    return false
  if (provider !== 'bdl') return true
  const slash = template.indexOf('/')
  return (
    slash > 0 &&
    isBdlStatsRoute(league, template.slice(0, slash), template.slice(slash + 1))
  )
}

type Issue =
  | 'connection failed'
  | 'unclassified response'
  | 'accounting write failed'
const lastWarning = new Map<string, number>()
export function reportBdlRequestIssue(role: BdlServiceRole, issue: Issue) {
  const key = role + ':' + issue
  const now = Date.now()
  if (now - (lastWarning.get(key) ?? -Infinity) < 60_000) return
  lastWarning.set(key, now)
  log.warn('[sports-bdl-client] ' + issue, { role })
}

export async function recordBdlAttempt(
  pg: Pick<SupabaseDirectClient, 'none'>,
  role: BdlServiceRole,
  attempt: ResponseMetadata
) {
  const route = bdlStatsEndpoint(attempt.request.path)
  if (!route) {
    reportBdlRequestIssue(role, 'unclassified response')
    return
  }
  return recordSportsProviderResponse(pg, { provider: 'bdl', ...route }, role, {
    at: attempt.request.at,
    status: attempt.status,
    rateLimit: attempt.rateLimit,
  })
}

export async function recordSportsProviderResponse(
  pg: Pick<SupabaseDirectClient, 'none'>,
  route: StatsKey,
  role: BdlServiceRole,
  attempt: ResponseObservation
) {
  if (!isStatsKey(route))
    throw new Error('Invalid sports request statistics key')
  const quota = (value: number | null) =>
    value !== null &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2147483647
      ? value
      : null
  const { status } = attempt
  const success = Number(status >= 200 && status < 300)
  const unauthorized = Number(status === 401)
  const throttled = Number(status === 429)
  await pg.none(
    `insert into sports_provider_request_stats as s
      (provider,league_key,endpoint_template,process_role,success_count,unauthorized_count,rate_limited_count,other_count,
       last_status,last_request_at,last_success_at,quota_limit,quota_remaining)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $5::integer=1 then $10::timestamptz end,$11,$12)
     on conflict (provider,league_key,endpoint_template,process_role) do update set
       success_count=s.success_count+excluded.success_count,
       unauthorized_count=s.unauthorized_count+excluded.unauthorized_count,
       rate_limited_count=s.rate_limited_count+excluded.rate_limited_count, other_count=s.other_count+excluded.other_count,
       last_success_at=greatest(s.last_success_at,excluded.last_success_at),
       last_status=case when excluded.last_request_at>=s.last_request_at then excluded.last_status else s.last_status end,
       quota_limit=case when excluded.last_request_at>=s.last_request_at then excluded.quota_limit else s.quota_limit end,
       quota_remaining=case when excluded.last_request_at>=s.last_request_at then excluded.quota_remaining else s.quota_remaining end,
       last_request_at=greatest(s.last_request_at,excluded.last_request_at)`,
    [
      route.provider,
      route.league,
      route.template,
      role,
      success,
      unauthorized,
      throttled,
      1 - success - unauthorized - throttled,
      status,
      attempt.at,
      quota(attempt.rateLimit.limit),
      quota(attempt.rateLimit.remaining),
    ]
  )
}

// Loading the service database is deferred until there is a classified HTTP response.
const serviceStats: Pick<SupabaseDirectClient, 'none'> = {
  none: async (statement, values) => {
    const { createSupabaseDirectClient } = await import('../supabase/init')
    return createSupabaseDirectClient().tx(async (tx) => {
      await tx.none("set local statement_timeout = '2s'")
      return tx.none(statement, values)
    })
  },
}

export async function recordServiceBdlResponse(
  role: BdlServiceRole,
  attempt: ResponseMetadata
) {
  try {
    await recordBdlAttempt(serviceStats, role, attempt)
  } catch {
    // A missing migration or temporarily unavailable database must not retry a provider call.
    reportBdlRequestIssue(role, 'accounting write failed')
  }
}
